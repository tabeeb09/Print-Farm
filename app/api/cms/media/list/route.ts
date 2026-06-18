import { NextRequest, NextResponse } from "next/server";

import { badRequest, forbidden, unauthorized } from "@/src/lib/server/cms-api";
import { AuthError, getReadRoles, requireRole } from "@/src/lib/server/auth";
import { auditLog, sessionActor } from "@/src/lib/server/audit-log";
import { listMediaObjects } from "@/src/lib/server/s3";

export async function GET(request: NextRequest) {
  try {
    const session = await requireRole(getReadRoles());
    const prefix = request.nextUrl.searchParams.get("prefix") ?? "";
    const payload = await listMediaObjects(prefix);
    auditLog({
      action: "cms.media.list",
      result: "success",
      ...sessionActor(session),
      target: prefix,
      metadata: { objects: payload.objects.length, folders: payload.folders.length },
    });
    return NextResponse.json(payload);
  } catch (error) {
    if (error instanceof AuthError) {
      auditLog({
        action: "cms.media.list",
        result: error.status === 401 ? "failure" : "denied",
        message: error.message,
      });
      return error.status === 401 ? unauthorized(error.message) : forbidden(error.message);
    }

    const message = error instanceof Error ? error.message : "Unable to list media";
    return badRequest(message);
  }
}
