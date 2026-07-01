import fs from "node:fs/promises";
import { accessSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getPythonCommand } from "./pythonRuntime.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_CANDIDATES = [
  path.resolve(currentDir, "..", "orca_3mf_package_tools.py"),
  path.resolve(currentDir, "..", "..", "orca_3mf_package_tools.py"),
];

function getScriptPath() {
  for (const candidate of SCRIPT_CANDIDATES) {
    try {
      accessSync(candidate);
      return candidate;
    } catch {}
  }

  return SCRIPT_CANDIDATES[0];
}

function runPython(args) {
  return new Promise((resolve, reject) => {
    const runtime = getPythonCommand();
    const child = spawn(runtime.command, [...runtime.baseArgs, ...args], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || stdout.trim() || `Python exited with code ${code}.`));
        return;
      }

      resolve(stdout);
    });
  });
}

export async function inspect3mfPackageFromBuffer(buffer, originalFilename) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "orca-3mf-inspect-"));
  const tempFile = path.join(tempDir, originalFilename || "upload.3mf");

  try {
    await fs.writeFile(tempFile, buffer);
    const raw = await runPython([getScriptPath(), "inspect", tempFile]);
    return JSON.parse(raw);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

export async function extractFirstPlateGcodeFrom3mfBuffer(buffer, originalFilename) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "orca-3mf-gcode-"));
  const tempFile = path.join(tempDir, originalFilename || "output.3mf");
  const outputFile = path.join(tempDir, "plate_1.gcode");

  try {
    await fs.writeFile(tempFile, buffer);
    const raw = await runPython([getScriptPath(), "extract-gcode", tempFile, outputFile]);
    const parsed = JSON.parse(raw);
    const gcodeBuffer = await fs.readFile(outputFile);
    return {
      ...parsed,
      gcodeBuffer,
      outputFilename: path.basename(outputFile),
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
