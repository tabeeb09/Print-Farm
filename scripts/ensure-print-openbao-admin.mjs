import fs from "node:fs";

const config = {
  addr: process.env.BAO_ADDR,
  token: process.env.BAO_TOKEN || process.env.BAO_DEV_ROOT_TOKEN,
  kvMount: process.env.BAO_KV_MOUNT || "kv",
  printPath: process.env.BAO_SECRET_PATH_PRINT || "print/prod",
  approlePath: process.env.BAO_APPROLE_AUTH_PATH || "approle",
  adminRoleName: process.env.PRINT_BAO_ADMIN_ROLE_NAME || "print-approle-admin",
  adminPolicyName: process.env.PRINT_BAO_ADMIN_POLICY_NAME || "print-approle-admin",
};

function required(value, name) {
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
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

async function requestOpenBao(path, { method = "GET", body } = {}) {
  const response = await fetch(`${config.addr}/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Token": config.token,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    throw new Error(`OpenBao ${method} ${path} failed (${response.status}): ${await readError(response)}`);
  }

  if (response.status === 204) return null;
  return response.json().catch(() => null);
}

async function readKv(path) {
  const response = await fetch(`${config.addr}/v1/${config.kvMount}/data/${path}`, {
    headers: { "X-Vault-Token": config.token },
  });

  if (response.status === 404) return {};
  if (!response.ok) {
    throw new Error(`OpenBao read ${path} failed (${response.status}): ${await readError(response)}`);
  }

  const payload = await response.json();
  return payload?.data?.data ?? {};
}

async function writeKv(path, values) {
  await requestOpenBao(`${config.kvMount}/data/${path}`, {
    method: "POST",
    body: { data: values },
  });
}

function buildAdminPolicy() {
  const mount = config.kvMount;
  return [
    'path "sys/policies/acl/approle-print-*" {',
    '  capabilities = ["create", "update", "read"]',
    "}",
    "",
    `path "auth/${config.approlePath}/role/print-*" {`,
    '  capabilities = ["create", "update", "read"]',
    "}",
    "",
    `path "auth/${config.approlePath}/role/print-*/role-id" {`,
    '  capabilities = ["read"]',
    "}",
    "",
    `path "auth/${config.approlePath}/role/print-*/secret-id" {`,
    '  capabilities = ["create", "update"]',
    "}",
    "",
    `path "${mount}/data/print/*" {`,
    '  capabilities = ["read"]',
    "}",
    "",
    `path "${mount}/metadata/print/*" {`,
    '  capabilities = ["read"]',
    "}",
    "",
  ].join("\n");
}

async function main() {
  required(config.addr, "BAO_ADDR");
  required(config.token, "BAO_TOKEN");

  await requestOpenBao(`sys/policies/acl/${config.adminPolicyName}`, {
    method: "PUT",
    body: { policy: buildAdminPolicy() },
  });

  const rolePath = `auth/${config.approlePath}/role/${config.adminRoleName}`;
  await requestOpenBao(rolePath, {
    method: "POST",
    body: {
      token_policies: config.adminPolicyName,
      secret_id_ttl: "2160h",
      token_ttl: "15m",
      token_max_ttl: "1h",
      bind_secret_id: true,
    },
  });

  const roleIdPayload = await requestOpenBao(`${rolePath}/role-id`);
  const secretIdPayload = await requestOpenBao(`${rolePath}/secret-id`, {
    method: "POST",
    body: {},
  });
  const roleId = roleIdPayload?.data?.role_id;
  const secretId = secretIdPayload?.data?.secret_id;

  if (!roleId || !secretId) {
    throw new Error("OpenBao did not return print admin role_id and secret_id.");
  }

  const existing = await readKv(config.printPath);
  await writeKv(config.printPath, {
    ...existing,
    BAO_ADDR: config.addr,
    BAO_KV_MOUNT: config.kvMount,
    BAO_APPROLE_AUTH_PATH: config.approlePath,
    BAO_ADMIN_ROLE_ID: roleId,
    BAO_ADMIN_SECRET_ID: secretId,
  });

  console.log(`Ensured ${config.adminRoleName} and stored AppRole admin bootstrap in ${config.printPath}.`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
