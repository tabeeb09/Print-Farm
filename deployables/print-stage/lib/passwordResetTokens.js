import crypto from "node:crypto";

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "./env.js";

const TOKEN_ID_BYTES = 16;
const TOKEN_SECRET_BYTES = 32;

export class PasswordResetTokenError extends Error {
  constructor(message = "Invalid or expired password reset token.") {
    super(message);
    this.name = "PasswordResetTokenError";
  }
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

function normalizeObjectKey(value) {
  return String(value || "").replace(/^\/+|\/+$/g, "");
}

function storageKey(key) {
  const prefix = normalizeObjectKey(env.S3_PROJECT_KEY_PREFIX);
  const normalizedKey = normalizeObjectKey(key);
  return prefix ? `${prefix}/${normalizedKey}` : normalizedKey;
}

function getTokenPrefix() {
  return storageKey(env.PASSWORD_RESET_TOKEN_S3_PREFIX.replace(/\/+$/, ""));
}

function buildTokenKey(tokenId) {
  return `${getTokenPrefix()}/${tokenId}.json`;
}

function hashValue(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function timingSafeEqualHex(left, right) {
  const leftBuffer = Buffer.from(String(left || ""), "hex");
  const rightBuffer = Buffer.from(String(right || ""), "hex");

  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function createTokenParts() {
  return {
    tokenId: crypto.randomBytes(TOKEN_ID_BYTES).toString("base64url"),
    tokenSecret: crypto.randomBytes(TOKEN_SECRET_BYTES).toString("base64url"),
  };
}

function parseToken(rawToken) {
  const [tokenId, tokenSecret, extra] = String(rawToken || "").trim().split(".");

  if (
    extra ||
    !tokenId ||
    !tokenSecret ||
    !/^[A-Za-z0-9_-]+$/.test(tokenId) ||
    !/^[A-Za-z0-9_-]+$/.test(tokenSecret)
  ) {
    throw new PasswordResetTokenError();
  }

  return { tokenId, tokenSecret };
}

async function readTokenRecord(tokenId) {
  const client = createS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: env.S3_PRIVATE_BUCKET,
        Key: buildTokenKey(tokenId),
      }),
    );
    const text = await response.Body?.transformToString();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function writeTokenRecord(tokenId, record) {
  const client = createS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: buildTokenKey(tokenId),
      ContentType: "application/json",
      Body: JSON.stringify(record),
    }),
  );
}

export async function createPasswordResetToken({ userId, email, trigger }) {
  const { tokenId, tokenSecret } = createTokenParts();
  const now = new Date();
  const ttlMinutes = env.PASSWORD_RESET_TOKEN_TTL_MINUTES;
  const expiresAt = new Date(now.getTime() + ttlMinutes * 60_000);
  const record = {
    id: tokenId,
    userId,
    emailHash: hashValue(String(email || "").trim().toLowerCase()),
    secretHash: hashValue(tokenSecret),
    trigger,
    createdAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
    usedAt: null,
  };

  await writeTokenRecord(tokenId, record);

  return {
    token: `${tokenId}.${tokenSecret}`,
    expiresAt: record.expiresAt,
    ttlMinutes,
  };
}

export async function consumePasswordResetToken(rawToken) {
  const { tokenId, tokenSecret } = parseToken(rawToken);
  const record = await readTokenRecord(tokenId);
  const now = new Date();

  if (!record || record.id !== tokenId || !record.userId || !record.secretHash) {
    throw new PasswordResetTokenError();
  }

  if (record.usedAt || new Date(record.expiresAt).getTime() <= now.getTime()) {
    throw new PasswordResetTokenError();
  }

  if (!timingSafeEqualHex(record.secretHash, hashValue(tokenSecret))) {
    throw new PasswordResetTokenError();
  }

  const consumed = {
    ...record,
    usedAt: now.toISOString(),
  };

  await writeTokenRecord(tokenId, consumed);

  return consumed;
}
