import { getStateFilePath, readJsonFile, writeJsonFile } from "./jsonStore.js";

const LEDGER_PATH = getStateFilePath("FILAMENT_LEDGER_PATH", "filament-ledger.json");

function normalizeBreakdown(manifest) {
  if (Array.isArray(manifest?.extractedFilamentBreakdown) && manifest.extractedFilamentBreakdown.length) {
    return manifest.extractedFilamentBreakdown;
  }
  if (typeof manifest?.extractedGrams === "number" && manifest.extractedGrams > 0) {
    return [{ filamentType: manifest.extractedFilamentType || manifest.filamentSelection || "Unknown", grams: manifest.extractedGrams }];
  }
  return [];
}

export async function listFilamentUsage() {
  const state = await readJsonFile(LEDGER_PATH, { entries: [] });
  return {
    entries: state.entries || [],
    totals: (state.entries || []).reduce((totals, entry) => {
      for (const item of entry.breakdown || []) {
        const key = item.filamentType || "Unknown";
        totals[key] = (totals[key] || 0) + (Number(item.grams) || 0);
      }
      return totals;
    }, {}),
  };
}

export async function recordFilamentUsageForPrint(manifest, source = "worker") {
  const breakdown = normalizeBreakdown(manifest);
  if (!manifest?.id || !breakdown.length) return null;

  const state = await readJsonFile(LEDGER_PATH, { entries: [] });
  const existing = new Map((state.entries || []).map((entry) => [entry.fileId, entry]));
  const entry = {
    fileId: manifest.id,
    source,
    originalFilename: manifest.originalFilename || manifest.gcodeFilename || manifest.id,
    ownerSub: manifest.ownerSub || null,
    printerId: manifest.printerId || null,
    printerLabel: manifest.printerLabel || null,
    printStartedAt: manifest.printStartedAt || null,
    recordedAt: new Date().toISOString(),
    totalGrams: breakdown.reduce((total, item) => total + (Number(item.grams) || 0), 0),
    breakdown,
  };
  existing.set(manifest.id, { ...existing.get(manifest.id), ...entry });
  const entries = Array.from(existing.values()).sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt));
  await writeJsonFile(LEDGER_PATH, { entries });
  return entry;
}
