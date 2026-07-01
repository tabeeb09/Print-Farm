import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../lib/authOptions";
import { toFileActor } from "../../../lib/auth";
import { listFiles } from "../../../lib/s3Files";

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const { cursor = null, ownerSub = null } = req.query;
    const result = await listFiles(actor, {
      cursor: typeof cursor === "string" ? cursor : null,
      ownerSub: typeof ownerSub === "string" ? ownerSub : null,
    });
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to list files.";
    const status = message === "Forbidden" ? 403 : 500;
    return res.status(status).json({ error: message });
  }
}
