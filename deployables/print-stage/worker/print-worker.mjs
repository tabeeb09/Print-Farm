import { randomUUID } from 'node:crypto';
import { createWriteStream, promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawn } from 'node:child_process';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import {
  claimNextQueuedFile,
  getEffectiveStorageConfig,
  loadRuntimeEnv,
  markFileFailed,
  markFilePrinting,
  readPrinterConfig,
  savePrinterConfig,
} from '../lib/s3Files.js';

function pick(str, fallback = '') {
  return typeof str === 'string' && str.trim() ? str.trim() : fallback;
}

function parseTemplateArgs(raw, vars) {
  if (!raw) return [];
  const source = raw.trim();
  let parsed = [];
  if (source.startsWith('[')) {
    parsed = JSON.parse(source);
  } else {
    parsed = source.split(/\s+/).filter(Boolean);
  }
  return parsed.map((item) => {
    if (typeof item !== 'string') return String(item);
    return item
      .replaceAll('{file}', vars.file)
      .replaceAll('{printerLabel}', vars.printerLabel)
      .replaceAll('{printerHost}', vars.printerHost)
      .replaceAll('{printerSerial}', vars.printerSerial)
      .replaceAll('{accessCode}', vars.accessCode)
      .replaceAll('{lanPort}', vars.lanPort)
      .replaceAll('{ftpPort}', vars.ftpPort)
      .replaceAll('{amsSlot}', vars.amsSlot)
      .replaceAll('{workerFolder}', vars.workerFolder);
  });
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell: false });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function downloadObjectToTemp(s3, bucket, key, filename) {
  const targetDir = path.join(os.tmpdir(), 'caid-print-worker', randomUUID());
  await fs.mkdir(targetDir, { recursive: true });
  const filePath = path.join(targetDir, filename || path.basename(key));
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  await new Promise((resolve, reject) => {
    const ws = createWriteStream(filePath);
    res.Body?.pipe(ws);
    ws.on('finish', resolve);
    ws.on('error', reject);
    res.Body?.on('error', reject);
  });
  return filePath;
}

async function getPrinterConfig(job) {
  const stored = await readPrinterConfig();
  if (stored?.printers?.length) return stored;
  const next = {
    activePrinterId: `printer-${randomUUID()}`,
    printers: [
      {
        id: `printer-${randomUUID()}`,
        label: pick(process.env.PRINT_WORKER_PRINTER_LABEL, job.printerLabel || 'Default printer'),
        host: pick(process.env.PRINT_WORKER_PRINTER_HOST, job.printerHost || ''),
        serial: pick(process.env.PRINT_WORKER_PRINTER_SERIAL, job.printerSerial || ''),
        accessCode: pick(process.env.PRINT_WORKER_PRINTER_ACCESS_CODE, job.accessCode || ''),
        lanPort: pick(process.env.PRINT_WORKER_PRINTER_LAN_PORT, job.lanPort || '6000'),
        ftpPort: pick(process.env.PRINT_WORKER_PRINTER_FTPS_PORT, job.ftpPort || '990'),
        amsSlot: pick(process.env.PRINT_WORKER_AMS_SLOT, job.amsSlot || '1'),
      },
    ],
  };
  await savePrinterConfig(next);
  return next;
}

async function runOrcaLanWrapper(job, localPath, printer) {
  const wrapper = pick(process.env.ORCA_LAN_WRAPPER);
  if (!wrapper && process.env.ORCA_LAN_DRY_RUN === '1') {
    console.log(`[worker] dry-run handoff for ${localPath} to ${printer.label || printer.host || 'printer'}`);
    return;
  }
  if (!wrapper) throw new Error('ORCA_LAN_WRAPPER is not configured');

  const workDir = path.dirname(localPath);
  const args = parseTemplateArgs(
    process.env.ORCA_LAN_ARGS_JSON || process.env.ORCA_LAN_ARGS || '[]',
    {
      file: localPath,
      printerLabel: printer.label,
      printerHost: printer.host,
      printerSerial: printer.serial,
      accessCode: printer.accessCode,
      lanPort: printer.lanPort,
      ftpPort: printer.ftpPort,
      amsSlot: printer.amsSlot,
      workerFolder: workDir,
    }
  );

  if (args.length === 0) {
    throw new Error('ORCA_LAN_ARGS is not configured');
  }

  await run(wrapper, args, workDir);
}

async function main() {
  const runtime = await loadRuntimeEnv();
  const storage = getEffectiveStorageConfig(runtime);
  const runOnce = process.env.PRINT_WORKER_ONCE === '1' || process.env.PRINT_WORKER_ONCE === 'true';
  const s3 = new S3Client({
    region: storage.region,
    endpoint: storage.endpoint,
    forcePathStyle: storage.forcePathStyle,
    credentials: {
      accessKeyId: storage.accessKeyId,
      secretAccessKey: storage.secretAccessKey,
    },
  });

  console.log('[worker] waiting for queued jobs');

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const job = await claimNextQueuedFile();
    if (!job) {
      if (runOnce) {
        console.log('[worker] no queued jobs found');
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 5000));
      continue;
    }

    const printerConfig = await getPrinterConfig(job);
    const printer = printerConfig.printers.find((item) => item.id === printerConfig.activePrinterId) || printerConfig.printers[0];
    if (!printer) {
      await markFileFailed(job.id, { error: 'No printer is configured for the worker' });
      continue;
    }

    await markFilePrinting(job.id, { printerId: printer.id, printerLabel: printer.label });

    try {
      const localPath = await downloadObjectToTemp(s3, job.bucket, job.printQueueObjectKey, job.originalFilename);
      await runOrcaLanWrapper(job, localPath, printer);
      await markFilePrinting(job.id, {
        printerId: printer.id,
        printerLabel: printer.label,
        printerHost: printer.host,
        printerSerial: printer.serial,
        accessCode: printer.accessCode,
        lanPort: printer.lanPort,
        ftpPort: printer.ftpPort,
        amsSlot: printer.amsSlot,
        queuedByWorker: true,
        printQueueObjectKey: job.printQueueObjectKey,
      });
      console.log(`[worker] handed off job ${job.id} to Orca LAN wrapper`);
      if (runOnce) {
        return;
      }
    } catch (error) {
      await markFileFailed(job.id, {
        printerId: printer.id,
        printerLabel: printer.label,
        printerHost: printer.host,
        printerSerial: printer.serial,
        accessCode: printer.accessCode,
        lanPort: printer.lanPort,
        ftpPort: printer.ftpPort,
        amsSlot: printer.amsSlot,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error(`[worker] failed job ${job.id}`, error);
      if (runOnce) {
        process.exitCode = 1;
        return;
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
