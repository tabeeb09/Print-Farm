import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "./env.js";

const MAX_THUMBNAIL_DATA_URL_BYTES = 600_000;
const DEFAULT_PROFILE_STORE_PATH = path.join(process.cwd(), ".local-state", "account-profiles");

function normalizeObjectKey(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function storageKey(key) {
  const prefix = normalizeObjectKey(env.S3_PROJECT_KEY_PREFIX);
  const normalizedKey = normalizeObjectKey(key);
  return prefix ? `${prefix}/${normalizedKey}` : normalizedKey;
}

function profileIdForActor(actor) {
  const source = actor?.sub || actor?.email;
  if (!source) throw new Error("Authenticated account is required.");
  return crypto.createHash("sha256").update(String(source)).digest("hex").slice(0, 32);
}

function profileObjectKey(actor) {
  return storageKey(`private/system/account-profiles/${profileIdForActor(actor)}.json`);
}

function profileFilePath(actor) {
  return path.join(process.env.ACCOUNT_PROFILE_STORE_PATH || DEFAULT_PROFILE_STORE_PATH, `${profileIdForActor(actor)}.json`);
}

function hasS3ProfileStore() {
  return Boolean(env.S3_ENDPOINT && env.S3_PRIVATE_BUCKET && env.S3_ACCESS_KEY_ID && env.S3_SECRET_ACCESS_KEY);
}

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

function normalizeThumbnailPhoto(value) {
  const dataUrl = String(value || "").trim();
  if (!dataUrl) return "";
  if (!dataUrl.startsWith("data:image/")) {
    throw new Error("Account thumbnail must be an image data URL.");
  }
  if (dataUrl.length > MAX_THUMBNAIL_DATA_URL_BYTES) {
    throw new Error("Account thumbnail must be 600 KB or smaller after compression.");
  }
  return dataUrl;
}

function normalizeProfile(input = {}, actor = {}) {
  return {
    userId: actor.sub || input.userId || null,
    email: actor.email || input.email || null,
    name: actor.name || input.name || null,
    thumbnailPhoto: normalizeThumbnailPhoto(input.thumbnailPhoto),
    updatedAt: input.updatedAt || null,
  };
}

async function readS3Profile(actor) {
  try {
    const response = await createS3Client().send(
      new GetObjectCommand({
        Bucket: env.S3_PRIVATE_BUCKET,
        Key: profileObjectKey(actor),
      }),
    );
    const text = await response.Body?.transformToString();
    return normalizeProfile(JSON.parse(text || "{}"), actor);
  } catch (error) {
    if (error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404) {
      return normalizeProfile({}, actor);
    }
    throw error;
  }
}

async function writeS3Profile(actor, profile) {
  await createS3Client().send(
    new PutObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: profileObjectKey(actor),
      Body: JSON.stringify(profile, null, 2),
      ContentType: "application/json",
    }),
  );
  return profile;
}

async function readFileProfile(actor) {
  try {
    const text = await fs.readFile(profileFilePath(actor), "utf8");
    return normalizeProfile(JSON.parse(text), actor);
  } catch {
    return normalizeProfile({}, actor);
  }
}

async function writeFileProfile(actor, profile) {
  const target = profileFilePath(actor);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
  return profile;
}

export async function readAccountProfile(actor) {
  return hasS3ProfileStore() ? readS3Profile(actor) : readFileProfile(actor);
}

export async function writeAccountProfile(actor, input = {}) {
  const current = await readAccountProfile(actor);
  const profile = normalizeProfile({
    ...current,
    thumbnailPhoto: Object.prototype.hasOwnProperty.call(input, "thumbnailPhoto")
      ? input.thumbnailPhoto
      : current.thumbnailPhoto,
    updatedAt: new Date().toISOString(),
  }, actor);
  return hasS3ProfileStore() ? writeS3Profile(actor, profile) : writeFileProfile(actor, profile);
}
