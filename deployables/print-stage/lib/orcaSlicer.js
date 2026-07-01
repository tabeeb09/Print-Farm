import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";

import { env } from "./env.js";
import { FILAMENT_EXTRACT_VALUE } from "./printPolicy.js";

const SLICER_TIMEOUT_MS = 5 * 60 * 1000;

const FILAMENT_PROFILE_CANDIDATES = {
  PLA: ["Bambu PLA Basic @BBL X1C.json"],
  "PLA+": ["Bambu PLA Basic @BBL X1C.json"],
  PETG: ["Bambu PETG HF @BBL X1C.json", "Bambu PETG Basic @BBL X1C.json"],
  ABS: ["Bambu ABS @BBL X1C.json"],
  ASA: ["Bambu ASA @BBL X1C.json"],
  TPU: ["Bambu TPU 95A HF @BBL X1C.json", "Bambu TPU 95A @BBL X1C.json"],
  PA: ["Bambu PAHT-CF @BBL X1C.json", "Bambu PA6-CF @BBL X1C.json", "Bambu PA-CF @BBL X1C.json"],
  PC: ["Bambu PC @BBL X1C.json"],
};

const SLICABLE_EXTENSIONS = new Set(["3mf", "stl", "obj", "step", "stp", "iges", "igs", "ply", "amf"]);

function sanitizeFilename(filename) {
  const normalized = filename
    .normalize("NFKC")
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "file";
}

function getFileStem(filename) {
  const parsed = path.parse(filename || "model");
  return sanitizeFilename(parsed.name || "model");
}

async function ensureFileExists(targetPath, description) {
  try {
    await fs.access(targetPath);
  } catch {
    throw new Error(`${description} is not configured correctly: ${targetPath}`);
  }
}

async function resolveFilamentProfilePath(filamentSelection) {
  const candidates = FILAMENT_PROFILE_CANDIDATES[filamentSelection];

  if (!candidates?.length) {
    throw new Error(`No OrcaSlicer filament profile mapping exists for ${filamentSelection}.`);
  }

  for (const candidate of candidates) {
    const profilePath = path.join(env.ORCA_FILAMENT_PROFILE_DIR, candidate);

    try {
      await fs.access(profilePath);
      return profilePath;
    } catch {}
  }

  throw new Error(`No OrcaSlicer filament profile file was found for ${filamentSelection}.`);
}

function runProcess(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) {
        return;
      }

      settled = true;
      child.kill("SIGKILL");
      reject(new Error(`OrcaSlicer timed out after ${timeoutMs} ms.`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on("close", (code) => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timer);

      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `OrcaSlicer exited with code ${code}.`));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

export function isSliceableModelFilename(filename) {
  const extension = path.extname(filename || "").toLowerCase().replace(/^\./, "");
  return SLICABLE_EXTENSIONS.has(extension);
}

export async function sliceModelTo3mf({ buffer, originalFilename, filamentSelection }) {
  if (!isSliceableModelFilename(originalFilename)) {
    throw new Error("Automatic slicing is not supported for this file type.");
  }

  await ensureFileExists(env.ORCA_SLICER_BIN, "ORCA_SLICER_BIN");
  await ensureFileExists(env.ORCA_MACHINE_PROFILE, "ORCA_MACHINE_PROFILE");
  await ensureFileExists(env.ORCA_PROCESS_PROFILE, "ORCA_PROCESS_PROFILE");

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "print-slice-"));
  const inputPath = path.join(tempDir, sanitizeFilename(originalFilename));
  const outputPath = path.join(tempDir, `${getFileStem(originalFilename)}.gcode.3mf`);

  try {
    await fs.writeFile(inputPath, buffer);

    let args;

    if (filamentSelection === FILAMENT_EXTRACT_VALUE) {
      const extension = path.extname(originalFilename || "").toLowerCase();

      if (extension !== ".3mf") {
        throw new Error("Extract from file is only supported for Orca project 3MF uploads.");
      }

      args = [
        "--arrange",
        "1",
        "--orient",
        "1",
        "--export-slicedata",
        tempDir,
        "--slice",
        "0",
        "--export-3mf",
        outputPath,
        inputPath,
      ];
    } else {
      const filamentProfilePath = await resolveFilamentProfilePath(filamentSelection);
      args = [
        "--arrange",
        "1",
        "--orient",
        "1",
        "--export-slicedata",
        tempDir,
        "--load-settings",
        `${env.ORCA_MACHINE_PROFILE};${env.ORCA_PROCESS_PROFILE}`,
        "--load-filaments",
        filamentProfilePath,
        "--slice",
        "0",
        "--export-3mf",
        outputPath,
        inputPath,
      ];
    }

    await runProcess(env.ORCA_SLICER_BIN, args, SLICER_TIMEOUT_MS);
    const outputBuffer = await fs.readFile(outputPath);

    return {
      outputBuffer,
      outputFilename: path.basename(outputPath),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
