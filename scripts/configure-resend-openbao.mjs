import fs from "node:fs";

function parseArgs(argv) {
  const result = {};

  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--bootstrap-env") result.bootstrapEnv = argv[++index];
    if (arg === "--path") result.path = argv[++index];
  }

  return result;
}

function parseEnvFile(filePath) {
  const values = {};
  if (!filePath || !fs.existsSync(filePath)) return values;

  for (const rawLine of fs.readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const index = line.indexOf("=");
    if (index === -1) continue;
    values[line.slice(0, index)] = line.slice(index + 1);
  }

  return values;
}

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

async function baoJson(url, options = {}) {
  const response = await fetch(url, options);
  const bodyText = await response.text();
  let body = {};

  if (bodyText) {
    try {
      body = JSON.parse(bodyText);
    } catch {
      body = { raw: bodyText.slice(0, 300) };
    }
  }

  if (!response.ok) {
    throw new Error(`OpenBao ${options.method || "GET"} ${url} failed (${response.status}).`);
  }

  return body;
}

async function getClientToken(config) {
  if (config.token) return config.token;

  const response = await baoJson(`${config.addr}/v1/auth/${config.appRolePath}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role_id: required(config.roleId, "OPENBAO_ROLE_ID"),
      secret_id: required(config.secretId, "OPENBAO_SECRET_ID"),
    }),
  });

  return required(response?.auth?.client_token, "OpenBao client token");
}

async function readSecret(config, token) {
  const response = await baoJson(`${config.addr}/v1/${config.kvMount}/data/${config.path}`, {
    headers: { "X-Vault-Token": token },
  });

  return response?.data?.data || {};
}

async function writeSecret(config, token, values) {
  await baoJson(`${config.addr}/v1/${config.kvMount}/data/${config.path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Token": token,
    },
    body: JSON.stringify({ data: values }),
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const bootstrap = parseEnvFile(args.bootstrapEnv || process.env.OPENBAO_BOOTSTRAP_ENV_FILE);
  const config = {
    addr: (process.env.BAO_ADDR || bootstrap.BAO_ADDR || "").replace(/\/+$/, ""),
    appRolePath: process.env.BAO_APPROLE_AUTH_PATH || bootstrap.BAO_APPROLE_AUTH_PATH || "approle",
    roleId: process.env.OPENBAO_ROLE_ID || process.env.BAO_ROLE_ID || bootstrap.OPENBAO_ROLE_ID || bootstrap.BAO_ROLE_ID,
    secretId: process.env.OPENBAO_SECRET_ID || process.env.BAO_SECRET_ID || bootstrap.OPENBAO_SECRET_ID || bootstrap.BAO_SECRET_ID,
    token: process.env.BAO_TOKEN || process.env.BAO_DEV_ROOT_TOKEN,
    kvMount: process.env.BAO_KV_MOUNT || bootstrap.BAO_KV_MOUNT || "kv",
    path: args.path || process.env.BAO_SECRET_PATH_KEYCLOAK || "keycloak/prod",
  };

  required(config.addr, "BAO_ADDR");
  const resendApiKey = required(process.env.RESEND_API_KEY, "RESEND_API_KEY");
  const fromEmail = required(process.env.RESEND_FROM_EMAIL || process.env.KEYCLOAK_SMTP_FROM, "RESEND_FROM_EMAIL");
  const token = await getClientToken(config);
  const current = await readSecret(config, token);

  await writeSecret(config, token, {
    ...current,
    RESEND_API_KEY: resendApiKey,
    RESEND_FROM_EMAIL: fromEmail,
    KEYCLOAK_SMTP_HOST: "smtp.resend.com",
    KEYCLOAK_SMTP_PORT: "465",
    KEYCLOAK_SMTP_FROM: fromEmail,
    KEYCLOAK_SMTP_USER: "resend",
    KEYCLOAK_SMTP_PASSWORD: resendApiKey,
    KEYCLOAK_SMTP_SSL: "true",
    KEYCLOAK_SMTP_STARTTLS: "false",
    KEYCLOAK_SMTP_AUTH: "true",
    KEYCLOAK_LOGIN_RESET_PASSWORD_ALLOWED:
      process.env.KEYCLOAK_LOGIN_RESET_PASSWORD_ALLOWED ||
      current.KEYCLOAK_LOGIN_RESET_PASSWORD_ALLOWED ||
      "true",
    EMAIL_DAILY_LIMIT: process.env.EMAIL_DAILY_LIMIT || current.EMAIL_DAILY_LIMIT || "95",
    EMAIL_DAILY_ALERT_RECIPIENT_LIMIT:
      process.env.EMAIL_DAILY_ALERT_RECIPIENT_LIMIT ||
      current.EMAIL_DAILY_ALERT_RECIPIENT_LIMIT ||
      "4",
    EMAIL_DAILY_ALERT_RESERVE:
      process.env.EMAIL_DAILY_ALERT_RESERVE ||
      current.EMAIL_DAILY_ALERT_RESERVE ||
      "true",
    PASSWORD_RESET_TOKEN_S3_PREFIX:
      process.env.PASSWORD_RESET_TOKEN_S3_PREFIX ||
      current.PASSWORD_RESET_TOKEN_S3_PREFIX ||
      "private/system/password-reset-tokens",
    PASSWORD_RESET_TOKEN_TTL_MINUTES:
      process.env.PASSWORD_RESET_TOKEN_TTL_MINUTES ||
      current.PASSWORD_RESET_TOKEN_TTL_MINUTES ||
      "30",
  });

  console.log(`Stored Resend SMTP settings in ${config.kvMount}/data/${config.path}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
