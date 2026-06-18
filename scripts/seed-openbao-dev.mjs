import fs from "node:fs";

const envFile = process.argv.includes("--from-runtime") ? ".env.runtime" : ".env.local";
const rootDir = process.cwd();
const envPath = `${rootDir}/${envFile}`;
const openBaoAddr = process.env.BAO_ADDR || "http://localhost:8200";
const token = process.env.BAO_TOKEN || process.env.OPENBAO_DEV_ROOT_TOKEN || "dev-only-root-token";

const pathConfig = {
  website: process.env.BAO_SECRET_PATH_WEBSITE || "website/prod",
  rustfs: process.env.BAO_SECRET_PATH_RUSTFS || "rustfs/prod",
  oauth2Proxy: process.env.BAO_SECRET_PATH_OAUTH2_PROXY || "oauth2-proxy/prod",
  keycloak: process.env.BAO_SECRET_PATH_KEYCLOAK || "keycloak/prod",
};

const keyGroups = {
  website: [
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "NEXT_PUBLIC_SITE_URL",
    "KEYCLOAK_ISSUER",
    "KEYCLOAK_CLIENT_ID",
    "KEYCLOAK_CLIENT_SECRET",
    "KEYCLOAK_REQUIRED_MEDIA_ROLES",
    "KEYCLOAK_ROLE_CLAIM_PATH",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ],
  rustfs: [
    "NEXT_PUBLIC_MEDIA_BASE_URL",
    "S3_ENDPOINT",
    "S3_PUBLIC_ENDPOINT",
    "S3_BUCKET",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ],
  oauth2Proxy: [
    "OAUTH2_PROXY_CLIENT_ID",
    "OAUTH2_PROXY_CLIENT_SECRET",
    "OAUTH2_PROXY_COOKIE_SECRET",
    "OAUTH2_PROXY_ALLOWED_ROLE",
    "OAUTH2_PROXY_REDIRECT_URL",
  ],
  keycloak: [
    "KEYCLOAK_ADMIN_REALM",
    "KEYCLOAK_ADMIN_CLIENT_ID",
    "KEYCLOAK_ADMIN_CLIENT_SECRET",
    "KEYCLOAK_ADMIN_USERNAME",
    "KEYCLOAK_ADMIN_PASSWORD",
    "KEYCLOAK_DB_PASSWORD",
    "KEYCLOAK_ADMIN_USER",
    "KEYCLOAK_BOOTSTRAP_ADMIN_PASSWORD",
  ],
};

function parseEnvFile(filePath) {
  const env = {};
  const raw = fs.readFileSync(filePath, "utf8");

  for (const line of raw.split(/\r?\n/)) {
    if (!line || line.trim().startsWith("#")) continue;
    const index = line.indexOf("=");
    if (index === -1) continue;
    env[line.slice(0, index)] = line.slice(index + 1);
  }

  return env;
}

async function fetchJson(url, init = {}) {
  let response;

  try {
    response = await fetch(url, init);
  } catch (error) {
    throw new Error(`Failed to reach OpenBao at ${url}: ${error.message}`);
  }

  const text = await response.text();

  return {
    ok: response.ok,
    status: response.status,
    body: text ? JSON.parse(text) : {},
  };
}

async function ensureKvV2Mount() {
  const mounts = await fetchJson(`${openBaoAddr}/v1/sys/mounts`, {
    headers: { "X-Vault-Token": token },
  });

  if (!mounts.ok) {
    throw new Error(`Failed to read OpenBao mounts (${mounts.status}).`);
  }

  if (mounts.body["kv/"]) {
    return;
  }

  const created = await fetchJson(`${openBaoAddr}/v1/sys/mounts/kv`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Token": token,
    },
    body: JSON.stringify({
      type: "kv",
      options: { version: "2" },
    }),
  });

  if (!created.ok && created.status !== 204) {
    throw new Error(`Failed to enable kv-v2 mount (${created.status}).`);
  }
}

async function writeSecret(pathSuffix, values) {
  const payload = {
    data: values,
  };

  let response;

  try {
    response = await fetch(`${openBaoAddr}/v1/kv/data/${pathSuffix}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Vault-Token": token,
      },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    throw new Error(
      `Failed to reach OpenBao while writing kv/data/${pathSuffix}: ${error.message}`,
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to write kv/data/${pathSuffix} (${response.status}).`);
  }
}

async function main() {
  const env = parseEnvFile(envPath);
  await ensureKvV2Mount();

  for (const [group, keys] of Object.entries(keyGroups)) {
    const values = Object.fromEntries(
      keys.filter((key) => env[key]).map((key) => [key, env[key]]),
    );

    await writeSecret(pathConfig[group], values);
    console.log(`Seeded kv/data/${pathConfig[group]} with ${Object.keys(values).length} keys.`);
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
