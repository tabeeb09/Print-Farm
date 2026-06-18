import { env } from "@/src/lib/server/env";

type JsonRecord = Record<string, unknown>;

let tokenPromise: Promise<string> | null = null;

function requireOpenBaoConfig() {
  if (!env.BAO_ADDR || !env.OPENBAO_ROLE_ID || !env.OPENBAO_SECRET_ID) {
    throw new Error(
      "OpenBao runtime AppRole config is missing. Required: BAO_ADDR, OPENBAO_ROLE_ID, OPENBAO_SECRET_ID.",
    );
  }
}

async function loginWithAppRole() {
  requireOpenBaoConfig();

  const response = await fetch(`${env.BAO_ADDR}/v1/auth/${env.BAO_APPROLE_AUTH_PATH}/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      role_id: env.OPENBAO_ROLE_ID,
      secret_id: env.OPENBAO_SECRET_ID,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenBao AppRole login failed (${response.status}).`);
  }

  const payload = await response.json();
  const token = payload?.auth?.client_token;

  if (!token || typeof token !== "string") {
    throw new Error("OpenBao AppRole login did not return a client token.");
  }

  return token;
}

async function getOpenBaoToken() {
  if (!tokenPromise) {
    tokenPromise = loginWithAppRole();
  }

  return tokenPromise;
}

async function openBaoFetch(method: string, path: string, body?: JsonRecord) {
  const token = await getOpenBaoToken();
  const response = await fetch(`${env.BAO_ADDR}/v1/${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Vault-Token": token,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  if (response.status === 403 || response.status === 401) {
    tokenPromise = null;
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`OpenBao ${method} ${path} failed (${response.status}): ${text}`);
  }

  if (response.status === 204) {
    return {};
  }

  return response.json();
}

export async function readOpenBaoKv(path: string) {
  try {
    const payload = await openBaoFetch("GET", `${env.BAO_KV_MOUNT}/data/${path}`);
    return (payload?.data?.data ?? {}) as JsonRecord;
  } catch (error) {
    if (String((error as Error).message).includes("(404)")) {
      return {};
    }

    throw error;
  }
}

export async function writeOpenBaoKv(path: string, data: JsonRecord) {
  await openBaoFetch("POST", `${env.BAO_KV_MOUNT}/data/${path}`, { data });
}
