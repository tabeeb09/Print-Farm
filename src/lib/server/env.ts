import { z } from "zod";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const envSchema = z.object({
  AUTH_SECRET: optionalNonEmptyString,
  NEXTAUTH_SECRET: optionalNonEmptyString,
  NEXT_PUBLIC_SITE_URL: optionalUrl,
  NEXTAUTH_URL: optionalUrl,
  S3_ENDPOINT: optionalUrl,
  S3_PUBLIC_ENDPOINT: optionalUrl,
  NEXT_PUBLIC_MEDIA_BASE_URL: optionalUrl,
  S3_BUCKET: optionalNonEmptyString,
  S3_PRIVATE_BUCKET: optionalNonEmptyString,
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: optionalNonEmptyString,
  S3_SECRET_ACCESS_KEY: optionalNonEmptyString,
  KEYCLOAK_ISSUER: optionalUrl,
  KEYCLOAK_CLIENT_ID: optionalNonEmptyString,
  KEYCLOAK_CLIENT_SECRET: optionalNonEmptyString,
  KEYCLOAK_REQUIRED_MEDIA_ROLES: z.string().default("owner,media_admin"),
  KEYCLOAK_ASSET_ADMIN_ROLES: z.string().default("owner,asset_admin"),
  KEYCLOAK_ROLE_CLAIM_PATH: z.string().default("realm_access.roles"),
  KEYCLOAK_ADMIN_REALM: z.string().default("master"),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().default("admin-cli"),
  KEYCLOAK_ADMIN_CLIENT_SECRET: optionalNonEmptyString,
  KEYCLOAK_ADMIN_USERNAME: optionalNonEmptyString,
  KEYCLOAK_ADMIN_PASSWORD: optionalNonEmptyString,
  GOOGLE_CLIENT_ID: optionalNonEmptyString,
  GOOGLE_CLIENT_SECRET: optionalNonEmptyString,
  ALLOWED_EMAILS: z.string().optional(),
  BAO_ADDR: optionalUrl,
  BAO_KV_MOUNT: z.string().default("kv"),
  BAO_CONFIG_REQUEST_PATH: z.string().default("caid/config-requests"),
  BAO_APPROLE_AUTH_PATH: z.string().default("approle"),
  OPENBAO_ROLE_ID: optionalNonEmptyString,
  OPENBAO_SECRET_ID: optionalNonEmptyString,
});

export const env = envSchema.parse(process.env);

export function getAuthSecret() {
  return env.AUTH_SECRET ?? env.NEXTAUTH_SECRET ?? "";
}

export function getBaseUrl() {
  return env.NEXT_PUBLIC_SITE_URL ?? env.NEXTAUTH_URL ?? "http://localhost:3000";
}

export function parseCsv(value: string | undefined) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
