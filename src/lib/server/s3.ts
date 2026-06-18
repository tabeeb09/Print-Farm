import {
  DeleteObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { env } from "@/src/lib/server/env";

const requiredKeys = [
  "S3_ENDPOINT",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

function assertS3Config() {
  for (const key of requiredKeys) {
    if (!env[key]) {
      throw new Error(`Missing required S3 configuration: ${key}`);
    }
  }
}

function cleanPrefix(prefix?: string) {
  return (prefix ?? "").replace(/^\/+/, "");
}

function joinUrl(base: string, bucket: string, key: string) {
  const normalizedBase = base.replace(/\/+$/, "");

  if (normalizedBase.endsWith(`/${bucket}`)) {
    return `${normalizedBase}/${key}`;
  }

  return `${normalizedBase}/${bucket}/${key}`;
}

function makeClient(endpoint = env.S3_ENDPOINT) {
  assertS3Config();

  return new S3Client({
    endpoint,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: {
      accessKeyId: env.S3_ACCESS_KEY_ID!,
      secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
    },
  });
}

export async function listMediaObjects(prefix?: string) {
  const client = makeClient();
  const normalizedPrefix = cleanPrefix(prefix);
  const folderResponse = await client.send(
    new ListObjectsV2Command({
      Bucket: env.S3_BUCKET,
      Prefix: normalizedPrefix,
      Delimiter: "/",
    }),
  );
  const objectResponse = await client.send(
    new ListObjectsV2Command({
      Bucket: env.S3_BUCKET,
      Prefix: normalizedPrefix,
    }),
  );

  const publicBase =
    env.NEXT_PUBLIC_MEDIA_BASE_URL ?? env.S3_PUBLIC_ENDPOINT ?? env.S3_ENDPOINT!;

  return {
    bucket: env.S3_BUCKET!,
    prefix: normalizedPrefix,
    folders: (folderResponse.CommonPrefixes ?? [])
      .map((item) => item.Prefix)
      .filter((item): item is string => Boolean(item))
      .map((item) => ({ prefix: item })),
    objects: (objectResponse.Contents ?? [])
      .filter((item) => item.Key)
      .map((item) => ({
        key: item.Key!,
        size: item.Size,
        lastModified: item.LastModified?.toISOString(),
        url: joinUrl(publicBase, env.S3_BUCKET!, item.Key!),
      })),
  };
}

export async function createPresignedUploadUrl(key: string, contentType?: string) {
  const client = makeClient(env.S3_PUBLIC_ENDPOINT ?? env.NEXT_PUBLIC_MEDIA_BASE_URL ?? env.S3_ENDPOINT);
  const command = new PutObjectCommand({
    Bucket: env.S3_BUCKET,
    Key: cleanPrefix(key),
    ContentType: contentType || "application/octet-stream",
  });

  return getSignedUrl(client, command, { expiresIn: 300 });
}

export async function uploadMediaObject(
  key: string,
  body: Buffer | Uint8Array | string,
  contentType?: string,
) {
  const client = makeClient();
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: cleanPrefix(key),
      Body: body,
      ContentType: contentType || "application/octet-stream",
    }),
  );
}

export async function getMediaObjectText(key: string) {
  const client = makeClient();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: cleanPrefix(key),
    }),
  );

  return response.Body?.transformToString() ?? "";
}

export async function deleteMediaObject(key: string) {
  const client = makeClient();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: cleanPrefix(key),
    }),
  );
}
