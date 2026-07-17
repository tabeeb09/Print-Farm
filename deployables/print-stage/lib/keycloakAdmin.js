import { env, parseCsv } from "./env";

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

const ROLE_GRANT_SUFFIX = "_grant";
const ROLE_GRANT_SUPER_SUFFIX = "_grant_super";

function normalizeRoleName(roleName) {
  return String(roleName || "").trim();
}

function isGrantRole(roleName) {
  return normalizeRoleName(roleName).endsWith(ROLE_GRANT_SUFFIX);
}

function isGrantSuperRole(roleName) {
  return normalizeRoleName(roleName).endsWith(ROLE_GRANT_SUPER_SUFFIX);
}

function getBaseRoleName(roleName) {
  const normalized = normalizeRoleName(roleName);

  if (isGrantSuperRole(normalized)) {
    return normalized.slice(0, -ROLE_GRANT_SUPER_SUFFIX.length);
  }

  if (isGrantRole(normalized)) {
    return normalized.slice(0, -ROLE_GRANT_SUFFIX.length);
  }

  return normalized;
}

function getActorRoles(actor) {
  return Array.isArray(actor?.roles) ? actor.roles.map(normalizeRoleName).filter(Boolean) : [];
}

function isDelegationActor(actor) {
  return getActorRoles(actor).some((role) => isGrantRole(role) || isGrantSuperRole(role));
}

function roleVariantFor(baseRole, level) {
  if (level === "grant") return `${baseRole}${ROLE_GRANT_SUFFIX}`;
  if (level === "grantSuper") return `${baseRole}${ROLE_GRANT_SUPER_SUFFIX}`;
  return baseRole;
}

function parseEmailList(value) {
  if (Array.isArray(value)) {
    return value.flatMap(parseEmailList);
  }

  return String(value || "")
    .split(/[,\n]/)
    .map(normalizeEmail)
    .filter(Boolean);
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

async function keycloakAdminFetch(path, init = {}, options = {}) {
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

  const allowedStatuses = new Set([201, 204, ...(options.allowedStatuses || [])]);

  if (!response.ok && !allowedStatuses.has(response.status)) {
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

export async function findUniqueUserByEmail(email) {
  const users = await findUsersByEmail(email);

  if (users.length > 1) {
    throw new Error(`Duplicate Keycloak users exist for ${normalizeEmail(email)}.`);
  }

  return users[0] || null;
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

export function canDelegateRole(actor, roleName) {
  if (isOwnerActor(actor)) return true;

  const normalized = normalizeRoleName(roleName);
  const baseRole = getBaseRoleName(normalized);
  const roles = new Set(getActorRoles(actor));

  if (isGrantSuperRole(normalized)) {
    return false;
  }

  if (isGrantRole(normalized)) {
    return roles.has(roleVariantFor(baseRole, "grantSuper"));
  }

  return roles.has(roleVariantFor(baseRole, "grant")) || roles.has(roleVariantFor(baseRole, "grantSuper"));
}

export function assertActorCanDelegateRole(actor, roleName) {
  if (!canDelegateRole(actor, roleName)) {
    throw new Error(`You do not have permission to delegate ${roleName}.`);
  }
}

export function actorCanOpenPeopleAdmin(actor) {
  return Boolean(isOwnerActor(actor) || actor?.isHrAdmin || isDelegationActor(actor));
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
  const response = await keycloakAdminFetch(`/users/${userId}/role-mappings/clients/${clientUuid}/composite`);
  const roles = await response.json();
  return roles.map((role) => role.name).filter(Boolean).sort();
}

async function getUserDirectRoles(userId) {
  const clientUuid = await getWebsiteClientUuid();
  const response = await keycloakAdminFetch(`/users/${userId}/role-mappings/clients/${clientUuid}`);
  const roles = await response.json();
  return roles.map((role) => role.name).filter(Boolean).sort();
}

async function getUserGroups(userId) {
  const response = await keycloakAdminFetch(`/users/${userId}/groups?max=200`);
  return response.json();
}

async function getClientRole(roleName) {
  const clientUuid = await getWebsiteClientUuid();
  const response = await keycloakAdminFetch(`/clients/${clientUuid}/roles/${encodeURIComponent(roleName)}`);
  return response.json();
}

async function findClientRole(roleName) {
  const clientUuid = await getWebsiteClientUuid();
  const response = await keycloakAdminFetch(
    `/clients/${clientUuid}/roles/${encodeURIComponent(roleName)}`,
    {},
    { allowedStatuses: [404] },
  );

  if (response.status === 404) return null;
  return response.json();
}

async function ensureClientRole(roleName) {
  assertManageableRole(roleName);

  const existing = await findClientRole(roleName);
  if (existing) return existing;

  const clientUuid = await getWebsiteClientUuid();
  await keycloakAdminFetch(
    `/clients/${clientUuid}/roles`,
    {
      method: "POST",
      body: JSON.stringify({
        name: roleName,
        description: `Managed print-stage permission role: ${roleName}`,
      }),
    },
    { allowedStatuses: [409] },
  );

  return getClientRole(roleName);
}

export function getManageableRoles() {
  return parseCsv(env.KEYCLOAK_MANAGEABLE_ROLES)
    .map(getBaseRoleName)
    .filter((role, index, roles) => roles.indexOf(role) === index);
}

export function getAllManageableRoleVariants() {
  return getManageableRoles().flatMap((role) => [
    role,
    roleVariantFor(role, "grant"),
    roleVariantFor(role, "grantSuper"),
  ]);
}

export function getManageableRoleOptions(actor = null) {
  return getManageableRoles().map((role) => ({
    role,
    label: role,
    variants: [
      {
        role,
        level: "regular",
        label: "Regular permission",
        description: "Can use the feature but cannot grant it to others.",
        canAssign: !actor || canDelegateRole(actor, role),
      },
      {
        role: roleVariantFor(role, "grant"),
        level: "grant",
        label: "Can delegate regular permission",
        description: "Can grant the regular permission to people or groups.",
        canAssign: !actor || canDelegateRole(actor, roleVariantFor(role, "grant")),
      },
      {
        role: roleVariantFor(role, "grantSuper"),
        level: "grantSuper",
        label: "Can delegate delegate-permission",
        description: "Can grant the delegating version of this permission. Owners only assign this.",
        canAssign: !actor || canDelegateRole(actor, roleVariantFor(role, "grantSuper")),
      },
    ],
  }));
}

export function assertManageableRole(roleName) {
  if (!getAllManageableRoleVariants().includes(roleName)) {
    throw new Error(`Role ${roleName} is not in KEYCLOAK_MANAGEABLE_ROLES.`);
  }
}

export async function listPeopleForActor(actor) {
  const response = await keycloakAdminFetch("/users?max=200");
  const users = await response.json();
  const people = [];
  const visibleGroupMemberIds = await getVisibleGroupMemberIds(actor);

  for (const user of users.filter((item) => item.email)) {
    if (!canManageUser(actor, user) && !visibleGroupMemberIds.has(user.id)) continue;
    people.push({
      user: sanitizeUser(user),
      managedBy: getManagedBy(user),
      roles: await getUserRoles(user.id),
      directRoles: await getUserDirectRoles(user.id),
      groups: await getUserGroups(user.id),
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
    return { user: null, roles: [], directRoles: [], groups: [], managedBy: [] };
  }

  return {
    user: sanitizeUser(users[0]),
    managedBy: getManagedBy(users[0]),
    roles: await getUserRoles(users[0].id),
    directRoles: await getUserDirectRoles(users[0].id),
    groups: await getUserGroups(users[0].id),
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
    directRoles: await getUserDirectRoles(user.id),
    groups: await getUserGroups(user.id),
  };
}

export async function syncSsoUserByEmail({ email, name, provider }) {
  const person = await ensurePersonByEmail({ email, name });

  if (!person.roles.length) {
    return assignRoleByEmail(email, "viewer");
  }

  return person;
}

export async function sendPasswordResetIfRegistered(email, redirectUri) {
  const user = await findUniqueUserByEmail(email);

  if (!user || user.enabled === false) {
    return { sent: false };
  }

  const params = new URLSearchParams({
    client_id: env.KEYCLOAK_CLIENT_ID,
    lifespan: "1800",
  });

  if (redirectUri) {
    params.set("redirect_uri", redirectUri);
  }

  await keycloakAdminFetch(`/users/${user.id}/execute-actions-email?${params.toString()}`, {
    method: "PUT",
    body: JSON.stringify(["UPDATE_PASSWORD"]),
  });

  return { sent: true };
}

export async function assignRoleByEmail(email, roleName, managerEmail = "", actor = null) {
  assertManageableRole(roleName);
  if (actor) {
    assertActorCanDelegateRole(actor, roleName);
  }
  let { user } = await ensurePersonByEmail({ email, managerEmail });
  if (managerEmail) {
    user = sanitizeUser(await setManagedBy(user, managerEmail));
  }
  const clientUuid = await getWebsiteClientUuid();
  const role = await ensureClientRole(roleName);

  await keycloakAdminFetch(`/users/${user.id}/role-mappings/clients/${clientUuid}`, {
    method: "POST",
    body: JSON.stringify([role]),
  });

  return getPersonByEmail(email);
}

export async function removeRoleByEmail(email, roleName, actor = null) {
  assertManageableRole(roleName);
  if (actor) {
    assertActorCanDelegateRole(actor, roleName);
  }
  const { user } = await getPersonByEmail(email);
  if (!user) {
    throw new Error(`No Keycloak user found for ${normalizeEmail(email)}.`);
  }

  const clientUuid = await getWebsiteClientUuid();
  const role = await ensureClientRole(roleName);
  await keycloakAdminFetch(`/users/${user.id}/role-mappings/clients/${clientUuid}`, {
    method: "DELETE",
    body: JSON.stringify([role]),
  });

  return getPersonByEmail(email);
}

function flattenGroups(groups, output = []) {
  for (const group of groups || []) {
    output.push(group);
    flattenGroups(group.subGroups || [], output);
  }
  return output;
}

function getGroupAdmins(group) {
  return parseEmailList(group?.attributes?.[env.KEYCLOAK_GROUP_ADMIN_ATTRIBUTE]);
}

function isGroupAdmin(actor, group) {
  const actorEmail = normalizeEmail(actor?.email);
  return Boolean(actorEmail && getGroupAdmins(group).includes(actorEmail));
}

async function listRawGroups() {
  const response = await keycloakAdminFetch("/groups?briefRepresentation=false&max=200");
  return flattenGroups(await response.json());
}

async function getGroupById(groupId) {
  const response = await keycloakAdminFetch(`/groups/${encodeURIComponent(groupId)}`);
  return response.json();
}

async function getGroupRoles(groupId) {
  const clientUuid = await getWebsiteClientUuid();
  const response = await keycloakAdminFetch(
    `/groups/${encodeURIComponent(groupId)}/role-mappings/clients/${clientUuid}/composite`,
  );
  const roles = await response.json();
  return roles.map((role) => role.name).filter(Boolean).sort();
}

async function getGroupDirectRoles(groupId) {
  const clientUuid = await getWebsiteClientUuid();
  const response = await keycloakAdminFetch(
    `/groups/${encodeURIComponent(groupId)}/role-mappings/clients/${clientUuid}`,
  );
  const roles = await response.json();
  return roles.map((role) => role.name).filter(Boolean).sort();
}

async function getGroupMembers(groupId) {
  const response = await keycloakAdminFetch(`/groups/${encodeURIComponent(groupId)}/members?max=200`);
  const users = await response.json();
  return users.filter((user) => user.email).map(sanitizeUser);
}

async function sanitizeGroup(group) {
  const directRoles = await getGroupDirectRoles(group.id);

  return {
    id: group.id,
    name: group.name,
    path: group.path || "",
    attributes: group.attributes || {},
    admins: getGroupAdmins(group),
    roles: await getGroupRoles(group.id),
    directRoles,
    members: await getGroupMembers(group.id),
  };
}

async function getVisibleGroups(actor) {
  const groups = await listRawGroups();
  return groups.filter((group) => isOwnerActor(actor) || actor?.isHrAdmin || isGroupAdmin(actor, group));
}

async function getVisibleGroupMemberIds(actor) {
  const memberIds = new Set();
  const visibleGroups = await getVisibleGroups(actor);

  for (const group of visibleGroups) {
    for (const member of await getGroupMembers(group.id)) {
      memberIds.add(member.id);
    }
  }

  return memberIds;
}

function assertCanManageGroup(actor, group = null) {
  if (isOwnerActor(actor) || actor?.isHrAdmin) return;
  if (group && isGroupAdmin(actor, group)) return;
  throw new Error("You do not have permission to manage this group.");
}

function normalizeGroupPayload(payload = {}) {
  const name = String(payload.name || "").trim();
  const admins = parseEmailList(payload.adminEmails ?? payload.admins);
  const members = parseEmailList(payload.memberEmails ?? payload.members);
  const roles = Array.isArray(payload.roles)
    ? payload.roles.map(normalizeRoleName).filter(Boolean)
    : parseCsv(String(payload.roles || ""));

  if (!name) {
    throw new Error("Group name is required.");
  }

  return {
    name,
    admins: Array.from(new Set(admins)),
    members: Array.from(new Set(members)),
    roles: Array.from(new Set(roles)),
  };
}

async function findGroupByName(name) {
  const groups = await listRawGroups();
  return groups.find((group) => group.name.toLowerCase() === name.toLowerCase()) || null;
}

async function setGroupRepresentation(group, { name, admins }) {
  const nextGroup = {
    ...group,
    name,
    attributes: {
      ...(group.attributes || {}),
      [env.KEYCLOAK_GROUP_ADMIN_ATTRIBUTE]: admins,
    },
  };

  await keycloakAdminFetch(`/groups/${encodeURIComponent(group.id)}`, {
    method: "PUT",
    body: JSON.stringify(nextGroup),
  });

  return getGroupById(group.id);
}

async function syncGroupRoles(groupId, desiredRoles, actor) {
  for (const role of desiredRoles) {
    assertManageableRole(role);
    assertActorCanDelegateRole(actor, role);
  }

  const currentRoles = await getGroupDirectRoles(groupId);
  const desired = new Set(desiredRoles);
  const current = new Set(currentRoles);
  const clientUuid = await getWebsiteClientUuid();
  const additions = desiredRoles.filter((role) => !current.has(role));
  const removals = currentRoles.filter((role) => getAllManageableRoleVariants().includes(role) && !desired.has(role));

  for (const roleName of removals) {
    assertActorCanDelegateRole(actor, roleName);
  }

  if (additions.length) {
    const roles = [];
    for (const roleName of additions) {
      roles.push(await ensureClientRole(roleName));
    }
    await keycloakAdminFetch(`/groups/${encodeURIComponent(groupId)}/role-mappings/clients/${clientUuid}`, {
      method: "POST",
      body: JSON.stringify(roles),
    });
  }

  if (removals.length) {
    const roles = [];
    for (const roleName of removals) {
      roles.push(await ensureClientRole(roleName));
    }
    await keycloakAdminFetch(`/groups/${encodeURIComponent(groupId)}/role-mappings/clients/${clientUuid}`, {
      method: "DELETE",
      body: JSON.stringify(roles),
    });
  }
}

async function syncGroupMembers(groupId, desiredEmails) {
  const currentMembers = await getGroupMembers(groupId);
  const currentByEmail = new Map(currentMembers.map((member) => [normalizeEmail(member.email), member]));
  const desired = new Set(desiredEmails.map(normalizeEmail));

  for (const email of desired) {
    if (currentByEmail.has(email)) continue;
    const { user } = await ensurePersonByEmail({ email });
    await keycloakAdminFetch(`/users/${encodeURIComponent(user.id)}/groups/${encodeURIComponent(groupId)}`, {
      method: "PUT",
      body: "{}",
    });
  }

  for (const member of currentMembers) {
    if (desired.has(normalizeEmail(member.email))) continue;
    await keycloakAdminFetch(`/users/${encodeURIComponent(member.id)}/groups/${encodeURIComponent(groupId)}`, {
      method: "DELETE",
    });
  }
}

export async function listPeopleGroupsForActor(actor) {
  const groups = await getVisibleGroups(actor);
  const result = [];

  for (const group of groups) {
    result.push(await sanitizeGroup(group));
  }

  return result.sort((left, right) => left.name.localeCompare(right.name));
}

export async function savePeopleGroup(actor, payload) {
  const normalized = normalizeGroupPayload(payload);
  const existingByName = await findGroupByName(normalized.name);
  let group = payload.groupId ? await getGroupById(payload.groupId) : existingByName;

  if (payload.groupId && existingByName && existingByName.id !== payload.groupId) {
    throw new Error(`A group named ${normalized.name} already exists.`);
  }

  assertCanManageGroup(actor, group);

  if (!group) {
    await keycloakAdminFetch("/groups", {
      method: "POST",
      body: JSON.stringify({
        name: normalized.name,
        attributes: {
          [env.KEYCLOAK_GROUP_ADMIN_ATTRIBUTE]: normalized.admins,
        },
      }),
    });
    group = await findGroupByName(normalized.name);
    if (!group) {
      throw new Error(`Unable to resolve newly created group ${normalized.name}.`);
    }
  }

  group = await setGroupRepresentation(group, normalized);
  await syncGroupRoles(group.id, normalized.roles, actor);
  await syncGroupMembers(group.id, normalized.members);

  return sanitizeGroup(await getGroupById(group.id));
}

export async function deletePeopleGroup(actor, groupId) {
  const group = await getGroupById(groupId);
  assertCanManageGroup(actor, group);
  await keycloakAdminFetch(`/groups/${encodeURIComponent(group.id)}`, {
    method: "DELETE",
  });
  return { deleted: true, groupId: group.id };
}
