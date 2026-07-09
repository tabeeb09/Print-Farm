import fs from "node:fs";
import path from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");
const groupsArgIndex = process.argv.indexOf("--groups");
const groupsArg =
  groupsArgIndex === -1 ? process.env.BAO_SECRET_GROUPS : process.argv[groupsArgIndex + 1];
const rootDir = process.cwd();
const secretsDir = path.join(rootDir, "secrets");
const statusFile = path.join(secretsDir, "runtime-status.json");

const requiredKeys = {
  website: [
    "AUTH_SECRET",
    "NEXTAUTH_SECRET",
    "NEXTAUTH_URL",
    "NEXT_PUBLIC_SITE_URL",
    "KEYCLOAK_ISSUER",
    "KEYCLOAK_CLIENT_ID",
    "KEYCLOAK_CLIENT_SECRET",
  ],
  rustfs: [
    "NEXT_PUBLIC_MEDIA_BASE_URL",
    "S3_ENDPOINT",
    "S3_PUBLIC_ENDPOINT",
    "S3_BUCKET",
    "S3_PRIVATE_BUCKET",
    "S3_REGION",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ],
  oauth2Proxy: [
    "OAUTH2_PROXY_CLIENT_ID",
    "OAUTH2_PROXY_CLIENT_SECRET",
    "OAUTH2_PROXY_COOKIE_SECRET",
    "OAUTH2_PROXY_REDIRECT_URL",
  ],
  keycloak: [
    "KEYCLOAK_ADMIN_REALM",
    "KEYCLOAK_ADMIN_CLIENT_ID",
  ],
  supabase: [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET",
    "FILE_UPLOAD_MAX_BYTES",
    "FILE_ALLOWED_MIME_TYPES",
    "FILE_ALLOWED_EXTENSIONS",
    "KEYCLOAK_FILE_ADMIN_ROLES",
  ],
  print: [
    "NEXTAUTH_URL",
    "NEXTAUTH_SECRET",
    "KEYCLOAK_ISSUER",
    "KEYCLOAK_CLIENT_ID",
    "KEYCLOAK_CLIENT_SECRET",
    "APP_BASE_URL",
    "S3_ENDPOINT",
    "S3_PUBLIC_ENDPOINT",
    "S3_PRIVATE_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
    "STRIPE_SECRET_KEY",
    "STRIPE_WEBHOOK_SECRET",
    "FILE_UPLOAD_MAX_BYTES",
    "FILE_ALLOWED_EXTENSIONS",
  ],
};

const config = {
  addr: process.env.BAO_ADDR,
  appRoleAuthPath: process.env.BAO_APPROLE_AUTH_PATH || "approle",
  roleId: process.env.OPENBAO_ROLE_ID || process.env.BAO_ROLE_ID,
  secretId: process.env.OPENBAO_SECRET_ID || process.env.BAO_SECRET_ID,
  jwtAuthPath: process.env.BAO_JWT_AUTH_PATH || "jwt",
  jwtRole: process.env.BAO_JWT_ROLE || "github-actions-deploy",
  token: process.env.BAO_TOKEN || process.env.BAO_DEV_ROOT_TOKEN,
  jwtToken: process.env.BAO_JWT_TOKEN,
  jwtTokenFile: process.env.BAO_JWT_TOKEN_FILE,
  kvMount: process.env.BAO_KV_MOUNT || "kv",
  paths: {
    website: process.env.BAO_SECRET_PATH_WEBSITE || "website/prod",
    rustfs: process.env.BAO_SECRET_PATH_RUSTFS || "rustfs/prod",
    oauth2Proxy: process.env.BAO_SECRET_PATH_OAUTH2_PROXY || "oauth2-proxy/prod",
    keycloak: process.env.BAO_SECRET_PATH_KEYCLOAK || "keycloak/prod",
    supabase: process.env.BAO_SECRET_PATH_SUPABASE || "supabase/prod",
    print: process.env.BAO_SECRET_PATH_PRINT || "print/prod",
  },
};

const selectedGroups = (groupsArg || "website,rustfs,oauth2Proxy,keycloak,supabase")
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

function readJwt() {
  if (config.token || (config.roleId && config.secretId)) {
    return null;
  }

  if (config.jwtToken) {
    return config.jwtToken;
  }

  if (config.jwtTokenFile) {
    return fs.readFileSync(config.jwtTokenFile, "utf8").trim();
  }

  throw new Error(
    "Provide BAO_TOKEN, AppRole credentials (OPENBAO_ROLE_ID and OPENBAO_SECRET_ID), or BAO_JWT_TOKEN / BAO_JWT_TOKEN_FILE.",
  );
}

async function loginWithAppRole() {
  let response;

  try {
    response = await fetch(`${config.addr}/v1/auth/${config.appRoleAuthPath}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role_id: config.roleId,
        secret_id: config.secretId,
      }),
    });
  } catch (error) {
    throw new Error(
      `Failed to reach OpenBao AppRole login endpoint at ${config.addr}: ${error.message}`,
    );
  }

  if (!response.ok) {
    throw new Error(`OpenBao AppRole login failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const token = payload?.auth?.client_token;

  if (!token) {
    throw new Error("OpenBao AppRole login did not return a client token.");
  }

  return token;
}

async function login(jwt) {
  if (config.token) {
    return config.token;
  }

  if (config.roleId && config.secretId) {
    return loginWithAppRole();
  }

  let response;

  try {
    response = await fetch(`${config.addr}/v1/auth/${config.jwtAuthPath}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: config.jwtRole,
        jwt,
      }),
    });
  } catch (error) {
    throw new Error(`Failed to reach OpenBao login endpoint at ${config.addr}: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`OpenBao JWT login failed with status ${response.status}.`);
  }

  const payload = await response.json();
  const token = payload?.auth?.client_token;

  if (!token) {
    throw new Error("OpenBao did not return a client token.");
  }

  return token;
}

async function readSecret(clientToken, relativePath) {
  let response;

  try {
    response = await fetch(`${config.addr}/v1/${config.kvMount}/data/${relativePath}`, {
      headers: {
        "X-Vault-Token": clientToken,
      },
    });
  } catch (error) {
    throw new Error(
      `Failed to reach OpenBao while reading ${config.kvMount}/data/${relativePath}: ${error.message}`,
    );
  }

  if (!response.ok) {
    throw new Error(`Failed to read ${relativePath} from OpenBao (${response.status}).`);
  }

  const payload = await response.json();
  return payload?.data?.data ?? null;
}

function toEnvBlock(values) {
  return Object.entries(values)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${String(value)}`)
    .join("\n");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFileSafely(filePath, contents) {
  fs.writeFileSync(filePath, `${contents}\n`, { encoding: "utf8", mode: 0o600 });
}

function writeStatus(summary) {
  ensureDir(secretsDir);
  writeFileSafely(statusFile, JSON.stringify(summary, null, 2));
}

function getMissingKeys(secretName, secretValues) {
  const provider = secretValues.FILE_STORAGE_PROVIDER || process.env.FILE_STORAGE_PROVIDER || "local";
  const keys = requiredKeys[secretName] ?? [];

  return keys.filter((key) => {
    if (secretName === "supabase" && provider !== "supabase") {
      return false;
    }

    if (secretName === "rustfs" && key === "S3_PRIVATE_BUCKET" && provider !== "s3") {
      return false;
    }

    return !(key in secretValues);
  });
}

async function main() {
  const secretPaths = selectedGroups.map((group) => {
    const relativePath = config.paths[group];

    if (!relativePath) {
      throw new Error(`Unknown OpenBao secret group: ${group}`);
    }

    return [group, relativePath];
  });

  if (DRY_RUN) {
    console.log("Dry run: would fetch the following OpenBao KV v2 paths:");
    for (const [name, relativePath] of secretPaths) {
      console.log(`- ${name}: ${config.kvMount}/data/${relativePath}`);
    }
    return;
  }

  if (!config.addr) {
    throw new Error("BAO_ADDR is required.");
  }

  const jwt = readJwt();
  const clientToken = await login(jwt);

  ensureDir(secretsDir);

  const aggregated = {};
  const summary = {
    generatedAt: new Date().toISOString(),
    addr: config.addr,
    kvMount: config.kvMount,
    paths: [],
  };
  const missingBySecret = [];

  for (const [name, relativePath] of secretPaths) {
    const secretValues = await readSecret(clientToken, relativePath);

    if (!secretValues || typeof secretValues !== "object" || !Object.keys(secretValues).length) {
      throw new Error(`OpenBao path ${relativePath} returned no secret values.`);
    }

    const missingKeys = getMissingKeys(name, secretValues);

    summary.paths.push({
      name,
      path: `${config.kvMount}/data/${relativePath}`,
      keysPresent: Object.keys(secretValues).sort(),
      missingKeys,
    });

    if (missingKeys.length) {
      missingBySecret.push({ name, missingKeys });
    }

    Object.assign(aggregated, secretValues);
    writeFileSafely(path.join(secretsDir, `${name}.env`), toEnvBlock(secretValues));
  }

  writeStatus(summary);

  if (missingBySecret.length) {
    const messages = missingBySecret.map(
      (entry) => `${entry.name}: ${entry.missingKeys.join(", ")}`,
    );
    throw new Error(`Missing required OpenBao keys.\n${messages.join("\n")}`);
  }

  writeFileSafely(path.join(rootDir, ".env.runtime"), toEnvBlock(aggregated));
  if (config.roleId && config.secretId) {
    aggregated.BAO_ADDR = config.addr;
    aggregated.OPENBAO_ROLE_ID = config.roleId;
    aggregated.OPENBAO_SECRET_ID = config.secretId;
    aggregated.BAO_ADMIN_ROLE_ID = aggregated.BAO_ADMIN_ROLE_ID || config.roleId;
    aggregated.BAO_ADMIN_SECRET_ID = aggregated.BAO_ADMIN_SECRET_ID || config.secretId;
    aggregated.BAO_APPROLE_AUTH_PATH = config.appRoleAuthPath;
    aggregated.BAO_KV_MOUNT = config.kvMount;
    aggregated.BAO_CONFIG_REQUEST_PATH =
      process.env.BAO_CONFIG_REQUEST_PATH || "caid/config-requests";
    writeFileSafely(path.join(rootDir, ".env.runtime"), toEnvBlock(aggregated));
  }
  console.log("OpenBao secrets fetched and runtime env files updated.");
  console.log(`Secret status report written to ${statusFile}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
