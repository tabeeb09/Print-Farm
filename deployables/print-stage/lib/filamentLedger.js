import { getStateFilePath, readJsonFile, writeJsonFile } from "./jsonStore.js";

const LEDGER_PATH = getStateFilePath("FILAMENT_LEDGER_PATH", "filament-ledger.json");

function normalizeBreakdown(manifest, overrideBreakdown = null) {
  if (Array.isArray(overrideBreakdown) && overrideBreakdown.length) {
    return overrideBreakdown
      .map((entry) => ({
        filamentType: String(entry?.filamentType || "Unknown").trim() || "Unknown",
        grams: Number(entry?.grams) || 0,
      }))
      .filter((entry) => entry.grams > 0);
  }

  if (Array.isArray(manifest?.extractedFilamentBreakdown) && manifest.extractedFilamentBreakdown.length) {
    return manifest.extractedFilamentBreakdown;
  }
  if (typeof manifest?.extractedGrams === "number" && manifest.extractedGrams > 0) {
    return [{ filamentType: manifest.extractedFilamentType || manifest.filamentSelection || "Unknown", grams: manifest.extractedGrams }];
  }
  return [];
}

function normalizeState(state) {
  return {
    entries: Array.isArray(state?.entries) ? state.entries : [],
    filaments: Array.isArray(state?.filaments) ? state.filaments : [],
  };
}

function normalizeFilament(input) {
  const name = String(input?.name || input?.label || "").trim();
  const filamentType = String(input?.filamentType || input?.type || "").trim();
  const gramsAvailable = Number(input?.gramsAvailable ?? input?.startingGrams ?? input?.grams);

  if (!name) {
    throw new Error("Filament name is required.");
  }
  if (!filamentType) {
    throw new Error("Filament type is required.");
  }
  if (!Number.isFinite(gramsAvailable) || gramsAvailable <= 0) {
    throw new Error("Filament grams available must be greater than zero.");
  }

  const now = new Date().toISOString();
  return {
    id: input?.id || crypto.randomUUID(),
    name,
    filamentType,
    color: String(input?.color || "").trim(),
    vendor: String(input?.vendor || "").trim(),
    startingGrams: gramsAvailable,
    notes: String(input?.notes || "").trim(),
    createdAt: input?.createdAt || now,
    updatedAt: now,
  };
}

function totalsByType(entries) {
  return (entries || []).reduce((totals, entry) => {
    for (const item of entry.breakdown || []) {
      const key = item.filamentType || "Unknown";
      totals[key] = (totals[key] || 0) + (Number(item.grams) || 0);
    }
    return totals;
  }, {});
}

function decorateFilaments(filaments, totals) {
  const remainingUsageByType = { ...totals };
  return filaments.map((filament) => {
    const consumedFromThisSpool = Math.min(
      Number(filament.startingGrams) || 0,
      remainingUsageByType[filament.filamentType] || 0,
    );
    remainingUsageByType[filament.filamentType] = Math.max(
      0,
      (remainingUsageByType[filament.filamentType] || 0) - consumedFromThisSpool,
    );
    return {
      ...filament,
      usedGrams: consumedFromThisSpool,
      remainingGrams: Math.max(0, (Number(filament.startingGrams) || 0) - consumedFromThisSpool),
    };
  });
}

export async function listFilamentUsage() {
  const state = normalizeState(await readJsonFile(LEDGER_PATH, { entries: [], filaments: [] }));
  const totals = totalsByType(state.entries);
  return {
    entries: state.entries,
    totals,
    filaments: decorateFilaments(state.filaments, totals),
  };
}

export async function saveFilament(input) {
  const state = normalizeState(await readJsonFile(LEDGER_PATH, { entries: [], filaments: [] }));
  const nextFilament = normalizeFilament(input);
  const filaments = state.filaments.filter((filament) => filament.id !== nextFilament.id);
  filaments.unshift(nextFilament);
  await writeJsonFile(LEDGER_PATH, { ...state, filaments });
  return listFilamentUsage();
}

export async function deleteFilament(id) {
  const filamentId = String(id || "").trim();
  if (!filamentId) {
    throw new Error("Filament id is required.");
  }
  const state = normalizeState(await readJsonFile(LEDGER_PATH, { entries: [], filaments: [] }));
  await writeJsonFile(LEDGER_PATH, {
    ...state,
    filaments: state.filaments.filter((filament) => filament.id !== filamentId),
  });
  return listFilamentUsage();
}

export async function recordFilamentUsageForPrint(manifest, source = "worker", options = {}) {
  const breakdown = normalizeBreakdown(manifest, options.breakdown);
  if (!manifest?.id || !breakdown.length) return null;

  const state = normalizeState(await readJsonFile(LEDGER_PATH, { entries: [], filaments: [] }));
  const existing = new Map(state.entries.map((entry) => [entry.fileId, entry]));
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
  await writeJsonFile(LEDGER_PATH, { ...state, entries });
  return entry;
}
