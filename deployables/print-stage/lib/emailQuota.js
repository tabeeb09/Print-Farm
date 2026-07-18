import crypto from "node:crypto";

import {
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

import { env } from "./env.js";

const EVENT_PASSWORD_RESET = "password_reset";
const EVENT_QUOTA_ALERT = "quota_alert";

export class DailyEmailLimitError extends Error {
  constructor(status) {
    super(`Daily email limit reached: ${status.count}/${status.limit}`);
    this.name = "DailyEmailLimitError";
    this.status = status;
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

function parseFlag(value, defaultValue = true) {
  if (value === undefined || value === null || value === "") return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function getUtcDay(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

function getQuotaPrefix(day = getUtcDay()) {
  return `${env.EMAIL_QUOTA_S3_PREFIX.replace(/\/+$/, "")}/${day}`;
}

async function listKeys(prefix) {
  const client = createS3Client();
  const keys = [];
  let ContinuationToken;

  do {
    const response = await client.send(new ListObjectsV2Command({
      Bucket: env.S3_PRIVATE_BUCKET,
      Prefix: prefix,
      ContinuationToken,
    }));

    keys.push(...(response.Contents || []).map((item) => item.Key).filter(Boolean));
    ContinuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (ContinuationToken);

  return keys;
}

async function putEmailEvent(kind, metadata = {}, day = getUtcDay()) {
  const client = createS3Client();
  const now = new Date();
  const id = `${now.toISOString()}-${crypto.randomUUID()}`;
  const key = `${getQuotaPrefix(day)}/events/${kind}/${id}.json`;

  await client.send(new PutObjectCommand({
    Bucket: env.S3_PRIVATE_BUCKET,
    Key: key,
    ContentType: "application/json",
    Body: JSON.stringify({
      id,
      kind,
      createdAt: now.toISOString(),
      day,
      metadata,
    }),
  }));

  return key;
}

function hashEmail(email) {
  return crypto
    .createHash("sha256")
    .update(String(email || "").trim().toLowerCase())
    .digest("hex");
}

export async function getEmailQuotaStatus(day = getUtcDay()) {
  const prefix = `${getQuotaPrefix(day)}/events/`;
  const keys = await listKeys(prefix);
  const alertKeys = keys.filter((key) => key.includes(`/events/${EVENT_QUOTA_ALERT}/`));
  const limit = env.EMAIL_DAILY_LIMIT;
  const reserveAlert = parseFlag(env.EMAIL_DAILY_ALERT_RESERVE, true);
  const userLimit = Math.max(0, limit - (reserveAlert ? 1 : 0));

  return {
    day,
    limit,
    userLimit,
    count: keys.length,
    alertReserved: alertKeys.length > 0,
    remainingTotal: Math.max(0, limit - keys.length),
    remainingUser: Math.max(0, userLimit - keys.length),
  };
}

export async function reservePasswordResetEmail({ recipientEmail, trigger = EVENT_PASSWORD_RESET }) {
  const status = await getEmailQuotaStatus();

  if (status.count >= status.userLimit) {
    throw new DailyEmailLimitError(status);
  }

  await putEmailEvent(EVENT_PASSWORD_RESET, {
    recipientHash: hashEmail(recipientEmail),
    trigger,
  }, status.day);

  return getEmailQuotaStatus(status.day);
}

export async function reserveQuotaAlertEmail(metadata = {}) {
  const status = await getEmailQuotaStatus();

  if (status.alertReserved) {
    return { reserved: false, reason: "already_reserved", status };
  }

  if (status.count >= status.limit) {
    return { reserved: false, reason: "limit_reached", status };
  }

  await putEmailEvent(EVENT_QUOTA_ALERT, metadata, status.day);
  return { reserved: true, status: await getEmailQuotaStatus(status.day) };
}
