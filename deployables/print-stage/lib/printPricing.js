const FILAMENT_RATE_TABLE = {
  PLA: { currency: "gbp", unitAmountMinorPerGram: 8, label: "PLA" },
  "PLA+": { currency: "gbp", unitAmountMinorPerGram: 9, label: "PLA+" },
  PETG: { currency: "gbp", unitAmountMinorPerGram: 10, label: "PETG" },
  ABS: { currency: "gbp", unitAmountMinorPerGram: 11, label: "ABS" },
  ASA: { currency: "gbp", unitAmountMinorPerGram: 12, label: "ASA" },
  TPU: { currency: "gbp", unitAmountMinorPerGram: 14, label: "TPU" },
  PA: { currency: "gbp", unitAmountMinorPerGram: 16, label: "PA / Nylon" },
  PC: { currency: "gbp", unitAmountMinorPerGram: 18, label: "PC" },
};

function normalizeFilamentType(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (normalized === "NYLON") {
    return "PA";
  }

  return FILAMENT_RATE_TABLE[normalized] ? normalized : null;
}

function roundMinorAmount(value) {
  return Math.max(0, Math.round(value));
}

export function getFilamentRate(filamentType) {
  const normalized = normalizeFilamentType(filamentType);
  return normalized ? { filamentType: normalized, ...FILAMENT_RATE_TABLE[normalized] } : null;
}

export function computePrintPriceQuote(file) {
  const breakdown = Array.isArray(file?.extractedFilamentBreakdown)
    ? file.extractedFilamentBreakdown
    : [];
  const fallbackType = normalizeFilamentType(file?.extractedFilamentType);
  const fallbackGrams =
    typeof file?.extractedGrams === "number" && Number.isFinite(file.extractedGrams)
      ? file.extractedGrams
      : null;

  const effectiveBreakdown = breakdown.length
    ? breakdown
    : fallbackType && fallbackGrams !== null && fallbackGrams > 0
      ? [{ filamentType: fallbackType, grams: fallbackGrams }]
      : [];

  if (!effectiveBreakdown.length) {
    return null;
  }

  const normalizedBreakdown = effectiveBreakdown
    .map((entry) => {
      const rate = getFilamentRate(entry.filamentType);
      const grams = typeof entry.grams === "number" && Number.isFinite(entry.grams) ? entry.grams : null;

      if (!rate || grams === null || grams <= 0) {
        return null;
      }

      const amountMinor = roundMinorAmount(grams * rate.unitAmountMinorPerGram);

      return {
        filamentType: rate.filamentType,
        label: rate.label,
        grams,
        currency: rate.currency,
        unitAmountMinorPerGram: rate.unitAmountMinorPerGram,
        amountMinor,
      };
    })
    .filter(Boolean);

  if (!normalizedBreakdown.length) {
    return null;
  }

  const currency = normalizedBreakdown[0].currency;
  const subtotalMinor = normalizedBreakdown.reduce((total, entry) => total + entry.amountMinor, 0);
  const totalGrams = normalizedBreakdown.reduce((total, entry) => total + entry.grams, 0);

  return {
    currency,
    lineItems: normalizedBreakdown,
    subtotalMinor,
    totalMinor: subtotalMinor,
    totalGrams,
  };
}
