import { env } from "@/src/lib/server/env";

type KeycloakUser = {
  id: string;
  email?: string;
  username?: string;
  enabled?: boolean;
};

type KeycloakRole = {
  id: string;
  name: string;
};

type SyncInput = {
  email: string;
  name?: string | null;
  provider?: string;
  emailVerified?: boolean;
};

let clientUuidPromise: Promise<string> | null = null;

function getKeycloakBaseConfig() {
  if (!env.KEYCLOAK_ISSUER || !env.KEYCLOAK_CLIENT_ID) {
    throw new Error("Keycloak issuer and client ID are required for account sync.");
  }

  const issuer = new URL(env.KEYCLOAK_ISSUER);
  const realmMatch = issuer.pathname.match(/\/realms\/([^/]+)/);

  if (!realmMatch) {
    throw new Error("Unable to determine Keycloak realm from KEYCLOAK_ISSUER.");
  }

  return {
    origin: issuer.origin,
    realm: realmMatch[1],
    websiteClientId: env.KEYCLOAK_CLIENT_ID,
  };
}

function getAdminTokenUrl() {
  const { origin } = getKeycloakBaseConfig();
  return `${origin}/realms/${env.KEYCLOAK_ADMIN_REALM}/protocol/openid-connect/token`;
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
      throw new Error(`Keycloak admin client token request failed (${response.status}).`);
    }

    const payload = await response.json();
    return payload.access_token as string;
  }

  if (!env.KEYCLOAK_ADMIN_USERNAME || !env.KEYCLOAK_ADMIN_PASSWORD) {
    throw new Error(
      "Google/SSO account sync requires KEYCLOAK_ADMIN credentials or a service-account client.",
    );
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
    throw new Error(`Keycloak admin password token request failed (${response.status}).`);
  }

  const payload = await response.json();
  return payload.access_token as string;
}

async function keycloakAdminFetch(path: string, init?: RequestInit) {
  const token = await getAdminAccessToken();
  const { origin, realm } = getKeycloakBaseConfig();

  return fetch(`${origin}/admin/realms/${realm}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
}

async function getWebsiteClientUuid() {
  if (!clientUuidPromise) {
    clientUuidPromise = (async () => {
      const { websiteClientId } = getKeycloakBaseConfig();
      const response = await keycloakAdminFetch(
        `/clients?clientId=${encodeURIComponent(websiteClientId)}`,
      );

      if (!response.ok) {
        throw new Error(`Unable to look up Keycloak client (${response.status}).`);
      }

      const payload = (await response.json()) as Array<{ id?: string }>;
      const match = payload[0]?.id;

      if (!match) {
        throw new Error(`Keycloak client ${websiteClientId} was not found.`);
      }

      return match;
    })();
  }

  return clientUuidPromise;
}

async function findUsersByEmail(email: string) {
  const response = await keycloakAdminFetch(
    `/users?email=${encodeURIComponent(email)}&exact=true`,
  );

  if (!response.ok) {
    throw new Error(`Unable to search Keycloak users by email (${response.status}).`);
  }

  const payload = (await response.json()) as KeycloakUser[];
  return payload.filter(
    (user) => user.email && user.email.toLowerCase() === email.toLowerCase(),
  );
}

async function createUser(input: SyncInput) {
  const response = await keycloakAdminFetch("/users", {
    method: "POST",
    body: JSON.stringify({
      username: input.email,
      email: input.email,
      firstName: input.name ?? undefined,
      enabled: true,
      emailVerified: input.emailVerified ?? false,
      attributes: input.provider ? { sso_provider: [input.provider] } : undefined,
    }),
  });

  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(`Unable to create Keycloak user for ${input.email} (${response.status}).`);
  }

  const matches = await findUsersByEmail(input.email);

  if (matches.length !== 1) {
    throw new Error(`Unable to resolve newly created Keycloak user for ${input.email}.`);
  }

  return matches[0];
}

async function ensureUniqueUserByEmail(input: SyncInput) {
  const exactMatches = await findUsersByEmail(input.email);

  if (exactMatches.length > 1) {
    throw new Error(`Duplicate Keycloak users exist for ${input.email}.`);
  }

  if (exactMatches.length === 1) {
    const user = exactMatches[0];

    if (user.enabled === false) {
      throw new Error(`Keycloak user for ${input.email} is disabled.`);
    }

    return user;
  }

  return createUser(input);
}

async function getUserClientRoles(userId: string) {
  const clientUuid = await getWebsiteClientUuid();
  const response = await keycloakAdminFetch(`/users/${userId}/role-mappings/clients/${clientUuid}`);

  if (!response.ok) {
    throw new Error(`Unable to fetch Keycloak roles for user ${userId} (${response.status}).`);
  }

  const payload = (await response.json()) as KeycloakRole[];
  return payload.map((role) => role.name).filter(Boolean);
}

async function getClientRole(roleName: string) {
  const clientUuid = await getWebsiteClientUuid();
  const response = await keycloakAdminFetch(
    `/clients/${clientUuid}/roles/${encodeURIComponent(roleName)}`,
  );

  if (!response.ok) {
    throw new Error(`Unable to fetch Keycloak role ${roleName} (${response.status}).`);
  }

  return (await response.json()) as KeycloakRole;
}

async function assignClientRole(userId: string, roleName: string) {
  const clientUuid = await getWebsiteClientUuid();
  const role = await getClientRole(roleName);
  const response = await keycloakAdminFetch(
    `/users/${userId}/role-mappings/clients/${clientUuid}`,
    {
      method: "POST",
      body: JSON.stringify([role]),
    },
  );

  if (!response.ok && response.status !== 204) {
    throw new Error(`Unable to assign Keycloak role ${roleName} (${response.status}).`);
  }
}

export async function assignKeycloakClientRoleByEmail(email: string, roleName: string) {
  const exactMatches = await findUsersByEmail(email);

  if (exactMatches.length !== 1) {
    throw new Error(`Expected exactly one Keycloak user for ${email}.`);
  }

  await assignClientRole(exactMatches[0].id, roleName);

  return {
    user: exactMatches[0],
    roles: await getUserClientRoles(exactMatches[0].id),
  };
}

export async function syncKeycloakUserByEmail(input: SyncInput) {
  const user = await ensureUniqueUserByEmail(input);
  let roles = await getUserClientRoles(user.id);

  if (!roles.length) {
    await assignClientRole(user.id, "viewer");
    roles = await getUserClientRoles(user.id);
  }

  return {
    user,
    roles,
  };
}
