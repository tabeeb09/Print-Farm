import { getServerSession } from "next-auth/next";
import { getSession } from "next-auth/react";

import { authOptions } from "./authOptions";
import { env, parseCsv } from "./env";

export async function requireSessionServer(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return null;
  }

  return session;
}

export async function requireSessionClient() {
  return getSession();
}

export function toFileActor(session) {
  if (!session?.user?.keycloakSub && !session?.user?.id) {
    return null;
  }

  const roles = session.user.roles ?? [];
  const adminRoles = parseCsv(env.KEYCLOAK_FILE_ADMIN_ROLES);
  const queueAdminRoles = parseCsv(env.KEYCLOAK_QUEUE_ADMIN_ROLES);
  const openBaoAdminRoles = parseCsv(env.KEYCLOAK_OPENBAO_ADMIN_ROLES);
  const hrAdminRoles = parseCsv(env.KEYCLOAK_HR_ADMIN_ROLES);
  const assetAdminRoles = parseCsv(env.KEYCLOAK_ASSET_ADMIN_ROLES);
  const superadminEmails = parseCsv(env.SUPERADMIN_EMAILS).map((email) => email.toLowerCase());
  const email = session.user.email ?? null;
  const isSuperadmin = email ? superadminEmails.includes(email.toLowerCase()) : false;

  return {
    sub: session.user.keycloakSub ?? session.user.id,
    email,
    name: session.user.name ?? null,
    roles,
    uploadLimitBytes:
      typeof session.user.uploadLimitBytes === "number" && session.user.uploadLimitBytes > 0
        ? session.user.uploadLimitBytes
        : env.FILE_UPLOAD_MAX_BYTES,
    isFileAdmin: isSuperadmin || adminRoles.some((role) => roles.includes(role)),
    isQueueAdmin: isSuperadmin || queueAdminRoles.some((role) => roles.includes(role)),
    isOpenBaoAdmin: isSuperadmin || openBaoAdminRoles.some((role) => roles.includes(role)),
    isHrAdmin: isSuperadmin || hrAdminRoles.some((role) => roles.includes(role)),
    isAssetAdmin: isSuperadmin || assetAdminRoles.some((role) => roles.includes(role)),
    isSuperadmin,
  };
}
