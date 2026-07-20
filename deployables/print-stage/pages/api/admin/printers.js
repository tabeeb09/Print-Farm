import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { recordAuditEvent } from "../../../lib/auditLog";
import { deletePrinterForAdmin, listPrintersForAdmin, savePrinterForAdmin } from "../../../lib/printerRegistry";

async function requireQueueAdmin(req, res) {
  const actor = toFileActor(await getServerSession(req, res, authOptions));
  if (!actor) return { error: { status: 401, message: "Authentication required." } };
  if (!actor.isQueueAdmin) return { error: { status: 403, message: "Queue admin role required." } };
  return { actor };
}

export default async function handler(req, res) {
  const { actor, error } = await requireQueueAdmin(req, res);
  if (error) return res.status(error.status).json({ error: error.message });

  try {
    if (req.method === "GET") {
      return res.status(200).json(await listPrintersForAdmin());
    }

    if (req.method === "POST") {
      const result = await savePrinterForAdmin(req.body || {});
      await recordAuditEvent(actor, { action: "printer.save", targetType: "printer", targetId: req.body?.id, metadata: req.body });
      return res.status(200).json(result);
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id || req.body?.id || "");
      const result = await deletePrinterForAdmin(id);
      await recordAuditEvent(actor, { action: "printer.delete", targetType: "printer", targetId: id });
      return res.status(200).json(result);
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (caught) {
    return res.status(400).json({ error: caught instanceof Error ? caught.message : "Printer request failed." });
  }
}
