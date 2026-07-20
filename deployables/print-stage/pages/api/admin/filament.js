import { getServerSession } from "next-auth/next";

import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";
import { listFilamentUsage } from "../../../lib/filamentLedger";

export default async function handler(req, res) {
  const actor = toFileActor(await getServerSession(req, res, authOptions));
  if (!actor) return res.status(401).json({ error: "Authentication required." });
  if (!actor.isQueueAdmin) return res.status(403).json({ error: "Queue admin role required." });
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed." });
  return res.status(200).json(await listFilamentUsage());
}
