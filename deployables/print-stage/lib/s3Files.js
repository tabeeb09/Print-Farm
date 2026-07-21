import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  recordPrintFilamentAdjustmentTransaction,
  recordPrintPaymentTransaction,
} from "./assetsDomain.js";
import { updateAssetState } from "./assetsStore.js";
import { listDiscounts, selectBestDiscountForGroups } from "./discountStore.js";
import { env, parseCsv } from "./env.js";
import { recordFilamentUsageForPrint } from "./filamentLedger.js";
import { getPersonByEmail } from "./keycloakAdmin.js";
import { extractOrca3mfMetadataFromBuffer } from "./orca3mf";
import { inspect3mfPackageFromBuffer } from "./orca3mfPackage";
import { sliceModelTo3mf } from "./orcaSlicer";
import { computePrintPriceForBreakdown, computePrintPriceQuote } from "./printPricing.js";
import {
  FILAMENT_EXTRACT_VALUE,
  getPrintEligibility,
  isSliceableModelFile,
  isValidFilamentSelection,
} from "./printPolicy";

const DEFAULT_PAGE_SIZE = 25;
const DOWNLOAD_URL_TTL_SECONDS = 60;
const UPLOAD_URL_TTL_SECONDS = 300;
const MANIFEST_FOLDER = "private/system/files/manifests";
const PRINT_QUEUE_FOLDER = "private/system/print-queue";
const GCODE_FOLDER = "private/system/files/gcode";
const DEFAULT_RUNTIME_ENV_FILE = ".env.runtime";
const DEFAULT_WORKER_CONFIG_DIR = process.env.PRINT_WORKER_CONFIG_DIR || process.env.XDG_CONFIG_HOME || path.join(process.env.HOME || process.env.USERPROFILE || ".", ".config");
const DEFAULT_WORKER_CONFIG_FILE = process.env.PRINT_WORKER_PRINTER_CONFIG_FILE || path.join(DEFAULT_WORKER_CONFIG_DIR, "caid-print-worker", "printers.json");

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

function sanitizeFilename(filename) {
  const normalized = filename
    .normalize("NFKC")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "file";
}

function getFileExtension(filename) {
  const parts = filename.split(".");
  return parts.length > 1 ? parts.pop().toLowerCase() : "";
}

function buildObjectKey(ownerSub, fileId, filename) {
  return `private/users/${ownerSub}/${fileId}/${sanitizeFilename(filename)}`;
}

function buildManifestKey(fileId) {
  return `${MANIFEST_FOLDER}/${fileId}.json`;
}

function buildGcodeObjectKey(ownerSub, fileId, filename) {
  return `${GCODE_FOLDER}/${ownerSub}/${fileId}/${sanitizeFilename(filename)}`;
}

function buildPrintQueueObjectKey(ownerSub, fileId, filename) {
  return `${PRINT_QUEUE_FOLDER}/${ownerSub}/${fileId}/${sanitizeFilename(filename)}`;
}

function getRuntimeEnvFilePath() {
  return process.env.PRINT_WORKER_RUNTIME_ENV_FILE || path.join(process.cwd(), DEFAULT_RUNTIME_ENV_FILE);
}

function getPrinterConfigPath() {
  return DEFAULT_WORKER_CONFIG_FILE;
}

function decodeCursor(cursor) {
  if (!cursor) {
    return 0;
  }

  const parsed = Number.parseInt(cursor, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

function encodeCursor(offset) {
  return String(offset);
}

function canAccessFile(actor, ownerSub) {
  return actor.isFileAdmin || actor.sub === ownerSub;
}

function canManagePrintQueue(actor) {
  return Boolean(actor?.isQueueAdmin);
}

function getPrintState(manifest) {
  return manifest.printStatus ?? "idle";
}

function hasGeneratedGcodeArtifact(manifest) {
  return typeof manifest?.gcodeObjectKey === "string" &&
    manifest.gcodeObjectKey.length > 0 &&
    typeof manifest?.gcodeFilename === "string" &&
    /\.gcode\.3mf$/i.test(manifest.gcodeFilename);
}

function hasQueueArtifact(manifest) {
  return typeof manifest?.printQueueObjectKey === "string" &&
    manifest.printQueueObjectKey.length > 0 &&
    /\.gcode\.3mf$/i.test(manifest.printQueueObjectKey);
}

function decorateManifest(manifest) {
  const quoteDiscount = manifest.paymentQuoteAtCheckout?.discount || manifest.paymentDiscount || null;
  return {
    ...manifest,
    paymentStatus: manifest.paymentStatus ?? "unpaid",
    paymentQuote: computePrintPriceQuote(manifest, quoteDiscount),
    paymentQuoteAtCheckout: manifest.paymentQuoteAtCheckout ?? null,
    paymentDiscount: manifest.paymentDiscount ?? null,
    paymentSessionId: manifest.paymentSessionId ?? null,
    paymentIntentId: manifest.paymentIntentId ?? null,
    paymentAmountTotalMinor: manifest.paymentAmountTotalMinor ?? null,
    paymentCurrency: manifest.paymentCurrency ?? null,
    paidAt: manifest.paidAt ?? null,
  };
}

export async function getPrintDiscountForActor(actor) {
  if (!actor?.email) {
    return null;
  }

  try {
    const discountState = await listDiscounts();
    const activeDiscounts = (discountState.discounts || []).filter((discount) => discount?.active !== false);
    if (!activeDiscounts.length) {
      return null;
    }
    const person = await getPersonByEmail(actor.email);
    return selectBestDiscountForGroups(activeDiscounts, person.groups || []);
  } catch {
    return null;
  }
}

function applyPrintDiscount(files, discount) {
  if (!discount) {
    return files;
  }

  return files.map((file) => ({
    ...file,
    paymentDiscount: file.paymentDiscount || discount,
    paymentQuote: computePrintPriceQuote(file, file.paymentDiscount || discount),
  }));
}

function assertAllowedFile(request) {
  const trimmedFilename = request.filename?.trim();

  if (!trimmedFilename) {
    throw new Error("Filename is required.");
  }

  const uploadLimitBytes =
    typeof request.uploadLimitBytes === "number" && request.uploadLimitBytes > 0
      ? request.uploadLimitBytes
      : env.FILE_UPLOAD_MAX_BYTES;

  if (typeof request.sizeBytes === "number" && request.sizeBytes > uploadLimitBytes) {
    throw new Error(`File exceeds the maximum allowed size of ${uploadLimitBytes} bytes.`);
  }

  const allowedMimeTypes = parseCsv(env.FILE_ALLOWED_MIME_TYPES);
  const allowedExtensions = parseCsv(env.FILE_ALLOWED_EXTENSIONS).map((value) =>
    value.toLowerCase().replace(/^\./, ""),
  );
  const extension = getFileExtension(trimmedFilename);
  const mimeType = request.mimeType?.trim();
  const mimeAllowed =
    !allowedMimeTypes.length || (mimeType ? allowedMimeTypes.includes(mimeType) : false);
  const extensionAllowed =
    !allowedExtensions.length || (extension ? allowedExtensions.includes(extension) : false);

  if ((allowedMimeTypes.length || allowedExtensions.length) && !mimeAllowed && !extensionAllowed) {
    throw new Error("File type is not allowed.");
  }

  if (extension === "gcode") {
    throw new Error("Pre-sliced G-code uploads are not accepted.");
  }
}

async function ensureBucketExists() {
  const client = createS3Client();
  await client.send(new HeadBucketCommand({ Bucket: env.S3_PRIVATE_BUCKET }));
}

async function writeManifest(manifest) {
  await ensureBucketExists();
  const client = createS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: buildManifestKey(manifest.id),
      Body: JSON.stringify(manifest),
      ContentType: "application/json",
    }),
  );
}

async function writeObjectBuffer(objectKey, body, contentType) {
  await ensureBucketExists();
  const client = createS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: objectKey,
      Body: body,
      ContentType: contentType,
    }),
  );
}

async function readManifest(fileId) {
  const client = createS3Client();

  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: env.S3_PRIVATE_BUCKET,
        Key: buildManifestKey(fileId),
      }),
    );
    const text = await response.Body?.transformToString();
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function readObjectBuffer(objectKey) {
  const client = createS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: objectKey,
    }),
  );

  const bytes = await response.Body?.transformToByteArray();
  return bytes ? Buffer.from(bytes) : Buffer.from([]);
}

async function getObjectInfo(objectKey) {
  const client = createS3Client();

  try {
    return await client.send(
      new HeadObjectCommand({
        Bucket: env.S3_PRIVATE_BUCKET,
        Key: objectKey,
      }),
    );
  } catch {
    return null;
  }
}

async function hydrateManifest(manifest) {
  const objectInfo = await getObjectInfo(manifest.objectKey);

  if (!objectInfo) {
    return manifest;
  }

  const hydrated = {
    ...manifest,
    mimeType: manifest.mimeType ?? objectInfo.ContentType ?? undefined,
    sizeBytes:
      typeof manifest.sizeBytes === "number"
        ? manifest.sizeBytes
        : typeof objectInfo.ContentLength === "number"
          ? objectInfo.ContentLength
          : undefined,
    status: manifest.status === "rejected" ? "rejected" : "uploaded",
    updatedAt: new Date().toISOString(),
    printStatus: getPrintState(manifest),
    printRequestedAt: manifest.printRequestedAt ?? null,
    printStartedAt: manifest.printStartedAt ?? null,
    printQueueObjectKey: manifest.printQueueObjectKey ?? null,
    filamentSelection: manifest.filamentSelection ?? null,
    extractionStatus: manifest.extractionStatus ?? "pending",
    extractedFilamentType: manifest.extractedFilamentType ?? null,
    extractedGrams: manifest.extractedGrams ?? null,
    extractedFilamentBreakdown: Array.isArray(manifest.extractedFilamentBreakdown)
      ? manifest.extractedFilamentBreakdown
      : [],
    extractionError: manifest.extractionError ?? null,
    sliceStatus: manifest.sliceStatus ?? "pending",
    slicedObjectKey: manifest.slicedObjectKey ?? null,
    slicedFilename: manifest.slicedFilename ?? null,
    sliceError: manifest.sliceError ?? null,
    slicedAt: manifest.slicedAt ?? null,
    gcodeObjectKey: manifest.gcodeObjectKey ?? null,
    gcodeFilename: manifest.gcodeFilename ?? null,
    paymentStatus: manifest.paymentStatus ?? "unpaid",
    paymentQuoteAtCheckout: manifest.paymentQuoteAtCheckout ?? null,
    paymentDiscount: manifest.paymentDiscount ?? null,
    paymentSessionId: manifest.paymentSessionId ?? null,
    paymentIntentId: manifest.paymentIntentId ?? null,
    paymentAmountTotalMinor: manifest.paymentAmountTotalMinor ?? null,
    paymentCurrency: manifest.paymentCurrency ?? null,
    paidAt: manifest.paidAt ?? null,
    printCompletedAt: manifest.printCompletedAt ?? null,
    actualFilamentGrams: manifest.actualFilamentGrams ?? null,
    actualFilamentBreakdown: Array.isArray(manifest.actualFilamentBreakdown)
      ? manifest.actualFilamentBreakdown
      : [],
    printCompletionAdjustmentMinor: manifest.printCompletionAdjustmentMinor ?? null,
    printCompletionAdjustmentTransactionId: manifest.printCompletionAdjustmentTransactionId ?? null,
  };

  if (
    hydrated.status !== manifest.status ||
    hydrated.sizeBytes !== manifest.sizeBytes ||
    hydrated.mimeType !== manifest.mimeType
  ) {
    await writeManifest(hydrated);
  }

  return decorateManifest(hydrated);
}

async function listManifestFiles(ownerSub, limit, offset) {
  const client = createS3Client();
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: env.S3_PRIVATE_BUCKET,
      Prefix: `${MANIFEST_FOLDER}/`,
      MaxKeys: 200,
    }),
  );

  const keys = (response.Contents ?? [])
    .map((item) => item.Key)
    .filter((key) => Boolean(key) && key.endsWith(".json"))
    .sort()
    .reverse();

  const manifests = [];

  for (const key of keys.slice(offset)) {
    const manifest = await readManifest(key.replace(`${MANIFEST_FOLDER}/`, "").replace(/\.json$/, ""));

    if (manifest && manifest.ownerSub === ownerSub) {
      manifests.push(manifest);
    }

    if (manifests.length >= limit) {
      break;
    }
  }

  return {
    manifests,
    totalKeys: keys.length,
  };
}

async function listAllManifestKeys() {
  const client = createS3Client();
  const response = await client.send(
    new ListObjectsV2Command({
      Bucket: env.S3_PRIVATE_BUCKET,
      Prefix: `${MANIFEST_FOLDER}/`,
      MaxKeys: 1000,
    }),
  );

  return (response.Contents ?? [])
    .map((item) => item.Key)
    .filter((key) => Boolean(key) && key.endsWith(".json"))
    .sort()
    .reverse();
}

async function readAllManifests() {
  const keys = await listAllManifestKeys();
  const manifests = [];

  for (const key of keys) {
    const manifest = await readManifest(key.replace(`${MANIFEST_FOLDER}/`, "").replace(/\.json$/, ""));

    if (manifest) {
      manifests.push(manifest);
    }
  }

  return manifests;
}

async function deleteQueueCopyIfPresent(manifest) {
  if (!manifest?.printQueueObjectKey) {
    return;
  }

  const client = createS3Client();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_PRIVATE_BUCKET,
        Key: manifest.printQueueObjectKey,
      }),
    );
  } catch {}
}

async function deleteSliceCopyIfPresent(manifest) {
  if (!manifest?.slicedObjectKey) {
    return;
  }

  const client = createS3Client();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_PRIVATE_BUCKET,
        Key: manifest.slicedObjectKey,
      }),
    );
  } catch {}
}

async function deleteGcodeCopyIfPresent(manifest) {
  if (!manifest?.gcodeObjectKey) {
    return;
  }

  const client = createS3Client();

  try {
    await client.send(
      new DeleteObjectCommand({
        Bucket: env.S3_PRIVATE_BUCKET,
        Key: manifest.gcodeObjectKey,
      }),
    );
  } catch {}
}

async function computeUsedBytes(ownerSub) {
  const allManifests = await readAllManifests();

  return allManifests
    .filter((manifest) => manifest.ownerSub === ownerSub)
    .reduce((total, manifest) => total + (typeof manifest.sizeBytes === "number" ? manifest.sizeBytes : 0), 0);
}

async function processFileForPrinting(manifest) {
  if (!manifest?.filamentSelection) {
    throw new Error("A filament selection is required before backend slicing.");
  }

  if (!isSliceableModelFile(manifest)) {
    const failed = {
      ...manifest,
      extractionStatus: "failed",
      extractionError: "Only unsliced model files or unsliced Orca project files are accepted.",
      sliceStatus: "failed",
      sliceError: "Only unsliced model files or unsliced Orca project files are accepted.",
      extractedFilamentBreakdown: [],
      paymentStatus: "unpaid",
      paymentSessionId: null,
      paymentIntentId: null,
      paymentAmountTotalMinor: null,
      paymentCurrency: null,
      paidAt: null,
      updatedAt: new Date().toISOString(),
    };
    await writeManifest(failed);
    return hydrateManifest(failed);
  }

  const sourceBuffer = await readObjectBuffer(manifest.objectKey);

  if (getFileExtension(manifest.originalFilename) === "3mf") {
    const inspected = await inspect3mfPackageFromBuffer(sourceBuffer, manifest.originalFilename);

    if (inspected.kind === "sliced") {
      const failed = {
        ...manifest,
        extractionStatus: "failed",
        extractionError: "Pre-sliced 3MF files are not accepted. Upload a model or an unsliced Orca project file.",
        sliceStatus: "failed",
        sliceError: "Pre-sliced 3MF files are not accepted. Upload a model or an unsliced Orca project file.",
        extractedFilamentBreakdown: [],
        paymentStatus: "unpaid",
        paymentSessionId: null,
        paymentIntentId: null,
        paymentAmountTotalMinor: null,
        paymentCurrency: null,
        paidAt: null,
        updatedAt: new Date().toISOString(),
      };
      await writeManifest(failed);
      return hydrateManifest(failed);
    }
  }

  try {
    const sliced = await sliceModelTo3mf({
      buffer: sourceBuffer,
      originalFilename: manifest.originalFilename,
      filamentSelection: manifest.filamentSelection,
    });

    await deleteSliceCopyIfPresent(manifest);
    await deleteGcodeCopyIfPresent(manifest);

    const gcodeObjectKey = buildGcodeObjectKey(manifest.ownerSub, manifest.id, sliced.outputFilename);
    await writeObjectBuffer(
      gcodeObjectKey,
      sliced.outputBuffer,
      "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
    );

    const extracted = await extractOrca3mfMetadataFromBuffer(sliced.outputBuffer, sliced.outputFilename);
    const gcodeFilename = sliced.outputFilename;
    const slicedObjectKey = gcodeObjectKey;

    const updated = {
      ...manifest,
      ...extracted,
      extractionStatus: extracted.extractionStatus === "verified" ? "verified" : "failed",
      extractedFilamentType: extracted.extractedFilamentType ?? manifest.filamentSelection,
      slicedObjectKey,
      slicedFilename: sliced.outputFilename,
      gcodeObjectKey,
      gcodeFilename,
      sliceStatus: "sliced",
      sliceError: null,
      slicedAt: new Date().toISOString(),
      paymentStatus: "unpaid",
      paymentSessionId: null,
      paymentIntentId: null,
      paymentAmountTotalMinor: null,
      paymentCurrency: null,
      paidAt: null,
      updatedAt: new Date().toISOString(),
    };
    await writeManifest(updated);
    return hydrateManifest(updated);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Automatic slicing failed.";
    const failed = {
      ...manifest,
      extractionStatus: "failed",
      extractionError: message,
      sliceStatus: "failed",
      sliceError: message,
      extractedFilamentBreakdown: [],
      paymentStatus: "unpaid",
      paymentSessionId: null,
      paymentIntentId: null,
      paymentAmountTotalMinor: null,
      paymentCurrency: null,
      paidAt: null,
      updatedAt: new Date().toISOString(),
    };
    await writeManifest(failed);
    return hydrateManifest(failed);
  }
}

export async function createUploadUrl(actor, request) {
  if (!isValidFilamentSelection(request.filamentSelection)) {
    throw new Error("A valid filament selection is required before upload.");
  }

  if (
    request.filamentSelection === FILAMENT_EXTRACT_VALUE &&
    getFileExtension(request.filename) !== "3mf"
  ) {
    throw new Error("Extract from file is only supported for Orca project 3MF uploads.");
  }

  const usedBytes = await computeUsedBytes(actor.sub);
  const uploadLimitBytes = actor.uploadLimitBytes;
  const remainingBytes = Math.max(uploadLimitBytes - usedBytes, 0);
  const requestedSizeBytes = typeof request.sizeBytes === "number" ? request.sizeBytes : 0;

  if (requestedSizeBytes > remainingBytes) {
    throw new Error(`Upload limit exceeded. ${remainingBytes} bytes remaining for this account.`);
  }

  assertAllowedFile({
    ...request,
    uploadLimitBytes: remainingBytes,
  });

  const fileId = crypto.randomUUID();
  const objectKey = buildObjectKey(actor.sub, fileId, request.filename);
  const manifest = {
    id: fileId,
    ownerSub: actor.sub,
    bucket: env.S3_PRIVATE_BUCKET,
    objectKey,
    originalFilename: request.filename,
    mimeType: request.mimeType || undefined,
    sizeBytes: request.sizeBytes,
    status: "pending",
    visibility: request.visibility ?? "private",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    printStatus: "idle",
    printRequestedAt: null,
    printStartedAt: null,
    printQueueObjectKey: null,
    filamentSelection: request.filamentSelection,
    extractionStatus: "pending",
    extractedFilamentType: null,
    extractedGrams: null,
    extractedFilamentBreakdown: [],
    extractionError: null,
    sliceStatus: isSliceableModelFile({ originalFilename: request.filename }) ? "pending" : "not_required",
    slicedObjectKey: null,
    slicedFilename: null,
    sliceError: null,
    slicedAt: null,
    gcodeObjectKey: null,
    gcodeFilename: null,
    paymentStatus: "unpaid",
    paymentSessionId: null,
    paymentIntentId: null,
    paymentAmountTotalMinor: null,
    paymentCurrency: null,
    paidAt: null,
  };

  await writeManifest(manifest);

  const client = createPublicS3Client();
  const uploadUrl = await getSignedUrl(
    client,
    new PutObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: objectKey,
      ContentType: request.mimeType || "application/octet-stream",
    }),
    { expiresIn: UPLOAD_URL_TTL_SECONDS },
  );

  return {
    file: manifest,
    uploadUrl,
    uploadMethod: "PUT",
    uploadHeaders: request.mimeType ? { "Content-Type": request.mimeType } : {},
  };
}

export async function listFiles(actor, options = {}) {
  const ownerSub = options.ownerSub && actor.isFileAdmin ? options.ownerSub : actor.sub;
  const limit = Math.min(Math.max(options.limit ?? DEFAULT_PAGE_SIZE, 1), 100);
  const offset = decodeCursor(options.cursor);
  const { manifests, totalKeys } = await listManifestFiles(ownerSub, limit, offset);
  const files = applyPrintDiscount(await Promise.all(manifests.map(hydrateManifest)), await getPrintDiscountForActor(actor));
  const usedBytes = await computeUsedBytes(ownerSub);
  const uploadLimitBytes = ownerSub === actor.sub ? actor.uploadLimitBytes : null;

  return {
    files: files.filter((file) => canAccessFile(actor, file.ownerSub)),
    nextCursor: offset + manifests.length < totalKeys ? encodeCursor(offset + manifests.length) : null,
    summary: {
      usedBytes,
      uploadLimitBytes,
      remainingBytes:
        typeof uploadLimitBytes === "number" ? Math.max(uploadLimitBytes - usedBytes, 0) : null,
    },
    actor: {
      isFileAdmin: actor.isFileAdmin,
      isQueueAdmin: actor.isQueueAdmin,
      email: actor.email,
      paymentsEnabled: Boolean(env.STRIPE_SECRET_KEY),
    },
  };
}

export async function createDownloadUrl(actor, fileId) {
  const manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  if (!canAccessFile(actor, manifest.ownerSub)) {
    throw new Error("Forbidden");
  }

  const hydrated = await hydrateManifest(manifest);
  const client = createPublicS3Client();
  const downloadUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: hydrated.objectKey,
      ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(
        hydrated.originalFilename,
      )}`,
    }),
    { expiresIn: DOWNLOAD_URL_TTL_SECONDS },
  );

  return {
    file: hydrated,
    downloadUrl,
    expiresInSeconds: DOWNLOAD_URL_TTL_SECONDS,
  };
}

export async function deleteFile(actor, fileId) {
  const manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  if (!canAccessFile(actor, manifest.ownerSub)) {
    throw new Error("Forbidden");
  }

  if (getPrintState(manifest) !== "idle") {
    throw new Error("Cannot delete a file that is in the print queue.");
  }

  await deleteSliceCopyIfPresent(manifest);
  await deleteGcodeCopyIfPresent(manifest);
  const client = createS3Client();
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: manifest.objectKey,
    }),
  );
  await client.send(
    new DeleteObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: buildManifestKey(fileId),
    }),
  );

  return { id: fileId };
}

export async function updateFileMetadata(actor, fileId, updates) {
  const manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  if (!canAccessFile(actor, manifest.ownerSub)) {
    throw new Error("Forbidden");
  }

  const next = { ...manifest };

  if (Object.prototype.hasOwnProperty.call(updates, "filamentSelection")) {
    if (!isValidFilamentSelection(updates.filamentSelection)) {
      throw new Error("A valid filament selection is required.");
    }

    await deleteSliceCopyIfPresent(next);
    await deleteGcodeCopyIfPresent(next);
    next.filamentSelection = updates.filamentSelection;
    next.extractionStatus = "pending";
    next.extractedFilamentType = null;
    next.extractedGrams = null;
    next.extractedFilamentBreakdown = [];
    next.extractionError = null;
    next.sliceStatus = isSliceableModelFile(next) ? "pending" : "not_required";
    next.slicedObjectKey = null;
    next.slicedFilename = null;
    next.sliceError = null;
    next.slicedAt = null;
    next.gcodeObjectKey = null;
    next.gcodeFilename = null;
    next.paymentStatus = "unpaid";
    next.paymentSessionId = null;
    next.paymentIntentId = null;
    next.paymentAmountTotalMinor = null;
    next.paymentCurrency = null;
    next.paidAt = null;
  }

  next.updatedAt = new Date().toISOString();
  await writeManifest(next);
  return hydrateManifest(next);
}

export async function verifyFileFilamentMetadata(actor, fileId) {
  const manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  if (!canAccessFile(actor, manifest.ownerSub)) {
    throw new Error("Forbidden");
  }

  return processFileForPrinting(manifest);
}

export async function getFileForActor(actor, fileId) {
  const manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  if (!canAccessFile(actor, manifest.ownerSub)) {
    throw new Error("Forbidden");
  }

  return hydrateManifest(manifest);
}

export async function markPaymentSessionPending(actor, fileId, paymentSession, quote = null) {
  const manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  if (!canAccessFile(actor, manifest.ownerSub)) {
    throw new Error("Forbidden");
  }

  const updated = {
    ...manifest,
    paymentStatus: "checkout_pending",
    paymentSessionId: paymentSession.id,
    paymentIntentId: typeof paymentSession.payment_intent === "string" ? paymentSession.payment_intent : null,
    paymentAmountTotalMinor: paymentSession.amount_total ?? null,
    paymentCurrency: paymentSession.currency ?? null,
    paymentQuoteAtCheckout: quote ?? manifest.paymentQuoteAtCheckout ?? null,
    paymentDiscount: quote?.discount ?? manifest.paymentDiscount ?? null,
    paidAt: null,
    updatedAt: new Date().toISOString(),
  };

  await writeManifest(updated);
  await updateAssetState((state) =>
    recordPrintPaymentTransaction(state, {
      fileId: updated.id,
      userId: updated.ownerSub,
      amountPence: updated.paymentAmountTotalMinor,
      printName: updated.originalFilename,
      paidAt: updated.paidAt,
    }),
  );
  return hydrateManifest(updated);
}

export async function markFilePaidFromCheckoutSession(fileId, checkoutSession) {
  const manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  const updated = {
    ...manifest,
    paymentStatus: "paid",
    paymentSessionId: checkoutSession.id,
    paymentIntentId: typeof checkoutSession.payment_intent === "string"
      ? checkoutSession.payment_intent
      : manifest.paymentIntentId ?? null,
    paymentAmountTotalMinor: checkoutSession.amount_total ?? manifest.paymentAmountTotalMinor ?? null,
    paymentCurrency: checkoutSession.currency ?? manifest.paymentCurrency ?? null,
    paidAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeManifest(updated);
  return hydrateManifest(updated);
}

export async function requestPrint(actor, fileId) {
  let manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  if (!canAccessFile(actor, manifest.ownerSub)) {
    throw new Error("Forbidden");
  }

  const printState = getPrintState(manifest);

  if (printState !== "idle") {
    throw new Error("File is already queued for printing.");
  }

  const needsProcessing =
    manifest.extractionStatus !== "verified" ||
    manifest.sliceStatus !== "sliced" ||
    !hasGeneratedGcodeArtifact(manifest);

  if (needsProcessing) {
    manifest = await verifyFileFilamentMetadata(actor, fileId);
  } else {
    manifest = await hydrateManifest(manifest);
  }

  const printEligibility = getPrintEligibility(manifest);

  if (!printEligibility.canPrint) {
    throw new Error(printEligibility.reason);
  }

  if (manifest.sliceStatus !== "sliced" || !hasGeneratedGcodeArtifact(manifest)) {
    throw new Error("Only backend-sliced files with a generated G-code artifact can enter the print queue.");
  }

  if (manifest.paymentStatus !== "paid") {
    throw new Error("Payment is required before this file can enter the print queue.");
  }

  const queueObjectKey = buildPrintQueueObjectKey(
    manifest.ownerSub,
    manifest.id,
    manifest.gcodeFilename,
  );
  const sourceObjectKey = manifest.gcodeObjectKey;
  const client = createS3Client();
  await client.send(
    new CopyObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      CopySource: `${env.S3_PRIVATE_BUCKET}/${sourceObjectKey}`,
      Key: queueObjectKey,
    }),
  );

  const updated = {
    ...manifest,
    printStatus: "queued",
    printRequestedAt: new Date().toISOString(),
    printStartedAt: null,
    printQueueObjectKey: queueObjectKey,
    updatedAt: new Date().toISOString(),
  };

  await writeManifest(updated);
  return hydrateManifest(updated);
}

export async function cancelPrint(actor, fileId) {
  const manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  if (!canAccessFile(actor, manifest.ownerSub)) {
    throw new Error("Forbidden");
  }

  const printState = getPrintState(manifest);

  if (printState === "idle") {
    throw new Error("File is not in the print queue.");
  }

  if (printState === "printing" && !canManagePrintQueue(actor)) {
    throw new Error("Forbidden");
  }

  await deleteQueueCopyIfPresent(manifest);

  const updated = {
    ...manifest,
    printStatus: "idle",
    printRequestedAt: null,
    printStartedAt: null,
    printQueueObjectKey: null,
    updatedAt: new Date().toISOString(),
  };

  await writeManifest(updated);
  return hydrateManifest(updated);
}

function getExpectedFilamentGrams(manifest, quote = null) {
  if (quote?.totalGrams && Number.isFinite(Number(quote.totalGrams))) {
    return Number(quote.totalGrams);
  }
  if (typeof manifest?.extractedGrams === "number" && Number.isFinite(manifest.extractedGrams)) {
    return manifest.extractedGrams;
  }
  if (Array.isArray(manifest?.extractedFilamentBreakdown)) {
    const total = manifest.extractedFilamentBreakdown.reduce((sum, item) => sum + (Number(item.grams) || 0), 0);
    return total > 0 ? total : null;
  }
  return null;
}

function buildActualFilamentBreakdown(manifest, actualGrams) {
  const expectedBreakdown = Array.isArray(manifest?.extractedFilamentBreakdown) && manifest.extractedFilamentBreakdown.length
    ? manifest.extractedFilamentBreakdown
    : [{
        filamentType: manifest?.extractedFilamentType || manifest?.filamentSelection || "Unknown",
        grams: getExpectedFilamentGrams(manifest) || actualGrams,
      }];
  const expectedTotal = expectedBreakdown.reduce((sum, item) => sum + (Number(item.grams) || 0), 0);

  if (!expectedTotal || expectedTotal <= 0) {
    return [{
      filamentType: manifest?.extractedFilamentType || manifest?.filamentSelection || "Unknown",
      grams: actualGrams,
    }];
  }

  let allocated = 0;
  return expectedBreakdown.map((item, index) => {
    const grams = index === expectedBreakdown.length - 1
      ? Math.max(0, actualGrams - allocated)
      : Math.max(0, (actualGrams * (Number(item.grams) || 0)) / expectedTotal);
    allocated += grams;
    return {
      filamentType: item.filamentType || manifest?.extractedFilamentType || manifest?.filamentSelection || "Unknown",
      grams,
    };
  }).filter((item) => item.grams > 0);
}

export async function completePrintedFile(fileId, updates = {}) {
  const manifest = await readManifest(fileId);

  if (!manifest) {
    throw new Error("File not found.");
  }

  const printState = getPrintState(manifest);
  if (printState !== "queued" && printState !== "printing") {
    throw new Error("File is not queued or printing.");
  }

  const expectedQuote = manifest.paymentQuoteAtCheckout ||
    computePrintPriceQuote(manifest, manifest.paymentDiscount || null);
  const expectedGrams = getExpectedFilamentGrams(manifest, expectedQuote);
  const actualGrams = Number(updates.actualGrams ?? expectedGrams);

  if (!Number.isFinite(actualGrams) || actualGrams <= 0) {
    throw new Error("Actual filament grams must be greater than zero.");
  }

  const actualBreakdown = buildActualFilamentBreakdown(manifest, actualGrams);
  const actualQuote = computePrintPriceForBreakdown(actualBreakdown, expectedQuote?.discount || manifest.paymentDiscount || null);
  const expectedMinor = Number.isFinite(Number(manifest.paymentAmountTotalMinor))
    ? Number(manifest.paymentAmountTotalMinor)
    : Number(expectedQuote?.totalMinor || 0);
  const actualMinor = Number(actualQuote?.totalMinor || 0);
  const deltaMinor = actualQuote ? actualMinor - expectedMinor : 0;

  let adjustmentTransaction = null;
  if (deltaMinor !== 0) {
    const adjustment = await updateAssetState((state) =>
      recordPrintFilamentAdjustmentTransaction(state, {
        fileId: manifest.id,
        userId: manifest.ownerSub,
        userEmail: manifest.ownerEmail,
        amountPence: deltaMinor,
        printName: manifest.originalFilename,
        createdByAdminId: updates.completedById || null,
        createdByAdminEmail: updates.completedByEmail || null,
        description: `${deltaMinor > 0 ? "Extra" : "Reduced"} filament usage for ${manifest.originalFilename}: expected ${(expectedGrams || 0).toFixed(2)} g, actual ${actualGrams.toFixed(2)} g`,
      }),
    );
    adjustmentTransaction = adjustment.transaction || null;
  }

  await deleteQueueCopyIfPresent(manifest);

  const updated = {
    ...manifest,
    printStatus: "completed",
    printCompletedAt: new Date().toISOString(),
    actualFilamentGrams: actualGrams,
    actualFilamentBreakdown: actualBreakdown,
    printCompletionSource: updates.source || "manual",
    printCompletionAdjustmentMinor: deltaMinor,
    printCompletionAdjustmentTransactionId: adjustmentTransaction?.id || null,
    printQueueObjectKey: null,
    updatedAt: new Date().toISOString(),
  };

  await writeManifest(updated);
  await recordFilamentUsageForPrint(updated, updates.source || "manual", { breakdown: actualBreakdown });

  return {
    file: await hydrateManifest(updated),
    expectedGrams,
    actualGrams,
    expectedMinor,
    actualMinor,
    deltaMinor,
    adjustmentTransaction,
  };
}

export async function markPrintSuccessful(actor, fileId, updates = {}) {
  if (!canManagePrintQueue(actor)) {
    throw new Error("Forbidden");
  }
  return completePrintedFile(fileId, {
    ...updates,
    completedById: actor?.sub || null,
    completedByEmail: actor?.email || null,
  });
}

export async function listPrintQueue(actor) {
  if (!canManagePrintQueue(actor)) {
    throw new Error("Forbidden");
  }

  const manifests = await readAllManifests();
  const queueFiles = manifests
    .filter((manifest) => {
      const printState = getPrintState(manifest);
      return (printState === "queued" || printState === "printing") &&
        hasGeneratedGcodeArtifact(manifest) &&
        hasQueueArtifact(manifest);
    })
    .sort((left, right) => {
      const leftPrinting = getPrintState(left) === "printing";
      const rightPrinting = getPrintState(right) === "printing";

      if (leftPrinting && !rightPrinting) {
        return -1;
      }

      if (!leftPrinting && rightPrinting) {
        return 1;
      }

      return new Date(left.printRequestedAt ?? left.createdAt).getTime() -
        new Date(right.printRequestedAt ?? right.createdAt).getTime();
    });

  return {
    files: await Promise.all(queueFiles.map(hydrateManifest)),
  };
}

export async function markNextQueuedFileAsPrinting(actor) {
  if (!canManagePrintQueue(actor)) {
    throw new Error("Forbidden");
  }

  const manifests = await readAllManifests();
  const currentPrinting = manifests.find((manifest) =>
    getPrintState(manifest) === "printing" &&
    hasGeneratedGcodeArtifact(manifest) &&
    hasQueueArtifact(manifest)
  );

  if (currentPrinting) {
    return hydrateManifest(currentPrinting);
  }

  const nextQueued = manifests
    .filter((manifest) =>
      getPrintState(manifest) === "queued" &&
      hasGeneratedGcodeArtifact(manifest) &&
      hasQueueArtifact(manifest)
    )
    .sort(
      (left, right) =>
        new Date(left.printRequestedAt ?? left.createdAt).getTime() -
        new Date(right.printRequestedAt ?? right.createdAt).getTime(),
    )[0];

  if (!nextQueued) {
    throw new Error("No queued files available.");
  }

  const updated = {
    ...nextQueued,
    printStatus: "printing",
    printStartedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await writeManifest(updated);
  return hydrateManifest(updated);
}

export async function loadRuntimeEnv() {
  const runtimeEnvFile = getRuntimeEnvFilePath();

  try {
    const text = await fs.readFile(runtimeEnvFile, "utf8");
    const loaded = {};
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;
      const equalsIndex = line.indexOf("=");
      if (equalsIndex < 1) continue;
      const key = line.slice(0, equalsIndex).trim();
      const value = line.slice(equalsIndex + 1).trim();
      if (key) {
        loaded[key] = value;
      }
    }
    return { ...env, ...loaded };
  } catch {
    return { ...env };
  }
}

export function getEffectiveStorageConfig(runtime = {}) {
  const source = runtime && typeof runtime === "object" ? runtime : env;

  return {
    endpoint: source.S3_ENDPOINT || env.S3_ENDPOINT,
    publicEndpoint: source.S3_PUBLIC_ENDPOINT || env.S3_PUBLIC_ENDPOINT || source.S3_ENDPOINT || env.S3_ENDPOINT,
    region: source.S3_REGION || env.S3_REGION || "us-east-1",
    bucket: source.S3_PRIVATE_BUCKET || env.S3_PRIVATE_BUCKET,
    accessKeyId: source.S3_ACCESS_KEY_ID || env.S3_ACCESS_KEY_ID,
    secretAccessKey: source.S3_SECRET_ACCESS_KEY || env.S3_SECRET_ACCESS_KEY,
    forcePathStyle: true,
  };
}

export async function readPrinterConfig() {
  try {
    const text = await fs.readFile(getPrinterConfigPath(), "utf8");
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export async function savePrinterConfig(config) {
  const target = getPrinterConfigPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return config;
}

export async function claimNextQueuedFile() {
  try {
    return await markNextQueuedFileAsPrinting({ isQueueAdmin: true });
  } catch {
    return null;
  }
}

export async function markFilePrinting(fileId, updates = {}) {
  const manifest = await readManifest(fileId);
  if (!manifest) {
    throw new Error("File not found.");
  }
  const updated = {
    ...manifest,
    ...updates,
    printStatus: "printing",
    printStartedAt: manifest.printStartedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(updated);
  if (updates?.queuedByWorker) {
    await recordFilamentUsageForPrint(updated, "autoprint");
  }
  return hydrateManifest(updated);
}

export async function markFileQueued(fileId, updates = {}) {
  const manifest = await readManifest(fileId);
  if (!manifest) {
    throw new Error("File not found.");
  }
  const updated = {
    ...manifest,
    ...updates,
    printStatus: "queued",
    printRequestedAt: manifest.printRequestedAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(updated);
  return hydrateManifest(updated);
}

export async function markFileFailed(fileId, updates = {}) {
  const manifest = await readManifest(fileId);
  if (!manifest) {
    throw new Error("File not found.");
  }
  const updated = {
    ...manifest,
    ...updates,
    printStatus: "failed",
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(updated);
  return hydrateManifest(updated);
}
