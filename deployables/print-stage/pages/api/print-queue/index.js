import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../lib/authOptions";
import { toFileActor } from "../../../lib/auth";
import { recordAuditEvent } from "../../../lib/auditLog";
import { listPrintQueue, markNextQueuedFileAsPrinting } from "../../../lib/s3Files";

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    if (req.method === "POST") {
      const file = await markNextQueuedFileAsPrinting(actor);
      await recordAuditEvent(actor, {
        action: "printQueue.markNextPrinting",
        targetType: "printFile",
        targetId: file.id,
        metadata: { originalFilename: file.originalFilename },
      });
      return res.status(200).json({ file });
    }

    const result = await listPrintQueue(actor);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Print queue request failed.";
    const status = message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: message });
  }
}
