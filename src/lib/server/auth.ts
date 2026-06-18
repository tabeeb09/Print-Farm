import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";

import { authOptions } from "@/app/auth";
import { env, parseCsv } from "@/src/lib/server/env";

export class AuthError extends Error {
  status: 401 | 403;

  constructor(status: 401 | 403, message: string) {
    super(message);
    this.status = status;
  }
}

export async function getAuthenticatedSession() {
  return getServerSession(authOptions);
}

export async function requireSession() {
  const session = await getAuthenticatedSession();

  if (!session) {
    redirect("/api/auth/signin");
  }

  return session;
}

export async function requireRole(roles: string[]) {
  const session = await getAuthenticatedSession();

  if (!session) {
    throw new AuthError(401, "Authentication required");
  }

  const userRoles = session.user?.roles ?? [];
  const authorized = roles.some((role) => userRoles.includes(role));

  if (!authorized) {
    throw new AuthError(403, "Insufficient role");
  }

  return session;
}

export function getReadRoles() {
  return Array.from(
    new Set(["viewer", "editor", ...parseCsv(env.KEYCLOAK_REQUIRED_MEDIA_ROLES)]),
  );
}

export function getWriteRoles() {
  return parseCsv(env.KEYCLOAK_REQUIRED_MEDIA_ROLES);
}
