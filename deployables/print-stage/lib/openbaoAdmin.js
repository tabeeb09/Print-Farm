import { env } from "./env";
import { getAppRolePresets } from "./openbaoPresets";

const ROLE_NAME_PATTERN = /^[a-z][a-z0-9-]{2,62}$/;
const SECRET_PATH_PATTERN = /^[a-z0-9][a-z0-9/_-]{1,190}[a-z0-9]$/i;

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function assertSafeRoleName(roleName) {
  if (!ROLE_NAME_PATTERN.test(roleName)) {
    throw new Error("Role name must be 3-63 chars: lowercase letters, numbers, and hyphens.");
  }
}

function assertSafeSecretPath(secretPath) {
  if (
    !SECRET_PATH_PATTERN.test(secretPath) ||
    secretPath.includes("..") ||
    secretPath.startsWith("/") ||
    secretPath.endsWith("/")
  ) {
    throw new Error("Secret path must be a relative OpenBao KV path such as print/prod.");
  }
}

async function readError(response) {
  const text = await response.text().catch(() => "");
  if (!text) return response.statusText;
  try {
    const payload = JSON.parse(text);
    return payload.errors?.join("; ") || text;
  } catch {
    return text;
  }
}

async function requestOpenBao(path, { method = "GET", token, body } = {}) {
  const baoAddr = required(env.BAO_ADDR, "BAO_ADDR");
  const response = await fetch(`${baoAddr}/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Token": token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`OpenBao ${method} ${path} failed (${response.status}): ${await readError(response)}`);
  }

  if (response.status === 204) {
    return null;
  }

  return response.json().catch(() => null);
}

async function loginAdminAppRole() {
  const baoAddr = required(env.BAO_ADDR, "BAO_ADDR");
  const roleId = required(env.BAO_ADMIN_ROLE_ID, "BAO_ADMIN_ROLE_ID");
  const secretId = required(env.BAO_ADMIN_SECRET_ID, "BAO_ADMIN_SECRET_ID");

  const response = await fetch(`${baoAddr}/v1/auth/${env.BAO_APPROLE_AUTH_PATH}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role_id: roleId, secret_id: secretId }),
  });

  if (!response.ok) {
    throw new Error(`OpenBao admin AppRole login failed (${response.status}): ${await readError(response)}`);
  }

  const payload = await response.json();
  const token = payload?.auth?.client_token;
  if (!token) {
    throw new Error("OpenBao admin AppRole login did not return a token.");
  }
  return token;
}

async function getAdminToken() {
  if (env.BAO_ADMIN_TOKEN) {
    return env.BAO_ADMIN_TOKEN;
  }

  return loginAdminAppRole();
}

function buildReadOnlyKvPolicy(secretPath) {
  const mount = env.BAO_KV_MOUNT;
  return [
    `path "${mount}/data/${secretPath}" {`,
    '  capabilities = ["read"]',
    "}",
    "",
    `path "${mount}/metadata/${secretPath}" {`,
    '  capabilities = ["read"]',
    "}",
    "",
  ].join("\n");
}

function toEnvFile({ roleId, secretId, secretPath }) {
  return [
    `BAO_ADDR=${env.BAO_ADDR}`,
    `OPENBAO_ROLE_ID=${roleId}`,
    `OPENBAO_SECRET_ID=${secretId}`,
    `BAO_KV_MOUNT=${env.BAO_KV_MOUNT}`,
    `BAO_APPROLE_AUTH_PATH=${env.BAO_APPROLE_AUTH_PATH}`,
    `BAO_SECRET_PATH_PRINT_WORKER=${secretPath}`,
    "",
  ].join("\n");
}

export async function mintReadOnlyAppRole({ roleName, secretPath, secretIdTtl = "2160h", tokenTtl = "1h", tokenMaxTtl = "4h" }) {
  assertSafeRoleName(roleName);
  assertSafeSecretPath(secretPath);

  const token = await getAdminToken();
  const policyName = `approle-${roleName}`;
  const policy = buildReadOnlyKvPolicy(secretPath);
  const rolePath = `auth/${env.BAO_APPROLE_AUTH_PATH}/role/${roleName}`;

  await requestOpenBao(`sys/policies/acl/${policyName}`, {
    method: "PUT",
    token,
    body: { policy },
  });

  await requestOpenBao(rolePath, {
    method: "POST",
    token,
    body: {
      token_policies: policyName,
      secret_id_ttl: secretIdTtl,
      token_ttl: tokenTtl,
      token_max_ttl: tokenMaxTtl,
      bind_secret_id: true,
    },
  });

  const roleIdPayload = await requestOpenBao(`${rolePath}/role-id`, { token });
  const secretIdPayload = await requestOpenBao(`${rolePath}/secret-id`, {
    method: "POST",
    token,
    body: {},
  });

  const roleId = roleIdPayload?.data?.role_id;
  const secretId = secretIdPayload?.data?.secret_id;

  if (!roleId || !secretId) {
    throw new Error("OpenBao did not return both role_id and secret_id.");
  }

  return {
    roleName,
    policyName,
    secretPath,
    roleId,
    secretId,
    envFile: toEnvFile({ roleId, secretId, secretPath }),
  };
}
