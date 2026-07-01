import { getServerSession } from "next-auth/next";
import { z } from "zod";

import { authOptions } from "../../../../lib/authOptions";
import { toFileActor } from "../../../../lib/auth";
import { deleteFile, updateFileMetadata } from "../../../../lib/s3Files";

const patchSchema = z.object({
  filamentSelection: z.string().min(1),
});

export default async function handler(req, res) {
  if (req.method !== "DELETE" && req.method !== "PATCH") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    if (req.method === "PATCH") {
      const body = patchSchema.parse(req.body);
      const file = await updateFileMetadata(actor, req.query.id, body);
      return res.status(200).json({ file });
    }

    const result = await deleteFile(actor, req.query.id);
    return res.status(200).json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to delete file.";
    const status =
      message === "File not found." ? 404 : message === "Forbidden" ? 403 : 400;
    return res.status(status).json({ error: message });
  }
}
