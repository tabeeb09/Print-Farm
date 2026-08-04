const CURRENCY = "gbp";
const FIRST_TIER_GRAMS = 70;
const FIRST_TIER_MINOR_PER_GRAM = 8;
const ADDITIONAL_MINOR_PER_GRAM = 6;

const FILAMENT_LABELS = {
  PLA: "PLA",
  "PLA+": "PLA+",
  PETG: "PETG",
  ABS: "ABS",
  ASA: "ASA",
  TPU: "TPU",
  PA: "PA / Nylon",
  PC: "PC",
};

function normalizeFilamentType(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim().toUpperCase();

  if (normalized === "NYLON") {
    return "PA";
  }

  return FILAMENT_LABELS[normalized] ? normalized : null;
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
  return normalized
    ? {
        filamentType: normalized,
        currency: CURRENCY,
        unitAmountMinorPerGram: FIRST_TIER_MINOR_PER_GRAM,
        additionalUnitAmountMinorPerGram: ADDITIONAL_MINOR_PER_GRAM,
        label: FILAMENT_LABELS[normalized],
      }
    : null;
}

export function computeTieredPrintAmount(totalGrams) {
  const grams = Number(totalGrams);
  if (!Number.isFinite(grams) || grams <= 0) {
    return null;
  }

  const firstTierGrams = Math.min(grams, FIRST_TIER_GRAMS);
  const additionalGrams = Math.max(0, grams - FIRST_TIER_GRAMS);
  const totalMinor = roundMinorAmount(
    firstTierGrams * FIRST_TIER_MINOR_PER_GRAM +
    additionalGrams * ADDITIONAL_MINOR_PER_GRAM,
  );

  return {
    currency: CURRENCY,
    totalMinor,
    totalGrams: grams,
    firstTierGrams,
    additionalGrams,
    firstTierMinorPerGram: FIRST_TIER_MINOR_PER_GRAM,
    additionalMinorPerGram: ADDITIONAL_MINOR_PER_GRAM,
    pricingDescription: `8p/g for the first ${FIRST_TIER_GRAMS}g, then 6p/g thereafter`,
  };
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

      return {
        filamentType: rate.filamentType,
        label: rate.label,
        grams,
        currency: rate.currency,
        unitAmountMinorPerGram: rate.unitAmountMinorPerGram,
        additionalUnitAmountMinorPerGram: rate.additionalUnitAmountMinorPerGram,
      };
    })
    .filter(Boolean);

  if (!normalizedBreakdown.length) {
    return null;
  }

  const totalGrams = normalizedBreakdown.reduce((total, entry) => total + entry.grams, 0);
  const tiered = computeTieredPrintAmount(totalGrams);
  if (!tiered) {
    return null;
  }

  const currency = tiered.currency;
  const subtotalMinor = tiered.totalMinor;
  const normalizedDiscount = normalizeDiscount(discount);
  const rawDiscountMinor = normalizedDiscount
    ? roundMinorAmount((subtotalMinor * normalizedDiscount.percentOff) / 100)
    : 0;
  const discountMinor = Math.min(subtotalMinor, rawDiscountMinor);
  let allocatedDiscountMinor = 0;
  let allocatedSubtotalMinor = 0;
  const lineItems = normalizedBreakdown.map((entry, index) => {
    const amountMinor = index === normalizedBreakdown.length - 1
      ? subtotalMinor - allocatedSubtotalMinor
      : roundMinorAmount((subtotalMinor * entry.grams) / totalGrams);
    allocatedSubtotalMinor += amountMinor;
    const entryDiscountMinor = discountMinor > 0
      ? index === normalizedBreakdown.length - 1
        ? discountMinor - allocatedDiscountMinor
        : Math.min(amountMinor, roundMinorAmount((discountMinor * amountMinor) / subtotalMinor))
      : 0;
    allocatedDiscountMinor += entryDiscountMinor;
    return {
      ...entry,
      amountMinor,
      effectiveUnitAmountMinorPerGram: entry.grams > 0 ? amountMinor / entry.grams : 0,
      discountMinor: entryDiscountMinor,
      chargeAmountMinor: Math.max(0, amountMinor - entryDiscountMinor),
      pricingDescription: tiered.pricingDescription,
    };
  });
  const totalMinor = lineItems.reduce((total, entry) => total + entry.chargeAmountMinor, 0);

  return {
    currency,
    lineItems,
    subtotalMinor,
    pricingModel: "tiered_weight",
    pricingDescription: tiered.pricingDescription,
    firstTierGrams: tiered.firstTierGrams,
    additionalGrams: tiered.additionalGrams,
    firstTierMinorPerGram: FIRST_TIER_MINOR_PER_GRAM,
    additionalMinorPerGram: ADDITIONAL_MINOR_PER_GRAM,
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
