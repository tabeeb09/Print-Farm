import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";

import { env } from "../lib/env.js";
import { listPrintQueue, markNextQueuedFileAsPrinting } from "../lib/s3Files.js";

const DEFAULT_POLL_INTERVAL_MS = 10_000;
const MANIFEST_FOLDER = "private/system/files/manifests";
const WORKER_FOLDER = process.platform === "win32"
  ? path.join(process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming"), "caid-print-worker")
  : path.join(os.homedir(), ".config", "caid-print-worker");
const CONFIG_PATH = path.join(WORKER_FOLDER, "printers.json");
const OUTBOX_DIR = path.join(WORKER_FOLDER, "outbox");

function workerActor() {
  return {
    sub: "print-worker",
    email: null,
    name: "print-worker",
    roles: ["print_worker"],
    uploadLimitBytes: Number.MAX_SAFE_INTEGER,
    isFileAdmin: true,
    isQueueAdmin: true,
    isSuperadmin: false,
  };
}

function sanitizeRemoteName(name) {
  const normalized = String(name || "job")
    .normalize("NFKC")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  const safe = normalized || "job";
  return safe.endsWith(".gcode.3mf") ? safe : `${safe}.gcode.3mf`;
}

function getManifestKey(fileId) {
  return `${MANIFEST_FOLDER}/${fileId}.json`;
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

async function ensureWorkerDir() {
  await fs.mkdir(WORKER_FOLDER, { recursive: true });
  await fs.mkdir(OUTBOX_DIR, { recursive: true });
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8"));
  } catch {
    return null;
  }
}

async function writeJson(filePath, data) {
  await ensureWorkerDir();
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
}

async function promptText(rl, question, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  const value = (await rl.question(`${question}${suffix}: `)).trim();
  return value || fallback;
}

async function promptBoolean(rl, question, fallback = true) {
  const label = fallback ? "Y/n" : "y/N";
  const value = (await rl.question(`${question} (${label}): `)).trim().toLowerCase();
  if (!value) {
    return fallback;
  }
  return ["y", "yes", "true", "1"].includes(value);
}

async function bootstrapPrinterConfig() {
  if (!process.stdin.isTTY) {
    throw new Error(
      "Printer config is missing and the worker is not attached to an interactive terminal. Create printers.json first.",
    );
  }

  const rl = readline.createInterface({ input, output });
  try {
    const printerLabel = await promptText(rl, "Printer label", "X1 Carbon");
    const host = await promptText(rl, "Printer IP or hostname");
    const serial = await promptText(rl, "Printer serial number");
    const useAms = await promptBoolean(rl, "Use AMS for single-filament jobs?", true);
    const amsSlot = Number.parseInt(await promptText(rl, "Default AMS slot", "0"), 10) || 0;

    const printer = {
      id: crypto.randomUUID(),
      label: printerLabel,
      host,
      serial,
      useAms,
      amsSlot,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const state = {
      version: 1,
      defaultPrinterId: printer.id,
      printers: [printer],
    };

    await writeJson(CONFIG_PATH, state);
    return state;
  } finally {
    rl.close();
  }
}

async function loadPrinterState() {
  await ensureWorkerDir();
  const state = await readJson(CONFIG_PATH);
  if (state?.printers?.length) {
    return state;
  }
  return bootstrapPrinterConfig();
}

function selectPrinter(state, printerId = null) {
  if (!state?.printers?.length) {
    return null;
  }

  const configuredId = process.env.PRINT_WORKER_PRINTER_ID || printerId;
  if (configuredId) {
    const byId = state.printers.find((printer) => printer.id === configuredId);
    if (byId) {
      return byId;
    }
  }

  const defaultPrinter = state.printers.find((printer) => printer.id === state.defaultPrinterId);
  return defaultPrinter ?? state.printers[0];
}

async function promptPrinterRepair(state, printer) {
  if (!process.stdin.isTTY) {
    return state;
  }

  const rl = readline.createInterface({ input, output });
  try {
    const shouldUpdate = await promptBoolean(
      rl,
      `Printer "${printer.label}" needs updated details. Update now?`,
      true,
    );

    if (!shouldUpdate) {
      return state;
    }

    const nextHost = await promptText(rl, "Printer IP or hostname", printer.host);
    const nextSerial = await promptText(rl, "Printer serial number", printer.serial);
    const nextUseAms = await promptBoolean(rl, "Use AMS for single-filament jobs?", Boolean(printer.useAms));
    const nextAmsSlot = Number.parseInt(await promptText(rl, "Default AMS slot", String(printer.amsSlot ?? 0)), 10) || 0;

    const updatedPrinter = {
      ...printer,
      host: nextHost,
      serial: nextSerial,
      useAms: nextUseAms,
      amsSlot: nextAmsSlot,
      updatedAt: new Date().toISOString(),
      lastReauthAt: new Date().toISOString(),
      needsReauth: false,
      lastError: null,
    };

    const nextState = {
      ...state,
      printers: state.printers.map((item) => (item.id === printer.id ? updatedPrinter : item)),
    };

    await writeJson(CONFIG_PATH, nextState);
    return nextState;
  } finally {
    rl.close();
  }
}

async function readObjectToTempFile(objectKey, suggestedName) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "caid-print-worker-"));
  const tempPath = path.join(tempDir, suggestedName || path.basename(objectKey));
  const client = createS3Client();
  try {
    const response = await client.send(
      new GetObjectCommand({
        Bucket: env.S3_PRIVATE_BUCKET,
        Key: objectKey,
      }),
    );
    const bytes = await response.Body?.transformToByteArray();
    await fs.writeFile(tempPath, bytes ? Buffer.from(bytes) : Buffer.alloc(0));
    return { tempDir, tempPath };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function writeManifest(manifest) {
  const client = createS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: getManifestKey(manifest.id),
      Body: JSON.stringify(manifest),
      ContentType: "application/json",
    }),
  );
}

async function readManifest(fileId) {
  const client = createS3Client();
  const response = await client.send(
    new GetObjectCommand({
      Bucket: env.S3_PRIVATE_BUCKET,
      Key: getManifestKey(fileId),
    }),
  );
  const text = await response.Body?.transformToString();
  return text ? JSON.parse(text) : null;
}

async function requeueJob(manifest, errorMessage) {
  const updated = {
    ...manifest,
    printStatus: "queued",
    printStartedAt: null,
    printError: errorMessage,
    updatedAt: new Date().toISOString(),
  };
  await writeManifest(updated);
  return updated;
}

async function stageForOrca(printer, localPath, remoteName) {
  const printerDir = path.join(OUTBOX_DIR, sanitizeRemoteName(printer.label));
  await fs.mkdir(printerDir, { recursive: true });
  const stagedPath = path.join(printerDir, remoteName);
  await fs.copyFile(localPath, stagedPath);
  return stagedPath;
}

async function runJob(job, printer) {
  const queueObjectKey = job.printQueueObjectKey || job.gcodeObjectKey;

  if (!queueObjectKey) {
    throw new Error("Queued job is missing its generated print artifact.");
  }

  const remoteName = sanitizeRemoteName(job.gcodeFilename || job.originalFilename);
  const { tempDir, tempPath } = await readObjectToTempFile(queueObjectKey, remoteName);

  try {
    const stagedPath = await stageForOrca(printer, tempPath, remoteName);

    const updated = {
      ...job,
      printStatus: "printing",
      printStartedAt: new Date().toISOString(),
      printQueueObjectKey: queueObjectKey,
      printError: null,
      workerPrinterId: printer.id,
      workerPrinterLabel: printer.label,
      workerStagedPath: stagedPath,
      updatedAt: new Date().toISOString(),
    };

    await writeManifest(updated);
    console.log(
      `[print-worker] staged ${updated.originalFilename} for ${printer.label} at ${stagedPath}`,
    );
    return updated;
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOnce(state) {
  const queue = await listPrintQueue(workerActor());
  if (queue.files.some((file) => file.printStatus === "printing")) {
    return { handled: false, reason: "job-in-progress" };
  }

  const candidate = queue.files.find((file) => file.printStatus === "queued");
  if (!candidate) {
    return { handled: false, reason: "queue-empty" };
  }

  const claimed = await markNextQueuedFileAsPrinting(workerActor());
  if (!claimed || claimed.id !== candidate.id) {
    return { handled: false, reason: "claim-race" };
  }

  const printer = selectPrinter(state, claimed.targetPrinterId || claimed.workerPrinterId || null);
  if (!printer) {
    throw new Error("No printer is configured.");
  }

  try {
    const completed = await runJob(claimed, printer);
    return { handled: true, fileId: completed.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Print dispatch failed.";
    console.error(`[print-worker] ${message}`);

    const current = await readManifest(claimed.id);
    if (current) {
      await requeueJob(current, message);
    }

    if (/printer|access|serial|config/i.test(message) && process.stdin.isTTY) {
      const nextState = await promptPrinterRepair(state, printer);
      return { handled: false, reason: "printer-repaired", state: nextState };
    }

    return { handled: false, reason: "send-failed" };
  }
}

async function main() {
  let state = await loadPrinterState();
  const pollMs = Number.parseInt(process.env.PRINT_WORKER_POLL_INTERVAL_MS || "", 10) || DEFAULT_POLL_INTERVAL_MS;
  const singleRun = ["1", "true", "yes"].includes(String(process.env.PRINT_WORKER_ONCE || "").toLowerCase());

  console.log(`[print-worker] loaded ${state.printers.length} printer(s) from ${CONFIG_PATH}`);

  for (;;) {
    try {
      const result = await runOnce(state);
      if (result.state) {
        state = result.state;
      }

      if (singleRun) {
        break;
      }

      if (!result.handled) {
        await sleep(pollMs);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Worker loop failed.";
      console.error(`[print-worker] ${message}`);
      await sleep(pollMs);
    }
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[print-worker] fatal: ${message}`);
  process.exitCode = 1;
});
