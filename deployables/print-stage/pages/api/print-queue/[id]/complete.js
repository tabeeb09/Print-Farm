import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../../lib/authOptions";
import { toFileActor } from "../../../../lib/auth";
import { recordAuditEvent } from "../../../../lib/auditLog";
import { markPrintSuccessful } from "../../../../lib/s3Files";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const actor = toFileActor(await getServerSession(req, res, authOptions));
  if (!actor) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (!actor.isQueueAdmin) {
    return res.status(403).json({ error: "Queue admin role required." });
  }

  try {
    const result = await markPrintSuccessful(actor, req.query.id, {
      actualGrams: req.body?.actualGrams,
      source: "manual",
    });
    await recordAuditEvent(actor, {
      action: "printQueue.complete",
      targetType: "printFile",
      targetId: result.file?.id || req.query.id,
      metadata: {
        originalFilename: result.file?.originalFilename,
        expectedGrams: result.expectedGrams,
        actualGrams: result.actualGrams,
        deltaMinor: result.deltaMinor,
        adjustmentTransactionId: result.adjustmentTransaction?.id || null,
      },
    });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Print completion failed.";
    const status =
      message === "File not found."
        ? 404
        : message === "Forbidden"
          ? 403
          : 400;
    return res.status(status).json({ error: message });
  }
}
