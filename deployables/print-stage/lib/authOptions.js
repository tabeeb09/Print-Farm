import KeycloakProvider from "next-auth/providers/keycloak";
import { decodeJwt } from "jose";

import { env } from "./env";

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
      if (account?.access_token) {
        token.accessToken = account.access_token;
      }

      if (account?.id_token) {
        token.idToken = account.id_token;
      }

      if (account?.provider) {
        token.provider = account.provider;
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
      token.roles = token.roles?.length ? token.roles : tokenRoles;
      token.keycloakSub =
        token.provider === "keycloak" && typeof mergedSource.sub === "string" && mergedSource.sub
          ? mergedSource.sub
          : token.keycloakSub || null;
      token.uploadLimitBytes = uploadLimitBytes ?? token.uploadLimitBytes ?? null;

      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.idToken = token.idToken;
      session.provider = token.provider;
      session.user = {
        ...session.user,
        id: token.keycloakSub ?? null,
        keycloakSub: token.keycloakSub ?? null,
        roles: token.roles ?? [],
        uploadLimitBytes: token.uploadLimitBytes ?? null,
      };
      session.keycloakLogoutUrl =
        token.provider === "keycloak" && token.idToken && env.KEYCLOAK_ISSUER
          ? `${env.KEYCLOAK_ISSUER}/protocol/openid-connect/logout?post_logout_redirect_uri=${encodeURIComponent(env.NEXTAUTH_URL || "https://print.loftrop.com")}&id_token_hint=${encodeURIComponent(token.idToken)}`
          : undefined;

      return session;
    },
  },
};
