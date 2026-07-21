import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { recordAuditEvent } from "../../../lib/auditLog";
import { deleteFilament, listFilamentUsage, saveFilament } from "../../../lib/filamentLedger";

export default async function handler(req, res) {
  const actor = toFileActor(await getServerSession(req, res, authOptions));
  if (!actor) return res.status(401).json({ error: "Authentication required." });
  if (!actor.isQueueAdmin) return res.status(403).json({ error: "Queue admin role required." });
  try {
    if (req.method === "GET") {
      return res.status(200).json(await listFilamentUsage());
    }

    if (req.method === "POST") {
      const payload = req.body && typeof req.body === "object" ? req.body : {};
      const result = await saveFilament(payload);
      await recordAuditEvent(actor, {
        action: "filament.save",
        targetType: "filament",
        targetId: payload.id || payload.name,
        metadata: payload,
      });
      return res.status(200).json(result);
    }

    if (req.method === "DELETE") {
      const id = String(req.query.id || req.body?.id || "").trim();
      const result = await deleteFilament(id);
      await recordAuditEvent(actor, {
        action: "filament.delete",
        targetType: "filament",
        targetId: id,
      });
      return res.status(200).json(result);
    }

    res.setHeader("Allow", "GET, POST, DELETE");
    return res.status(405).json({ error: "Method not allowed." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Filament request failed.";
    return res.status(400).json({ error: message });
  }
}
