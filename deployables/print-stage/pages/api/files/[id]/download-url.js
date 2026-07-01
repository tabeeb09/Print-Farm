import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../../lib/authOptions";
import { toFileActor } from "../../../../lib/auth";
import { createDownloadUrl } from "../../../../lib/s3Files";

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
    const result = await createDownloadUrl(actor, req.query.id);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to create download URL.";
    const status =
      message === "File not found."
        ? 404
        : message === "Forbidden"
          ? 403
          : 400;
    return res.status(status).json({ error: message });
  }
}
