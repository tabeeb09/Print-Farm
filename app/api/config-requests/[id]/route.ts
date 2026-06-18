import { NextResponse } from "next/server";

import { AuthError, requireRole } from "@/src/lib/server/auth";
import { auditLog, sessionActor } from "@/src/lib/server/audit-log";
import { badRequest, forbidden, unauthorized } from "@/src/lib/server/cms-api";
import { provideConfigRequestValue } from "@/src/lib/server/config-requests";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  try {
    const session = await requireRole(["owner", "config_admin"]);
    const { id } = await context.params;
    const body = await request.json().catch(() => ({}));
    const value = typeof body.value === "string" ? body.value : "";

    if (!value.trim()) {
      return badRequest("value is required.");
    }

    const updated = await provideConfigRequestValue(id, value);
    auditLog({
      action: "config_request.provide_value",
      result: "success",
      ...sessionActor(session),
      resource: updated.targetPath,
      target: updated.key,
      metadata: { requestId: id, secret: updated.secret },
    });
    return NextResponse.json({ request: updated });
  } catch (error) {
    if (error instanceof AuthError) {
      auditLog({
        action: "config_request.provide_value",
        result: error.status === 401 ? "failure" : "denied",
        message: error.message,
      });
      return error.status === 401 ? unauthorized() : forbidden();
    }

    return NextResponse.json({ error: (error as Error).message }, { status: 500 });
  }
}
