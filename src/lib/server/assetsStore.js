import fs from "node:fs/promises";
import path from "node:path";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { createInitialAssetState, migrateAssetState } from "./assetsDomain.js";

const DEFAULT_ASSET_STORE_PATH = path.join(process.cwd(), ".local-state", "assets.json");
const ASSET_STATE_OBJECT_KEY = "private/system/assets/state.json";

function getAssetStorePath() {
  return process.env.ASSET_STORE_PATH || DEFAULT_ASSET_STORE_PATH;
}

function hasS3Config() {
  return Boolean(
    process.env.S3_ENDPOINT &&
      process.env.S3_ACCESS_KEY_ID &&
      process.env.S3_SECRET_ACCESS_KEY &&
      (process.env.S3_PRIVATE_BUCKET || process.env.S3_BUCKET),
  );
}

function makeS3Client() {
  return new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || "us-east-1",
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY,
    },
  });
}

function getAssetBucket() {
  return process.env.S3_PRIVATE_BUCKET || process.env.S3_BUCKET;
}

async function readLocalAssetState() {
  try {
    const text = await fs.readFile(getAssetStorePath(), "utf8");
    return migrateAssetState(JSON.parse(text));
  } catch {
    return createInitialAssetState();
  }
}

async function writeLocalAssetState(state) {
  const target = getAssetStorePath();
  const next = migrateAssetState(state);
  next.updatedAt = new Date().toISOString();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  return next;
}

export async function readAssetState() {
  if (!hasS3Config()) {
    return readLocalAssetState();
  }

  const client = makeS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: getAssetBucket(),
        Key: ASSET_STATE_OBJECT_KEY,
      }),
    );
    const text = await response.Body?.transformToString();
    return text ? migrateAssetState(JSON.parse(text)) : createInitialAssetState();
  } catch (error) {
    const status = error?.$metadata?.httpStatusCode;
    const name = error?.name || "";
    if (status === 404 || name === "NoSuchKey" || name === "NotFound") {
      return createInitialAssetState();
    }
    throw error;
  }
}

export async function writeAssetState(state) {
  const next = migrateAssetState(state);
  next.updatedAt = new Date().toISOString();

  if (!hasS3Config()) {
    return writeLocalAssetState(next);
  }

  const client = makeS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: getAssetBucket(),
      Key: ASSET_STATE_OBJECT_KEY,
      Body: JSON.stringify(next, null, 2),
      ContentType: "application/json",
    }),
  );
  return next;
}

export async function updateAssetState(mutator) {
  const current = await readAssetState();
  const result = await mutator(current);
  const nextState = result?.state || current;
  const saved = await writeAssetState(nextState);
  return { ...result, state: saved };
}
