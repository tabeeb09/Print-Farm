import { env, parseCsv } from "./env";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function getKeycloakBaseConfig() {
  if (!env.KEYCLOAK_ISSUER || !env.KEYCLOAK_CLIENT_ID) {
    throw new Error("KEYCLOAK_ISSUER and KEYCLOAK_CLIENT_ID are required.");
  }

  const issuer = new URL(env.KEYCLOAK_ISSUER);
  const realmMatch = issuer.pathname.match(/\/realms\/([^/]+)/);

  if (!realmMatch) {
    throw new Error("Unable to determine Keycloak realm from KEYCLOAK_ISSUER.");
  }

  return {
    origin: issuer.origin,
    realm: realmMatch[1],
    clientId: env.KEYCLOAK_CLIENT_ID,
  };
}

function getAdminTokenUrl() {
  const { origin } = getKeycloakBaseConfig();
  return `${origin}/realms/${env.KEYCLOAK_ADMIN_REALM}/protocol/openid-connect/token`;
}

async function readError(response) {
  const text = await response.text().catch(() => "");
  if (!text) return response.statusText;
  try {
    const payload = JSON.parse(text);
    return payload.error_description || payload.error || text;
  } catch {
    return text;
  }
}

async function getAdminAccessToken() {
  const tokenUrl = getAdminTokenUrl();

  if (env.KEYCLOAK_ADMIN_CLIENT_SECRET) {
    const params = new URLSearchParams({
      grant_type: "client_credentials",
      client_id: env.KEYCLOAK_ADMIN_CLIENT_ID,
      client_secret: env.KEYCLOAK_ADMIN_CLIENT_SECRET,
    });

    const response = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });

    if (!response.ok) {
      throw new Error(`Keycloak admin client token request failed (${response.status}): ${await readError(response)}`);
    }

    return (await response.json()).access_token;
  }

  if (!env.KEYCLOAK_ADMIN_USERNAME || !env.KEYCLOAK_ADMIN_PASSWORD) {
    throw new Error("KEYCLOAK_ADMIN_CLIENT_SECRET or KEYCLOAK_ADMIN_USERNAME/PASSWORD is required.");
  }

  const params = new URLSearchParams({
    grant_type: "password",
    client_id: env.KEYCLOAK_ADMIN_CLIENT_ID,
    username: env.KEYCLOAK_ADMIN_USERNAME,
    password: env.KEYCLOAK_ADMIN_PASSWORD,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    throw new Error(`Keycloak admin password token request failed (${response.status}): ${await readError(response)}`);
  }

  return (await response.json()).access_token;
}

async function keycloakAdminFetch(path, init = {}) {
  const token = await getAdminAccessToken();
  const { origin, realm } = getKeycloakBaseConfig();
  const response = await fetch(`${origin}/admin/realms/${realm}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  });

  if (!response.ok && response.status !== 204 && response.status !== 201) {
    throw new Error(`Keycloak ${path} failed (${response.status}): ${await readError(response)}`);
  }

  return response;
}

let clientUuidPromise = null;

async function getWebsiteClientUuid() {
  if (!clientUuidPromise) {
    clientUuidPromise = (async () => {
      const { clientId } = getKeycloakBaseConfig();
      const response = await keycloakAdminFetch(`/clients?clientId=${encodeURIComponent(clientId)}`);
      const payload = await response.json();
      const match = payload[0]?.id;

      if (!match) {
        throw new Error(`Keycloak client ${clientId} was not found.`);
      }

      return match;
    })();
  }

  return clientUuidPromise;
}

async function findUsersByEmail(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) return [];

  const response = await keycloakAdminFetch(`/users?email=${encodeURIComponent(normalized)}&exact=true`);
  const users = await response.json();
  return users.filter((user) => user.email?.toLowerCase() === normalized);
}

function sanitizeUser(user) {
  return {
    id: user.id,
    email: user.email || "",
    username: user.username || "",
    firstName: user.firstName || "",
    lastName: user.lastName || "",
    enabled: user.enabled !== false,
    attributes: user.attributes || {},
  };
}

function getManagedBy(user) {
  const values = user.attributes?.[env.KEYCLOAK_HR_SCOPE_ATTRIBUTE];
  return Array.isArray(values) ? values.map(normalizeEmail).filter(Boolean) : [];
}

function isOwnerActor(actor) {
  return Boolean(actor?.isSuperadmin || actor?.roles?.includes("owner"));
}

function canManageUser(actor, user) {
  if (isOwnerActor(actor)) return true;
  const actorEmail = normalizeEmail(actor?.email);
  return Boolean(actorEmail && getManagedBy(user).includes(actorEmail));
}

async function setManagedBy(user, managerEmail) {
  const normalized = normalizeEmail(managerEmail);
  if (!normalized) return user;

  const current = getManagedBy(user);
  const nextManagedBy = Array.from(new Set([...current, normalized]));
  const response = await keycloakAdminFetch(`/users/${user.id}`, {
    method: "PUT",
    body: JSON.stringify({
      ...user,
      attributes: {
        ...(user.attributes || {}),
        [env.KEYCLOAK_HR_SCOPE_ATTRIBUTE]: nextManagedBy,
      },
    }),
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Unable to update manager scope for ${user.email}.`);
  }

  return {
    ...user,
    attributes: {
      ...(user.attributes || {}),
      [env.KEYCLOAK_HR_SCOPE_ATTRIBUTE]: nextManagedBy,
    },
  };
}

async function createUserByEmail(email, name = "", managerEmail = "") {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error("Email is required.");
  }

  await keycloakAdminFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      username: normalized,
      email: normalized,
      firstName: name || undefined,
      enabled: true,
      emailVerified: false,
      attributes: managerEmail
        ? { [env.KEYCLOAK_HR_SCOPE_ATTRIBUTE]: [normalizeEmail(managerEmail)] }
        : undefined,
    }),
  });

  const users = await findUsersByEmail(normalized);
  if (users.length !== 1) {
    throw new Error(`Unable to resolve newly created Keycloak user for ${normalized}.`);
  }
  return users[0];
}

async function getUserRoles(userId) {
  const clientUuid = await getWebsiteClientUuid();
  const response = await keycloakAdminFetch(`/users/${userId}/role-mappings/clients/${clientUuid}`);
  const roles = await response.json();
  return roles.map((role) => role.name).filter(Boolean).sort();
}

async function getClientRole(roleName) {
  const clientUuid = await getWebsiteClientUuid();
  const response = await keycloakAdminFetch(`/clients/${clientUuid}/roles/${encodeURIComponent(roleName)}`);
  return response.json();
}

export function getManageableRoles() {
  return parseCsv(env.KEYCLOAK_MANAGEABLE_ROLES);
}

export function assertManageableRole(roleName) {
  if (!getManageableRoles().includes(roleName)) {
    throw new Error(`Role ${roleName} is not in KEYCLOAK_MANAGEABLE_ROLES.`);
  }
}

export async function listPeopleForActor(actor) {
  const response = await keycloakAdminFetch("/users?max=200");
  const users = await response.json();
  const people = [];

  for (const user of users.filter((item) => item.email)) {
    if (!canManageUser(actor, user)) continue;
    people.push({
      user: sanitizeUser(user),
      managedBy: getManagedBy(user),
      roles: await getUserRoles(user.id),
    });
  }

  return people.sort((left, right) =>
    (left.user.email || "").localeCompare(right.user.email || ""),
  );
}

export async function getPersonByEmail(email) {
  const users = await findUsersByEmail(email);

  if (users.length > 1) {
    throw new Error(`Duplicate Keycloak users exist for ${normalizeEmail(email)}.`);
  }

  if (!users.length) {
    return { user: null, roles: [] };
  }

  return {
    user: sanitizeUser(users[0]),
    managedBy: getManagedBy(users[0]),
    roles: await getUserRoles(users[0].id),
  };
}

export async function ensurePersonByEmail({ email, name, managerEmail }) {
  const existing = await getPersonByEmail(email);
  if (existing.user) return existing;

  const user = await createUserByEmail(email, name, managerEmail);
  return {
    user: sanitizeUser(user),
    managedBy: getManagedBy(user),
    roles: await getUserRoles(user.id),
  };
}

export async function assignRoleByEmail(email, roleName, managerEmail = "") {
  assertManageableRole(roleName);
  let { user } = await ensurePersonByEmail({ email, managerEmail });
  if (managerEmail) {
    user = sanitizeUser(await setManagedBy(user, managerEmail));
  }
  const clientUuid = await getWebsiteClientUuid();
  const role = await getClientRole(roleName);

  await keycloakAdminFetch(`/users/${user.id}/role-mappings/clients/${clientUuid}`, {
    method: "POST",
    body: JSON.stringify([role]),
  });

  return getPersonByEmail(email);
}

export async function removeRoleByEmail(email, roleName) {
  assertManageableRole(roleName);
  const { user } = await getPersonByEmail(email);
  if (!user) {
    throw new Error(`No Keycloak user found for ${normalizeEmail(email)}.`);
  }

  const clientUuid = await getWebsiteClientUuid();
  const role = await getClientRole(roleName);
  await keycloakAdminFetch(`/users/${user.id}/role-mappings/clients/${clientUuid}`, {
    method: "DELETE",
    body: JSON.stringify([role]),
  });

  return getPersonByEmail(email);
}
