import { NextRequest, NextResponse } from "next/server";

import { AuthError, getAuthenticatedSession, requireRole } from "@/src/lib/server/auth";
import { auditLog, sessionActor } from "@/src/lib/server/audit-log";
import { badRequest, forbidden, unauthorized } from "@/src/lib/server/cms-api";
import {
  createPrivilegeRequest,
  listPrivilegeRequests,
} from "@/src/lib/server/privilege-requests";

export async function GET() {
  try {
    await requireRole(["owner"]);
    return NextResponse.json({ requests: await listPrivilegeRequests() });
  } catch (error) {
    if (error instanceof AuthError) {
      auditLog({
        action: "privilege_request.list",
        result: error.status === 401 ? "failure" : "denied",
        message: error.message,
      });
      return error.status === 401 ? unauthorized() : forbidden();
    }

    throw error;
  }
}

export async function POST(request: NextRequest) {
  const session = await getAuthenticatedSession();
  const email = session?.user?.email;

  if (!email) {
    return unauthorized("A signed-in user with an email address is required.");
  }

  const body = await request.json().catch(() => ({}));
  const requestedRole =
    typeof body.requestedRole === "string" ? body.requestedRole : "media_admin";
  const resource = typeof body.resource === "string" ? body.resource : "cms/media";
  const reason = typeof body.reason === "string" ? body.reason : null;

  if (!requestedRole || !resource) {
    return badRequest("requestedRole and resource are required.");
  }

  const privilegeRequest = await createPrivilegeRequest({
    email,
    name: session.user?.name,
    requestedRole,
    resource,
    reason,
  });
  auditLog({
    action: "privilege_request.create",
    result: "success",
    ...sessionActor(session),
    resource,
    target: requestedRole,
    metadata: { requestId: privilegeRequest.id },
  });

  return NextResponse.json({ request: privilegeRequest });
}
