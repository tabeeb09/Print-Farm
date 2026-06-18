import { getMediaObjectText, uploadMediaObject } from "@/src/lib/server/s3";

export type PrivilegeRequestStatus = "pending" | "approved" | "rejected";

export type PrivilegeRequest = {
  id: string;
  email: string;
  name?: string | null;
  requestedRole: string;
  resource: string;
  reason?: string | null;
  status: PrivilegeRequestStatus;
  createdAt: string;
  updatedAt: string;
  decidedBy?: string | null;
};

const STORE_KEY = "system/privilege-requests.json";

function now() {
  return new Date().toISOString();
}

function normalizeRole(role: string | null | undefined) {
  const cleaned = (role ?? "").trim();
  return cleaned || "media_admin";
}

function normalizeResource(resource: string | null | undefined) {
  const cleaned = (resource ?? "").trim();
  return cleaned || "cms/media";
}

async function readStore() {
  try {
    const text = await getMediaObjectText(STORE_KEY);
    const parsed = JSON.parse(text) as { requests?: PrivilegeRequest[] };
    return Array.isArray(parsed.requests) ? parsed.requests : [];
  } catch (error) {
    const statusCode =
      typeof error === "object" && error && "$metadata" in error
        ? (error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode
        : undefined;

    if (statusCode === 404) {
      return [];
    }

    throw error;
  }
}

async function writeStore(requests: PrivilegeRequest[]) {
  await uploadMediaObject(
    STORE_KEY,
    JSON.stringify({ requests }, null, 2),
    "application/json",
  );
}

export async function listPrivilegeRequests() {
  return readStore();
}

export async function getPrivilegeRequest(id: string) {
  const requests = await readStore();
  return requests.find((request) => request.id === id) ?? null;
}

export async function createPrivilegeRequest(input: {
  email: string;
  name?: string | null;
  requestedRole?: string | null;
  resource?: string | null;
  reason?: string | null;
}) {
  const email = input.email.trim().toLowerCase();

  if (!email) {
    throw new Error("Privilege requests require a signed-in user email.");
  }

  const requestedRole = normalizeRole(input.requestedRole);
  const resource = normalizeResource(input.resource);
  const requests = await readStore();
  const existing = requests.find(
    (request) =>
      request.email.toLowerCase() === email &&
      request.requestedRole === requestedRole &&
      request.resource === resource &&
      request.status === "pending",
  );

  if (existing) {
    return existing;
  }

  const timestamp = now();
  const request: PrivilegeRequest = {
    id: crypto.randomUUID(),
    email,
    name: input.name ?? null,
    requestedRole,
    resource,
    reason: input.reason?.trim() || null,
    status: "pending",
    createdAt: timestamp,
    updatedAt: timestamp,
  };

  await writeStore([request, ...requests]);
  return request;
}

export async function markPrivilegeRequest(
  id: string,
  status: Exclude<PrivilegeRequestStatus, "pending">,
  decidedBy: string,
  requestedRole?: string,
) {
  const requests = await readStore();
  const index = requests.findIndex((request) => request.id === id);

  if (index === -1) {
    throw new Error("Privilege request not found.");
  }

  requests[index] = {
    ...requests[index],
    requestedRole: requestedRole ?? requests[index].requestedRole,
    status,
    decidedBy,
    updatedAt: now(),
  };

  await writeStore(requests);
  return requests[index];
}
