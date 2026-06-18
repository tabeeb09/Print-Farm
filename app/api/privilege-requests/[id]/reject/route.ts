import { NextResponse } from "next/server";

import { AuthError, requireRole } from "@/src/lib/server/auth";
import { auditLog, sessionActor } from "@/src/lib/server/audit-log";
import { forbidden, unauthorized } from "@/src/lib/server/cms-api";
import { markPrivilegeRequest } from "@/src/lib/server/privilege-requests";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const session = await requireRole(["owner"]);
    const { id } = await context.params;
    const updated = await markPrivilegeRequest(
      id,
      "rejected",
      session.user?.email ?? "owner",
    );
    auditLog({
      action: "privilege_request.reject",
      result: "success",
      ...sessionActor(session),
      metadata: { requestId: id },
    });

    return NextResponse.json({ request: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      auditLog({
        action: "privilege_request.reject",
        result: error.status === 401 ? "failure" : "denied",
        message: error.message,
      });
      return error.status === 401 ? unauthorized() : forbidden();
    }

    throw error;
  }
}
