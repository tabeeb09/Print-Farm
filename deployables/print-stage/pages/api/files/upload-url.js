import { getServerSession } from "next-auth/next";
import { z } from "zod";

import { authOptions } from "../../../lib/authOptions";
import { recordAuditEvent } from "../../../lib/auditLog";
import { toFileActor } from "../../../lib/auth";
import { createUploadUrl } from "../../../lib/s3Files";

const requestSchema = z.object({
  filename: z.string().min(1),
  mimeType: z.string().optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  visibility: z.enum(["private", "public", "unlisted"]).optional(),
  filamentSelection: z.string().min(1),
});

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const body = requestSchema.parse(req.body);
    const result = await createUploadUrl(actor, body);
    await recordAuditEvent(actor, {
      action: "print.uploadUrl.create",
      targetType: "printFile",
      targetId: result.file?.id,
      metadata: {
        filename: body.filename,
        sizeBytes: body.sizeBytes,
        filamentSelection: body.filamentSelection,
      },
    });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create upload URL.";
    const status = message === "Forbidden" ? 403 : message.includes("not configured") ? 500 : 400;
    return res.status(status).json({ error: message });
  }
}
