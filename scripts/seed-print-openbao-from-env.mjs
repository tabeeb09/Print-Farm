import fs from "node:fs";

const sourceArgIndex = process.argv.indexOf("--source");
const sourcePath = sourceArgIndex === -1 ? "" : process.argv[sourceArgIndex + 1];
const addr = process.env.BAO_ADDR;
const kvMount = process.env.BAO_KV_MOUNT || "kv";
const appRolePath = process.env.BAO_APPROLE_AUTH_PATH || "approle";
const roleId = process.env.OPENBAO_ROLE_ID || process.env.BAO_ROLE_ID;
const secretId = process.env.OPENBAO_SECRET_ID || process.env.BAO_SECRET_ID;
const token = process.env.BAO_TOKEN || process.env.BAO_DEV_ROOT_TOKEN;
const printPath = process.env.BAO_SECRET_PATH_PRINT || "print/prod";

const printKeys = [
  "NEXTAUTH_URL",
  "NEXTAUTH_SECRET",
  "APP_BASE_URL",
  "KEYCLOAK_ISSUER",
  "KEYCLOAK_CLIENT_ID",
  "KEYCLOAK_CLIENT_SECRET",
  "S3_ENDPOINT",
  "S3_PUBLIC_ENDPOINT",
  "S3_PRIVATE_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
  "STRIPE_SECRET_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "FILE_UPLOAD_MAX_BYTES",
  "FILE_ALLOWED_EXTENSIONS",
];

function parseEnvFile(filePath) {
  const values = {};
  if (!filePath || !fs.existsSync(filePath)) return values;

  const raw = fs.readFileSync(filePath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    values[line.slice(0, index)] = line.slice(index + 1);
  }

  return values;
}

async function login() {
  if (token) return token;
  if (!addr || !roleId || !secretId) {
    throw new Error("BAO_ADDR and OpenBao AppRole credentials are required.");
  }

  const response = await fetch(`${addr}/v1/auth/${appRolePath}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
  });

  if (!response.ok) {
    throw new Error(`OpenBao AppRole login failed (${response.status}).`);
  }

  const payload = await response.json();
  return payload?.auth?.client_token;
}

async function writeSecret(clientToken, values) {
  const response = await fetch(`${addr}/v1/${kvMount}/data/${printPath}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Token": clientToken,
    },
    body: JSON.stringify({ data: values }),
  });

  if (!response.ok) {
    throw new Error(`Failed to seed ${kvMount}/data/${printPath} (${response.status}).`);
  }
}

async function main() {
  if (!sourcePath || !fs.existsSync(sourcePath)) return;

  const source = parseEnvFile(sourcePath);
  const values = Object.fromEntries(printKeys.filter((key) => source[key]).map((key) => [key, source[key]]));
  if (!Object.keys(values).length) return;

  const clientToken = await login();
  await writeSecret(clientToken, values);
  console.log(`Seeded ${kvMount}/data/${printPath} from ${sourcePath}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
