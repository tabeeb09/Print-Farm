import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../../lib/authOptions";
import { recordAuditEvent } from "../../../../lib/auditLog";
import { cancelPrint, requestPrint } from "../../../../lib/s3Files";
import { toFileActor } from "../../../../lib/auth";

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const result =
      req.method === "POST"
        ? await requestPrint(actor, req.query.id)
        : await cancelPrint(actor, req.query.id);
    await recordAuditEvent(actor, {
      action: req.method === "POST" ? "print.request" : "print.cancel",
      targetType: "printFile",
      targetId: result.id,
      metadata: {
        originalFilename: result.originalFilename,
        printStatus: result.printStatus,
      },
    });
    return res.status(200).json({ file: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Print queue update failed.";
    const status =
      message === "File not found."
        ? 404
        : message === "Forbidden"
          ? 403
          : 400;
    return res.status(status).json({ error: message });
  }
}
