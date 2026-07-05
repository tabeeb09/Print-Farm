import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const CREDS_FILE = process.env.PRINT_WORKER_OPENBAO_CREDS_FILE || "/config/openbao-approle.env";
const WORKER_ENV_FILE = process.env.PRINT_WORKER_RUNTIME_ENV_FILE || "/config/print-worker.env";
const DEFAULT_SECRET_PATH = process.env.BAO_SECRET_PATH_PRINT_WORKER || "print-worker/prod";

const requiredKeys = [
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_PRIVATE_BUCKET",
  "S3_REGION",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
];

function parseEnvBlock(text) {
  const result = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const equalsIndex = line.indexOf("=");
    if (equalsIndex < 1) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (key) result[key] = value;
  }
  return result;
}

async function readFileEnv(filePath) {
  const text = await fs.readFile(filePath, "utf8");
  return parseEnvBlock(text);
}

async function loadApprole() {
  const creds = await readFileEnv(CREDS_FILE);
  const baoAddr = creds.BAO_ADDR;
  const roleId = creds.OPENBAO_ROLE_ID || creds.BAO_ROLE_ID;
  const secretId = creds.OPENBAO_SECRET_ID || creds.BAO_SECRET_ID;
  const kvMount = creds.BAO_KV_MOUNT || process.env.BAO_KV_MOUNT || "kv";
  const approlePath = creds.BAO_APPROLE_AUTH_PATH || process.env.BAO_APPROLE_AUTH_PATH || "approle";
  const secretPath = process.env.BAO_SECRET_PATH_PRINT_WORKER || creds.BAO_SECRET_PATH_PRINT_WORKER || DEFAULT_SECRET_PATH;

  if (!baoAddr || !roleId || !secretId) {
    throw new Error(`OpenBao AppRole bootstrap file is incomplete: ${CREDS_FILE}`);
  }

  return { baoAddr, roleId, secretId, kvMount, approlePath, secretPath };
}

async function loginWithAppRole(config) {
  const response = await fetch(`${config.baoAddr}/v1/auth/${config.approlePath}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role_id: config.roleId,
      secret_id: config.secretId,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenBao AppRole login failed (${response.status}).`);
  }

  const payload = await response.json();
  const token = payload?.auth?.client_token;
  if (!token) {
    throw new Error("OpenBao AppRole login did not return a client token.");
  }
  return token;
}

async function readSecret(token, config) {
  const response = await fetch(`${config.baoAddr}/v1/${config.kvMount}/data/${config.secretPath}`, {
    headers: { "X-Vault-Token": token },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    throw new Error(`OpenBao read failed (${response.status}) for ${config.secretPath}.`);
  }

  const payload = await response.json();
  return payload?.data?.data ?? null;
}

async function writeSecret(token, config, values) {
  const response = await fetch(`${config.baoAddr}/v1/${config.kvMount}/data/${config.secretPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Token": token,
    },
    body: JSON.stringify({ data: values }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenBao write failed (${response.status}) for ${config.secretPath}: ${text}`);
  }
}

async function promptForSecret() {
  const rl = readline.createInterface({ input, output });
  try {
    const values = {};
    values.S3_ENDPOINT = (await rl.question("S3_ENDPOINT: ")).trim();
    values.S3_PUBLIC_ENDPOINT = (await rl.question("S3_PUBLIC_ENDPOINT: ")).trim();
    values.S3_PRIVATE_BUCKET = (await rl.question("S3_PRIVATE_BUCKET: ")).trim();
    values.S3_REGION = (await rl.question("S3_REGION [us-east-1]: ")).trim() || "us-east-1";
    values.S3_ACCESS_KEY_ID = (await rl.question("S3_ACCESS_KEY_ID: ")).trim();
    values.S3_SECRET_ACCESS_KEY = (await rl.question("S3_SECRET_ACCESS_KEY: ")).trim();
    return values;
  } finally {
    rl.close();
  }
}

function missingKeys(values) {
  return requiredKeys.filter((key) => !values?.[key]);
}

async function writeEnvFile(values) {
  await fs.mkdir(path.dirname(WORKER_ENV_FILE), { recursive: true });
  const lines = requiredKeys
    .filter((key) => values[key])
    .map((key) => `${key}=${values[key]}`);
  await fs.writeFile(WORKER_ENV_FILE, `${lines.join("\n")}\n`, { mode: 0o600 });
}

async function main() {
  const config = await loadApprole();
  const token = await loginWithAppRole(config);
  let secret = await readSecret(token, config);

  if (!secret || missingKeys(secret).length) {
    const interactive =
      process.stdin.isTTY &&
      process.stdout.isTTY &&
      !process.env.PRINT_WORKER_NONINTERACTIVE;

    if (!interactive) {
      throw new Error(
        `OpenBao worker secret ${config.secretPath} is missing or incomplete, and the container is not interactive.`,
      );
    }

    const values = await promptForSecret();
    if (missingKeys(values).length) {
      throw new Error("OpenBao worker secret bootstrap aborted: missing required fields.");
    }

    await writeSecret(token, config, values);
    secret = values;
    console.log(`[openbao] wrote worker secret to ${config.secretPath}`);
  } else {
    console.log(`[openbao] loaded worker secret from ${config.secretPath}`);
  }

  await writeEnvFile(secret);
  console.log(`[openbao] wrote worker env file to ${WORKER_ENV_FILE}`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
