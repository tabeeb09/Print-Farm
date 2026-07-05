import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const CREDS_FILE = process.env.PRINT_WORKER_OPENBAO_CREDS_FILE || "/config/openbao-approle.env";

function pick(value, fallback = "") {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

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

async function readExisting() {
  try {
    const text = await fs.readFile(CREDS_FILE, "utf8");
    const parsed = parseEnvBlock(text);
    if (parsed.BAO_ADDR && (parsed.OPENBAO_ROLE_ID || parsed.BAO_ROLE_ID) && (parsed.OPENBAO_SECRET_ID || parsed.BAO_SECRET_ID)) {
      return parsed;
    }
  } catch {}
  return null;
}

async function promptInteractive() {
  const rl = readline.createInterface({ input, output });
  try {
    const baoAddr = pick(process.env.BAO_ADDR) || await rl.question("OpenBao address (BAO_ADDR): ");
    const roleId = pick(process.env.OPENBAO_ROLE_ID) || pick(process.env.BAO_ROLE_ID) || await rl.question("OpenBao AppRole role_id: ");
    const secretId = pick(process.env.OPENBAO_SECRET_ID) || pick(process.env.BAO_SECRET_ID) || await rl.question("OpenBao AppRole secret_id: ");
    const kvMount = pick(process.env.BAO_KV_MOUNT, "kv") || await rl.question("OpenBao KV mount [kv]: ") || "kv";
    const approlePath = pick(process.env.BAO_APPROLE_AUTH_PATH, "approle") || await rl.question("OpenBao AppRole auth path [approle]: ") || "approle";

    return {
      BAO_ADDR: baoAddr.trim(),
      OPENBAO_ROLE_ID: roleId.trim(),
      OPENBAO_SECRET_ID: secretId.trim(),
      BAO_KV_MOUNT: kvMount.trim() || "kv",
      BAO_APPROLE_AUTH_PATH: approlePath.trim() || "approle",
    };
  } finally {
    rl.close();
  }
}

async function writeEnvFile(values) {
  await fs.mkdir(path.dirname(CREDS_FILE), { recursive: true });
  const lines = [
    `BAO_ADDR=${values.BAO_ADDR}`,
    `OPENBAO_ROLE_ID=${values.OPENBAO_ROLE_ID}`,
    `OPENBAO_SECRET_ID=${values.OPENBAO_SECRET_ID}`,
    `BAO_KV_MOUNT=${values.BAO_KV_MOUNT || "kv"}`,
    `BAO_APPROLE_AUTH_PATH=${values.BAO_APPROLE_AUTH_PATH || "approle"}`,
  ];
  await fs.writeFile(CREDS_FILE, `${lines.join("\n")}\n`, { mode: 0o600 });
}

async function main() {
  const existing = await readExisting();
  if (existing) {
    console.log(`[openbao] using existing AppRole credentials file: ${CREDS_FILE}`);
    return;
  }

  const interactive =
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !process.env.PRINT_WORKER_NONINTERACTIVE;

  if (!interactive) {
    throw new Error(
      `OpenBao AppRole file not found at ${CREDS_FILE}. Start the container with a TTY or set PRINT_WORKER_NONINTERACTIVE=1 and provide BAO_ADDR, OPENBAO_ROLE_ID, and OPENBAO_SECRET_ID.`
    );
  }

  const values = await promptInteractive();
  if (!values.BAO_ADDR || !values.OPENBAO_ROLE_ID || !values.OPENBAO_SECRET_ID) {
    throw new Error("OpenBao AppRole bootstrap aborted: missing required values.");
  }
  await writeEnvFile(values);
  console.log(`[openbao] wrote AppRole credentials to ${CREDS_FILE}`);
}

main().catch((error) => {
  console.error(error.message || String(error));
  process.exit(1);
});
