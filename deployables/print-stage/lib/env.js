import { z } from "zod";
import os from "node:os";

const isWindows = os.platform() === "win32";

const optionalNonEmptyString = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().url().optional(),
);

const envSchema = z.object({
  NEXTAUTH_URL: optionalUrl,
  NEXTAUTH_SECRET: optionalNonEmptyString,
  KEYCLOAK_ISSUER: optionalUrl,
  KEYCLOAK_CLIENT_ID: optionalNonEmptyString,
  KEYCLOAK_CLIENT_SECRET: optionalNonEmptyString,
  KEYCLOAK_FILE_ADMIN_ROLES: z.string().default("owner,technician,print_admin,media_admin"),
  KEYCLOAK_QUEUE_ADMIN_ROLES: z.string().default("owner,technician,print_admin"),
  KEYCLOAK_OPENBAO_ADMIN_ROLES: z.string().default("owner,openbao_admin,infra_admin"),
  KEYCLOAK_HR_ADMIN_ROLES: z.string().default("owner,identity_hr_manager"),
  KEYCLOAK_HR_SCOPE_ATTRIBUTE: z.string().default("managed_by"),
  KEYCLOAK_MANAGEABLE_ROLES: z
    .string()
    .default("viewer,editor,media_admin,technician,print_admin,config_admin,openbao_admin,infra_admin,identity_hr_manager"),
  KEYCLOAK_ROLE_CLAIM_PATH: z.string().default("resource_access.website.roles"),
  KEYCLOAK_FILE_UPLOAD_LIMIT_CLAIMS: z
    .string()
    .default("file_upload_limit_bytes,fileUploadLimitBytes"),
  KEYCLOAK_ADMIN_REALM: z.string().default("master"),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().default("admin-cli"),
  KEYCLOAK_ADMIN_CLIENT_SECRET: optionalNonEmptyString,
  KEYCLOAK_ADMIN_USERNAME: optionalNonEmptyString,
  KEYCLOAK_ADMIN_PASSWORD: optionalNonEmptyString,
  SUPERADMIN_EMAILS: z.string().default("tabeebrahman.logistics@gmail.com"),
  APP_BASE_URL: optionalUrl,
  S3_ENDPOINT: optionalUrl,
  S3_PUBLIC_ENDPOINT: optionalUrl,
  S3_PRIVATE_BUCKET: optionalNonEmptyString,
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: optionalNonEmptyString,
  S3_SECRET_ACCESS_KEY: optionalNonEmptyString,
  STRIPE_SECRET_KEY: optionalNonEmptyString,
  STRIPE_WEBHOOK_SECRET: optionalNonEmptyString,
  BAO_ADDR: optionalUrl,
  BAO_KV_MOUNT: z.string().default("kv"),
  BAO_APPROLE_AUTH_PATH: z.string().default("approle"),
  BAO_ADMIN_TOKEN: optionalNonEmptyString,
  BAO_ADMIN_ROLE_ID: optionalNonEmptyString,
  BAO_ADMIN_SECRET_ID: optionalNonEmptyString,
  FILE_UPLOAD_MAX_BYTES: z.coerce.number().int().positive().default(262144000),
  FILE_ALLOWED_MIME_TYPES: z.string().default(""),
  FILE_ALLOWED_EXTENSIONS: z
    .string()
    .default("3mf,stl,obj,step,stp,iges,igs,ply,amf"),
  ORCA_SLICER_BIN: z
    .string()
    .default(
      isWindows
        ? "C:\\Program Files\\OrcaSlicer\\orca-slicer.exe"
        : "/opt/orca-slicer/squashfs-root/bin/orca-slicer",
    ),
  ORCA_MACHINE_PROFILE: z
    .string()
    .default(
      isWindows
        ? "C:\\Users\\This PC\\AppData\\Roaming\\OrcaSlicer\\system\\BBL\\machine\\Bambu Lab X1 Carbon 0.4 nozzle.json"
        : "/opt/orca-profiles/BBL/machine/Bambu Lab X1 Carbon 0.4 nozzle.json",
    ),
  ORCA_PROCESS_PROFILE: z
    .string()
    .default(
      isWindows
        ? "C:\\Users\\This PC\\AppData\\Roaming\\OrcaSlicer\\system\\BBL\\process\\0.20mm Standard @BBL X1C.json"
        : "/opt/orca-profiles/BBL/process/0.20mm Standard @BBL X1C.json",
    ),
  ORCA_FILAMENT_PROFILE_DIR: z
    .string()
    .default(
      isWindows
        ? "C:\\Users\\This PC\\AppData\\Roaming\\OrcaSlicer\\system\\BBL\\filament"
        : "/opt/orca-profiles/BBL/filament",
    ),
});

export const env = envSchema.parse(process.env);

export function parseCsv(value) {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}
