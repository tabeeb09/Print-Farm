import { NextRequest, NextResponse } from "next/server";

import { forbidden, unauthorized } from "@/src/lib/server/cms-api";
import { AuthError, getWriteRoles, requireRole } from "@/src/lib/server/auth";
import { auditLog, sessionActor } from "@/src/lib/server/audit-log";
import { listMediaObjects } from "@/src/lib/server/s3";

export async function POST(request: NextRequest) {
  try {
    const session = await requireRole(getWriteRoles());
    const body = (await request.json().catch(() => ({}))) as { prefix?: string };
    const listing = await listMediaObjects(body.prefix);
    auditLog({
      action: "cms.media.sync",
      result: "success",
      ...sessionActor(session),
      target: body.prefix ?? "",
      metadata: { objects: listing.objects.length, folders: listing.folders.length },
    });

    return NextResponse.json({
      ok: true,
      syncedAt: new Date().toISOString(),
      ...listing,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      auditLog({
        action: "cms.media.sync",
        result: error.status === 401 ? "failure" : "denied",
        message: error.message,
      });
      return error.status === 401 ? unauthorized(error.message) : forbidden(error.message);
    }

    throw error;
  }
}
