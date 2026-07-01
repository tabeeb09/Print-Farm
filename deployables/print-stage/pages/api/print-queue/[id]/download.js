import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../../lib/authOptions";
import { toFileActor } from "../../../../lib/auth";
import { listPrintQueue } from "../../../../lib/s3Files";
import { env } from "../../../../lib/env";

function createS3Client() {
  return new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

function createPublicS3Client() {
  return new S3Client({
    endpoint: env.S3_PUBLIC_ENDPOINT || env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY,
    },
  });
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", ["GET"]);
    return res.status(405).json({ error: "Method not allowed." });
  }

  const session = await getServerSession(req, res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return res.status(401).json({ error: "Authentication required." });
  }

  if (!actor.isQueueAdmin) {
    return res.status(403).json({ error: "Forbidden." });
  }

  const fileId = Array.isArray(req.query.id) ? req.query.id[0] : req.query.id;

  if (!fileId) {
    return res.status(400).json({ error: "Missing file id." });
  }

  const { files } = await listPrintQueue(actor);
  const file = files.find((item) => item.id === fileId);

  if (!file) {
    return res.status(404).json({ error: "File not found in print queue." });
  }

  const objectKey = file.printQueueObjectKey || file.gcodeObjectKey;

  if (!objectKey) {
    return res.status(404).json({ error: "No generated print artifact is available." });
  }

  const client = createPublicS3Client();
  const downloadUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: objectKey,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
        file.gcodeFilename || `${file.originalFilename}.gcode.3mf`,
      )}`,
    }),
    { expiresIn: 60 },
  );

  return res.redirect(302, downloadUrl);
}
