import { NextResponse } from "next/server";

import { AuthError, requireRole } from "@/src/lib/server/auth";
import { auditLog, sessionActor } from "@/src/lib/server/audit-log";
import { forbidden, unauthorized } from "@/src/lib/server/cms-api";
import { assignKeycloakClientRoleByEmail } from "@/src/lib/server/keycloak-admin";
import {
  getPrivilegeRequest,
  markPrivilegeRequest,
} from "@/src/lib/server/privilege-requests";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const assignableRoles = new Set([
  "viewer",
  "editor",
  "media_admin",
  "owner",
  "infra_admin",
  "identity_hr_manager",
  "config_admin",
  "audit_admin",
  "logging_admin",
  "openbao_admin",
  "rustfs_admin",
  "netbird_admin",
]);

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireRole(["owner"]);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const current = await getPrivilegeRequest(id);

    if (!current) {
      return NextResponse.json({ error: "Privilege request not found." }, { status: 404 });
    }

    const role =
      typeof body.role === "string" && body.role.trim()
        ? body.role.trim()
        : current.requestedRole;

    if (!assignableRoles.has(role)) {
      return NextResponse.json({ error: "Requested role is not assignable." }, { status: 400 });
    }

    await assignKeycloakClientRoleByEmail(current.email, role);

    const updated = await markPrivilegeRequest(
      id,
      "approved",
      session.user?.email ?? "owner",
      role,
    );
    auditLog({
      action: "privilege_request.approve",
      result: "success",
      ...sessionActor(session),
      resource: current.resource,
      target: current.email,
      metadata: { requestId: id, assignedRole: role },
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      auditLog({
        action: "privilege_request.approve",
        result: error.status === 401 ? "failure" : "denied",
        message: error.message,
      });
      return error.status === 401 ? unauthorized() : forbidden();
    }

    throw error;
  }
}
