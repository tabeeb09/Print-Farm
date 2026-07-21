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

function normalizeDiscount(discount) {
  if (!discount || typeof discount !== "object") {
    return null;
  }

  const percentOff = Math.max(0, Math.min(100, Number(discount.percentOff) || 0));
  if (percentOff <= 0) {
    return null;
  }

  return {
    id: discount.id || null,
    groupId: discount.groupId || null,
    groupName: discount.groupName || null,
    description: discount.description || "",
    percentOff,
  };
}

export function getFilamentRate(filamentType) {
  const normalized = normalizeFilamentType(filamentType);
  return normalized ? { filamentType: normalized, ...FILAMENT_RATE_TABLE[normalized] } : null;
}

export function computePrintPriceForBreakdown(effectiveBreakdown, discount = null) {
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
  const normalizedDiscount = normalizeDiscount(discount);
  const rawDiscountMinor = normalizedDiscount
    ? roundMinorAmount((subtotalMinor * normalizedDiscount.percentOff) / 100)
    : 0;
  const discountMinor = Math.min(subtotalMinor, rawDiscountMinor);
  let allocatedDiscountMinor = 0;
  const lineItems = normalizedBreakdown.map((entry, index) => {
    const entryDiscountMinor = discountMinor > 0
      ? index === normalizedBreakdown.length - 1
        ? discountMinor - allocatedDiscountMinor
        : Math.min(entry.amountMinor, roundMinorAmount((discountMinor * entry.amountMinor) / subtotalMinor))
      : 0;
    allocatedDiscountMinor += entryDiscountMinor;
    return {
      ...entry,
      discountMinor: entryDiscountMinor,
      chargeAmountMinor: Math.max(0, entry.amountMinor - entryDiscountMinor),
    };
  });
  const totalMinor = lineItems.reduce((total, entry) => total + entry.chargeAmountMinor, 0);

  return {
    currency,
    lineItems,
    subtotalMinor,
    discountMinor,
    discount: discountMinor > 0 ? { ...normalizedDiscount, amountMinor: discountMinor } : null,
    totalMinor,
    totalGrams,
  };
}

export function computePrintPriceQuote(file, discount = null) {
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

  return computePrintPriceForBreakdown(effectiveBreakdown, discount);
}
