import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { listAuditEvents } from "../../../lib/auditLog";

export default async function handler(req, res) {
  const actor = toFileActor(await getServerSession(req, res, authOptions));
  if (!actor) return res.status(401).json({ error: "Authentication required." });
  if (!actor.isQueueAdmin && !actor.isHrAdmin && !actor.isAssetAdmin) {
    return res.status(403).json({ error: "Admin role required." });
  }
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  return res.status(200).json(await listAuditEvents({ limit: req.query.limit }));
}
