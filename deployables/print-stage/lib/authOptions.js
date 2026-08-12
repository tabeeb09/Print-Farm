import KeycloakProvider from "next-auth/providers/keycloak";
import { decodeJwt } from "jose";

import { env, parseCsv } from "./env";
import { getPersonByEmail } from "./keycloakAdmin";

const ROLE_REFRESH_INTERVAL_MS = 60 * 1000;
const secondsToMs = 1000;

function epochSecondsToMs(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return null;
  }

  return Math.trunc(value) * secondsToMs;
}

function providerExpiryMsFromAccount(account) {
  const explicitExpiresAt = epochSecondsToMs(account?.expires_at);
  if (explicitExpiresAt) {
    return explicitExpiresAt;
  }

  if (typeof account?.expires_in === "number" && Number.isFinite(account.expires_in) && account.expires_in > 0) {
    return Date.now() + Math.trunc(account.expires_in) * secondsToMs;
  }

  return null;
}

function tokenIsExpired(token) {
  const now = Date.now();

  if (typeof token?.appSessionExpiresAt === "number" && now >= token.appSessionExpiresAt) {
    return true;
  }

  const skewMs = env.NEXTAUTH_PROVIDER_REFRESH_SKEW_SECONDS * secondsToMs;
  if (typeof token?.providerAccessTokenExpiresAt === "number" && now >= token.providerAccessTokenExpiresAt - skewMs) {
    return true;
  }

  return false;
}

function appSessionExpired(token) {
  return typeof token?.appSessionExpiresAt === "number" && Date.now() >= token.appSessionExpiresAt;
}

function providerTokenNeedsRefresh(token) {
  const skewMs = env.NEXTAUTH_PROVIDER_REFRESH_SKEW_SECONDS * secondsToMs;
  return typeof token?.providerAccessTokenExpiresAt === "number" && Date.now() >= token.providerAccessTokenExpiresAt - skewMs;
}

function expiredToken(token = {}, overrides = {}) {
  return {
    expired: true,
    sessionPolicyVersion: env.NEXTAUTH_SESSION_POLICY_VERSION,
    appSessionExpiresAt: token.appSessionExpiresAt ?? 0,
    providerAccessTokenExpiresAt: token.providerAccessTokenExpiresAt ?? null,
    provider: token.provider ?? null,
    ...overrides,
  };
}

async function refreshKeycloakToken(token) {
  if (
    token.provider !== "keycloak" ||
    !token.refreshToken ||
    !env.KEYCLOAK_ISSUER ||
    !env.KEYCLOAK_CLIENT_ID ||
    !env.KEYCLOAK_CLIENT_SECRET
  ) {
    return expiredToken(token);
  }

  const body = new URLSearchParams({
    client_id: env.KEYCLOAK_CLIENT_ID,
    client_secret: env.KEYCLOAK_CLIENT_SECRET,
    grant_type: "refresh_token",
    refresh_token: token.refreshToken,
  });

  try {
    const response = await fetch(`${env.KEYCLOAK_ISSUER}/protocol/openid-connect/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });

    if (!response.ok) {
      return expiredToken(token);
    }

    const refreshed = await response.json();
    return {
      ...token,
      expired: false,
      accessToken: refreshed.access_token ?? token.accessToken,
      idToken: refreshed.id_token ?? token.idToken,
      refreshToken: refreshed.refresh_token ?? token.refreshToken,
      providerAccessTokenExpiresAt:
        typeof refreshed.expires_in === "number" && refreshed.expires_in > 0
          ? Date.now() + Math.trunc(refreshed.expires_in) * secondsToMs
          : token.providerAccessTokenExpiresAt,
    };
  } catch {
    return expiredToken(token);
  }
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function normalizeRole(role) {
  return String(role || "").trim().toLowerCase();
}

function readPath(source, dottedPath) {
  return dottedPath.split(".").reduce((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    return value[key];
  }, source);
}

function extractRoles(source) {
  const configuredRoles = readPath(source, env.KEYCLOAK_ROLE_CLAIM_PATH);

  if (Array.isArray(configuredRoles)) {
    return configuredRoles.filter((role) => typeof role === "string");
  }

  const realmRoles = readPath(source, "realm_access.roles");
  const clientRoles = env.KEYCLOAK_CLIENT_ID
    ? readPath(source, `resource_access.${env.KEYCLOAK_CLIENT_ID}.roles`)
    : undefined;

  return [realmRoles, clientRoles]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((role) => typeof role === "string");
}

function readNumericClaim(source, claimPaths) {
  for (const claimPath of claimPaths) {
    const value = readPath(source, claimPath);
    const candidate = Array.isArray(value) ? value[0] : value;

    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate > 0) {
      return Math.trunc(candidate);
    }

    if (typeof candidate === "string" && candidate.trim()) {
      const parsed = Number.parseInt(candidate.trim(), 10);

      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  return null;
}

const providers = [];

if (env.KEYCLOAK_ISSUER && env.KEYCLOAK_CLIENT_ID && env.KEYCLOAK_CLIENT_SECRET) {
  providers.push(
    KeycloakProvider({
      issuer: env.KEYCLOAK_ISSUER,
      clientId: env.KEYCLOAK_CLIENT_ID,
      clientSecret: env.KEYCLOAK_CLIENT_SECRET,
    }),
  );
}

export const authOptions = {
  secret: env.NEXTAUTH_SECRET,
  providers,
  session: {
    strategy: "jwt",
    maxAge: env.NEXTAUTH_SESSION_MAX_AGE_SECONDS,
    updateAge: env.NEXTAUTH_SESSION_UPDATE_AGE_SECONDS,
  },
  jwt: {
    maxAge: env.NEXTAUTH_SESSION_MAX_AGE_SECONDS,
  },
  pages: {
    signIn: "/auth/signin",
  },
  callbacks: {
    async signIn({ user, account, profile }) {
      if (!user.email) {
        return false;
      }

      return true;
    },
    async jwt({ token, account, profile }) {
      if (token.sessionPolicyVersion !== env.NEXTAUTH_SESSION_POLICY_VERSION) {
        if (!account) {
          return {
            expired: true,
            sessionPolicyVersion: env.NEXTAUTH_SESSION_POLICY_VERSION,
            appSessionExpiresAt: 0,
          };
        }

        token.sessionPolicyVersion = env.NEXTAUTH_SESSION_POLICY_VERSION;
        token.appSessionStartedAt = Date.now();
        token.appSessionExpiresAt = Date.now() + env.NEXTAUTH_SESSION_MAX_AGE_SECONDS * secondsToMs;
      }

      if (account?.access_token) {
        token.accessToken = account.access_token;
      }

      if (account?.id_token) {
        token.idToken = account.id_token;
      }

      if (account?.refresh_token) {
        token.refreshToken = account.refresh_token;
      }

      if (account?.provider) {
        token.provider = account.provider;
      }

      const providerExpiresAt = providerExpiryMsFromAccount(account);
      if (providerExpiresAt) {
        token.providerAccessTokenExpiresAt = providerExpiresAt;
      }

      if (appSessionExpired(token)) {
        return expiredToken(token);
      }

      if (!account && providerTokenNeedsRefresh(token)) {
        token = await refreshKeycloakToken(token);
        if (token.expired) {
          return token;
        }
      }

      let decodedAccessToken = {};

      if (token.accessToken) {
        try {
          decodedAccessToken = decodeJwt(token.accessToken);
        } catch {
          decodedAccessToken = {};
        }
      }

      const mergedSource = [token, decodedAccessToken, profile && typeof profile === "object" ? profile : {}].reduce(
        (accumulator, current) => ({ ...accumulator, ...current }),
        {},
      );
      const email =
        typeof token.email === "string"
          ? token.email
          : typeof mergedSource.email === "string"
            ? mergedSource.email
            : null;
      const uploadLimitBytes = readNumericClaim(
        mergedSource,
        env.KEYCLOAK_FILE_UPLOAD_LIMIT_CLAIMS.split(",").map((value) => value.trim()).filter(Boolean),
      );

      token.email = email;
      const tokenRoles = Array.from(new Set(extractRoles(mergedSource)));
      let resolvedRoles = tokenRoles.length
        ? tokenRoles
        : Array.isArray(token.roles)
          ? token.roles
          : [];

      if (email && (!token.rolesRefreshedAt || Date.now() - token.rolesRefreshedAt > ROLE_REFRESH_INTERVAL_MS)) {
        try {
          const person = await getPersonByEmail(email);
          resolvedRoles = Array.isArray(person.roles) ? person.roles : resolvedRoles;
          token.rolesRefreshedAt = Date.now();
        } catch (error) {
          console.warn(`Unable to refresh Keycloak roles for ${email}: ${error?.message || error}`);
          token.rolesRefreshedAt = Date.now();
        }
      }

      token.roles = Array.from(new Set(resolvedRoles.map(normalizeRole).filter(Boolean))).sort();
      token.isSuperadmin = email
        ? parseCsv(env.SUPERADMIN_EMAILS)
            .map(normalizeEmail)
            .includes(normalizeEmail(email))
        : false;
      token.keycloakSub =
        token.provider === "keycloak" && typeof mergedSource.sub === "string" && mergedSource.sub
          ? mergedSource.sub
          : token.keycloakSub || null;
      token.uploadLimitBytes = uploadLimitBytes ?? token.uploadLimitBytes ?? null;
      token.expired = false;

      return token;
    },
    async session({ session, token }) {
      if (token.expired || tokenIsExpired(token)) {
        session.expires = new Date(0).toISOString();
        session.expired = true;
        session.user = null;
        return session;
      }

      session.accessToken = token.accessToken;
      session.idToken = token.idToken;
      session.provider = token.provider;
      session.expires =
        typeof token.appSessionExpiresAt === "number"
          ? new Date(token.appSessionExpiresAt).toISOString()
          : session.expires;
      session.user = {
        ...session.user,
        id: token.keycloakSub ?? null,
        keycloakSub: token.keycloakSub ?? null,
        roles: token.roles ?? [],
        uploadLimitBytes: token.uploadLimitBytes ?? null,
        isSuperadmin: Boolean(token.isSuperadmin),
      };
      session.keycloakLogoutUrl =
        token.provider === "keycloak" && token.idToken && env.KEYCLOAK_ISSUER
          ? `${env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(env.NEXTAUTH_URL || "https://print.loftrop.com")}&id_token_hint=${encodeURIComponent(token.idToken)}`
          : undefined;

      return session;
    },
  },
};
