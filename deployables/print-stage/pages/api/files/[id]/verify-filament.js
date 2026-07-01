import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../../lib/authOptions";
import { toFileActor } from "../../../../lib/auth";
import { verifyFileFilamentMetadata } from "../../../../lib/s3Files";

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
    const file = await verifyFileFilamentMetadata(actor, req.query.id);
    return res.status(200).json({ file });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Filament verification failed.";
    const status =
      message === "File not found."
        ? 404
        : message === "Forbidden"
          ? 403
          : 400;
    return res.status(status).json({ error: message });
  }
}
