import { NextResponse } from "next/server";

import { forbidden, unauthorized } from "@/src/lib/server/cms-api";
import { AuthError, getWriteRoles, requireRole } from "@/src/lib/server/auth";
import { auditLog, sessionActor } from "@/src/lib/server/audit-log";
import { env } from "@/src/lib/server/env";
import { uploadMediaObject } from "@/src/lib/server/s3";

export async function POST(request: Request) {
  let keyForAudit: string | null = null;

  try {
    const session = await requireRole(getWriteRoles());

    const formData = await request.formData();
    const key = formData.get("key");
    const file = formData.get("file");

    if (typeof key !== "string" || !key.trim()) {
      return NextResponse.json({ error: "A target object key is required." }, { status: 400 });
    }

    keyForAudit = key;

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A file upload is required." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    await uploadMediaObject(key, buffer, file.type);
    auditLog({
      action: "cms.media.upload",
      result: "success",
      ...sessionActor(session),
      resource: env.S3_BUCKET,
      target: key,
      metadata: { bytes: buffer.byteLength, contentType: file.type || "application/octet-stream" },
    });

    return NextResponse.json({
      bucket: env.S3_BUCKET,
      key,
      publicUrl: `${(env.NEXT_PUBLIC_MEDIA_BASE_URL ?? env.S3_PUBLIC_ENDPOINT ?? "").replace(/\/+$/, "")}/${env.S3_BUCKET}/${key}`,
      uploadedVia: "server",
    });
  } catch (error) {
    if (error instanceof AuthError) {
      auditLog({
        action: "cms.media.upload",
        result: error.status === 401 ? "failure" : "denied",
        target: keyForAudit,
        message: error.message,
      });
      return error.status === 401 ? unauthorized(error.message) : forbidden(error.message);
    }

    throw error;
  }
}
