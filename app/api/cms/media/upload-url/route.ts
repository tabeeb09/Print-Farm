import { NextResponse } from "next/server";
import { z } from "zod";

import { forbidden, unauthorized } from "@/src/lib/server/cms-api";
import { AuthError, getWriteRoles, requireRole } from "@/src/lib/server/auth";
import { auditLog, sessionActor } from "@/src/lib/server/audit-log";
import { env } from "@/src/lib/server/env";
import { createPresignedUploadUrl } from "@/src/lib/server/s3";

const requestSchema = z.object({
  key: z.string().min(1),
  contentType: z.string().optional(),
});

export async function POST(request: Request) {
  let keyForAudit: string | null = null;

  try {
    const session = await requireRole(getWriteRoles());

    const body = requestSchema.parse(await request.json());
    keyForAudit = body.key;
    const uploadUrl = await createPresignedUploadUrl(body.key, body.contentType);
    auditLog({
      action: "cms.media.presign_upload",
      result: "success",
      ...sessionActor(session),
      resource: env.S3_BUCKET,
      target: body.key,
      metadata: { contentType: body.contentType ?? null },
    });

    return NextResponse.json({
      bucket: env.S3_BUCKET,
      key: body.key,
      uploadUrl,
      publicUrl: `${(env.NEXT_PUBLIC_MEDIA_BASE_URL ?? env.S3_PUBLIC_ENDPOINT ?? "").replace(/\/+$/, "")}/${env.S3_BUCKET}/${body.key}`,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      auditLog({
        action: "cms.media.presign_upload",
        result: error.status === 401 ? "failure" : "denied",
        target: keyForAudit,
        message: error.message,
      });
      return error.status === 401 ? unauthorized(error.message) : forbidden(error.message);
    }

    throw error;
  }
}
