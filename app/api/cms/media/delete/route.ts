import { NextResponse } from "next/server";
import { z } from "zod";

import { forbidden, unauthorized } from "@/src/lib/server/cms-api";
import { AuthError, getWriteRoles, requireRole } from "@/src/lib/server/auth";
import { auditLog, sessionActor } from "@/src/lib/server/audit-log";
import { env } from "@/src/lib/server/env";
import { deleteMediaObject } from "@/src/lib/server/s3";

const requestSchema = z.object({
  key: z.string().min(1),
});

export async function POST(request: Request) {
  let keyForAudit: string | null = null;

  try {
    const session = await requireRole(getWriteRoles());
    const body = requestSchema.parse(await request.json());
    keyForAudit = body.key;
    await deleteMediaObject(body.key);
    auditLog({
      action: "cms.media.delete",
      result: "success",
      ...sessionActor(session),
      resource: env.S3_BUCKET,
      target: body.key,
    });

    return NextResponse.json({ ok: true, key: body.key });
  } catch (error) {
    if (error instanceof AuthError) {
      auditLog({
        action: "cms.media.delete",
        result: error.status === 401 ? "failure" : "denied",
        target: keyForAudit,
        message: error.message,
      });
      return error.status === 401 ? unauthorized(error.message) : forbidden(error.message);
    }

    throw error;
  }
}
