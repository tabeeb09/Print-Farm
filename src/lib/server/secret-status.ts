const SECRET_GROUPS = {
  websiteAuth: [
    "AUTH_SECRET",
    "NEXTAUTH_URL",
    "NEXT_PUBLIC_SITE_URL",
    "KEYCLOAK_ISSUER",
    "KEYCLOAK_CLIENT_ID",
    "KEYCLOAK_CLIENT_SECRET",
  ],
  cmsMedia: [
    "NEXT_PUBLIC_MEDIA_BASE_URL",
    "S3_ENDPOINT",
    "S3_PUBLIC_ENDPOINT",
    "S3_BUCKET",
    "S3_ACCESS_KEY_ID",
    "S3_SECRET_ACCESS_KEY",
  ],
  keycloakAdminSync: [
    "KEYCLOAK_ADMIN_REALM",
    "KEYCLOAK_ADMIN_CLIENT_ID",
  ],
  oauth2Proxy: [
    "OAUTH2_PROXY_CLIENT_ID",
    "OAUTH2_PROXY_CLIENT_SECRET",
    "OAUTH2_PROXY_COOKIE_SECRET",
    "OAUTH2_PROXY_REDIRECT_URL",
  ],
  openbaoClient: [
    "BAO_ADDR",
    "BAO_KV_MOUNT",
    "BAO_SECRET_PATH_WEBSITE",
    "BAO_SECRET_PATH_RUSTFS",
    "BAO_SECRET_PATH_OAUTH2_PROXY",
    "BAO_SECRET_PATH_KEYCLOAK",
  ],
} as const;

export type SecretGroupName = keyof typeof SECRET_GROUPS;

const SECRET_DEFAULTS: Partial<Record<string, string>> = {
  BAO_KV_MOUNT: "kv",
  BAO_SECRET_PATH_WEBSITE: "website/prod",
  BAO_SECRET_PATH_RUSTFS: "rustfs/prod",
  BAO_SECRET_PATH_OAUTH2_PROXY: "oauth2-proxy/prod",
  BAO_SECRET_PATH_KEYCLOAK: "keycloak/prod",
};

function hasAdminCredential() {
  const hasClientSecret = Boolean(process.env.KEYCLOAK_ADMIN_CLIENT_SECRET);
  const hasUserPassword = Boolean(
    process.env.KEYCLOAK_ADMIN_USERNAME && process.env.KEYCLOAK_ADMIN_PASSWORD,
  );

  return hasClientSecret || hasUserPassword;
}

export function getMissingSecrets(group: SecretGroupName) {
  const missing = SECRET_GROUPS[group].filter((key) => {
    const configured = process.env[key];
    const fallback = SECRET_DEFAULTS[key];

    return !configured && !fallback;
  });

  if (group === "keycloakAdminSync" && !hasAdminCredential()) {
    missing.push(
      "KEYCLOAK_ADMIN_CLIENT_SECRET or KEYCLOAK_ADMIN_USERNAME + KEYCLOAK_ADMIN_PASSWORD",
    );
  }

  return missing;
}

export function getAllSecretStatuses() {
  return Object.keys(SECRET_GROUPS).map((group) => ({
    group: group as SecretGroupName,
    missing: getMissingSecrets(group as SecretGroupName),
  }));
}
