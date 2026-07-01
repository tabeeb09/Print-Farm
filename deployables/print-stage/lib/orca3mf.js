import fs from "node:fs/promises";
import { accessSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { getPythonCommand } from "./pythonRuntime.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const SCRIPT_CANDIDATES = [
  path.resolve(currentDir, "..", "orca_3mf_filament_report.py"),
  path.resolve(currentDir, "..", "..", "orca_3mf_filament_report.py"),
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

function normalizeFilamentType(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function buildRawFilamentBreakdown(parsed) {
  const aggregated = new Map();
  const append = (filamentType, grams, color = null) => {
    const normalizedType = normalizeFilamentType(filamentType);

    if (!normalizedType || typeof grams !== "number" || !Number.isFinite(grams) || grams <= 0) {
      return;
    }

    const current = aggregated.get(normalizedType) ?? {
      filamentType: normalizedType,
      grams: 0,
      colors: new Set(),
    };
    current.grams += grams;
    if (color) {
      current.colors.add(color);
    }
    aggregated.set(normalizedType, current);
  };

  const manualFilaments = parsed?.manual_gcode_analysis?.per_filament;
  if (Array.isArray(manualFilaments) && manualFilaments.length) {
    for (const entry of manualFilaments) {
      append(entry?.declared_type, entry?.grams, entry?.declared_color);
    }
  }

  if (!aggregated.size) {
    const sliceFilaments = parsed?.slice_info_stats?.filaments;
    if (Array.isArray(sliceFilaments) && sliceFilaments.length) {
      for (const entry of sliceFilaments) {
        append(entry?.type, entry?.used_g, entry?.color);
      }
    }
  }

  return Array.from(aggregated.values()).map((entry) => ({
    filamentType: entry.filamentType,
    grams: Number(entry.grams.toFixed(4)),
    colors: Array.from(entry.colors),
  }));
}

function pickTrustedTotalGrams(parsed) {
  const candidates = [
    parsed?.octoprint_analysis?.grams_from_volume,
    parsed?.embedded_gcode_stats?.grams_from_volume,
    parsed?.embedded_gcode_stats?.grams_from_length,
    parsed?.manual_gcode_analysis?.total_grams,
    parsed?.slice_info_stats?.used_g,
  ];

  return (
    candidates.find((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ??
    candidates.find((value) => typeof value === "number" && Number.isFinite(value)) ??
    null
  );
}

function buildFilamentBreakdown(parsed, trustedTotalGrams) {
  const rawBreakdown = buildRawFilamentBreakdown(parsed);

  if (!rawBreakdown.length) {
    return [];
  }

  const rawTotal = rawBreakdown.reduce((total, entry) => total + entry.grams, 0);

  if (
    typeof trustedTotalGrams !== "number" ||
    !Number.isFinite(trustedTotalGrams) ||
    trustedTotalGrams <= 0 ||
    !Number.isFinite(rawTotal) ||
    rawTotal <= 0
  ) {
    return rawBreakdown.sort((left, right) => right.grams - left.grams);
  }

  const scaleFactor = trustedTotalGrams / rawTotal;

  return rawBreakdown
    .map((entry) => ({
      ...entry,
      grams: Number((entry.grams * scaleFactor).toFixed(4)),
    }))
    .sort((left, right) => right.grams - left.grams);
}

export async function extractOrca3mfMetadataFromBuffer(buffer, originalFilename) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "orca-3mf-"));
  const tempFile = path.join(tempDir, originalFilename || "upload.3mf");

  try {
    await fs.writeFile(tempFile, buffer);
    const raw = await runPython([getScriptPath(), tempFile, "--json"]);
    const parsed = JSON.parse(raw);
    const trustedTotalGrams = pickTrustedTotalGrams(parsed);
    const filamentBreakdown = buildFilamentBreakdown(parsed, trustedTotalGrams);
    const extractedType =
      filamentBreakdown.length > 1
        ? "Multiple"
        : filamentBreakdown[0]?.filamentType ||
          parsed?.slice_info_stats?.filament_type ||
          parsed?.slice_info_stats?.filaments?.find?.((entry) => entry?.type)?.type ||
      null;
    const gramCandidates = [
      trustedTotalGrams,
      filamentBreakdown.length
        ? filamentBreakdown.reduce((total, entry) => total + entry.grams, 0)
        : null,
    ];
    const grams =
      gramCandidates.find((value) => typeof value === "number" && Number.isFinite(value) && value > 0) ??
      gramCandidates.find((value) => typeof value === "number" && Number.isFinite(value)) ??
      null;

    return {
      extractionStatus: extractedType ? "verified" : "failed",
      extractedFilamentType: extractedType,
      extractedGrams: typeof grams === "number" ? grams : null,
      extractedFilamentBreakdown: filamentBreakdown,
      extractionReport: parsed,
      extractionError: extractedType ? null : "No filament type could be extracted from the file.",
    };
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}
