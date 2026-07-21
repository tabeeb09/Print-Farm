import crypto from "node:crypto";

const DEFAULT_LATE_FEE_PENCE = 500;
const DEFAULT_FAILURE_DAYS = 30;
const MAX_RETURN_PHOTOS = 6;
const MAX_RETURN_PHOTO_DATA_URL_BYTES = 2_500_000;
const DEFAULT_WEEKLY_WINDOWS = [
  { day: 1, start: "09:00", end: "17:00" },
  { day: 2, start: "09:00", end: "17:00" },
  { day: 3, start: "09:00", end: "17:00" },
  { day: 4, start: "09:00", end: "17:00" },
  { day: 5, start: "09:00", end: "17:00" },
];

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function nowIso(now = new Date()) {
  return new Date(now).toISOString();
}

function id(prefix) {
  return `${prefix}_${crypto.randomUUID()}`;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function toDate(value, label) {
  const date = new Date(value);
  assert(Number.isFinite(date.getTime()), `${label} must be a valid date.`);
  return date;
}

function toPence(value, fallback = 0) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.round(value));
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return Math.max(0, Math.round(parsed * 100));
    }
  }

  return fallback;
}

function toPositiveInteger(value, fallback = 1) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function toOptionalPositiveInteger(value) {
  if (value === undefined || value === null || value === "") return null;
  const text = String(value).trim();
  assert(/^[1-9]\d*$/.test(text), "Optional day limits must be positive whole numbers.");
  const parsed = Number.parseInt(text, 10);
  assert(Number.isInteger(parsed) && parsed > 0, "Optional day limits must be positive whole numbers.");
  return parsed;
}

function toRequiredPositiveInteger(value, label) {
  const text = String(value ?? "").trim();
  assert(/^[1-9]\d*$/.test(text), `${label} must be a positive whole number.`);
  const parsed = Number.parseInt(text, 10);
  return parsed;
}

function textOrNull(value, maxLength = 2000) {
  const text = String(value || "").trim();
  return text ? text.slice(0, maxLength) : null;
}

function slug(value) {
  const normalized = String(value || "asset")
    .normalize("NFKC")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-|-$/g, "")
    .toUpperCase();
  return normalized || "ASSET";
}

function parseClock(value) {
  const match = String(value || "").match(/^(\d{1,2}):(\d{2})$/);
  assert(match, "Time windows must use HH:mm.");
  const hour = Number.parseInt(match[1], 10);
  const minute = Number.parseInt(match[2], 10);
  assert(hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59, "Time windows must use valid HH:mm values.");
  return hour * 60 + minute;
}

function clockMinutes(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
  return leftStart < rightEnd && rightStart < leftEnd;
}

export function createInitialAssetState() {
  return {
    version: 1,
    assets: [],
    loans: [],
    debts: [],
    updatedAt: null,
  };
}

export function migrateAssetState(input) {
  const state = input && typeof input === "object" ? clone(input) : createInitialAssetState();
  state.version = 1;
  state.assets = Array.isArray(state.assets) ? state.assets : [];
  state.loans = Array.isArray(state.loans) ? state.loans : [];
  state.debts = Array.isArray(state.debts)
    ? state.debts.map((transaction) => normalizeTransaction(transaction)).filter(Boolean)
    : [];

  for (const asset of state.assets) {
    asset.units = Array.isArray(asset.units) ? asset.units : [];
    asset.loanabilityHistory = normalizeLoanabilityHistory(asset);
    asset.maxLoanDays = toOptionalPositiveInteger(asset.maxLoanDays);

    for (const unit of asset.units) {
      unit.damageHistory = Array.isArray(unit.damageHistory) ? unit.damageHistory : [];
    }
  }

  return state;
}

export function normalizeAvailability(input = {}) {
  const weekly = Array.isArray(input.weekly) && input.weekly.length
    ? input.weekly.map((window) => {
        const day = Number.parseInt(window.day, 10);
        const start = String(window.start || "").trim();
        const end = String(window.end || "").trim();
        assert(day >= 0 && day <= 6, "Collection weekday must be between 0 and 6.");
        assert(parseClock(start) < parseClock(end), "Collection time ranges must end after they start.");
        return { day, start, end };
      })
    : clone(DEFAULT_WEEKLY_WINDOWS);

  const dateRanges = (Array.isArray(input.dateRanges) ? input.dateRanges : [])
    .filter((range) => range?.start || range?.end)
    .map((range) => {
      const start = toDate(range.start, "Availability range start").toISOString();
      const end = toDate(range.end, "Availability range end").toISOString();
      assert(new Date(start).getTime() < new Date(end).getTime(), "Availability date ranges must end after they start.");
      return { start, end };
    })
    .sort((left, right) => new Date(left.start).getTime() - new Date(right.start).getTime());

  for (let index = 1; index < dateRanges.length; index += 1) {
    const previous = dateRanges[index - 1];
    const current = dateRanges[index];
    assert(
      new Date(previous.end).getTime() <= new Date(current.start).getTime(),
      "Availability date ranges cannot intersect.",
    );
  }

  return { weekly, dateRanges };
}

function makeSerials(name, quantity, existing = []) {
  const prefix = slug(name).slice(0, 16);
  const existingSerials = new Set(existing.map((unit) => unit.serial));
  const units = [];
  let index = 1;

  while (units.length < quantity) {
    const serial = `${prefix}-${String(index).padStart(3, "0")}`;
    index += 1;
    if (!existingSerials.has(serial)) {
      units.push(serial);
    }
  }

  return units;
}

function activeUnits(asset) {
  return (asset.units || []).filter((unit) => !unit.deletedAt && unit.condition !== "deleted");
}

function normalLoanableUnits(asset) {
  return activeUnits(asset).filter((unit) => unit.condition === "normal");
}

function findAsset(state, assetId) {
  const asset = state.assets.find((entry) => entry.id === assetId && !entry.deletedAt);
  assert(asset, "Asset not found.");
  return asset;
}

function findUnit(asset, unitId) {
  const unit = (asset.units || []).find((entry) => entry.id === unitId && !entry.deletedAt);
  assert(unit, "Asset unit not found.");
  return unit;
}

function findLoan(state, loanId) {
  const loan = state.loans.find((entry) => entry.id === loanId);
  assert(loan, "Loan not found.");
  return loan;
}

function actorMatchesLoan(loan, actor) {
  return loan.userId === actor?.userId || loan.userEmail === actor?.userEmail;
}

function activeLoanStatuses() {
  return new Set(["reserved", "collected"]);
}

function isUnitOutOfPremises(state, unitId) {
  return state.loans.some((loan) => loan.status === "collected" && loan.unitIds.includes(unitId));
}

function conflictingLoans(state, unitId, start, end, exceptLoanId = null) {
  return state.loans.filter((loan) => {
    if (loan.id === exceptLoanId || !activeLoanStatuses().has(loan.status) || !loan.unitIds.includes(unitId)) {
      return false;
    }
    return rangesOverlap(
      new Date(loan.collectionAt).getTime(),
      new Date(loan.returnDueAt).getTime(),
      start.getTime(),
      end.getTime(),
    );
  });
}

function assertMaxLoanDuration(asset, start, end) {
  if (!asset.maxLoanDays) return;
  const maxMs = asset.maxLoanDays * 24 * 60 * 60 * 1000;
  assert(end.getTime() - start.getTime() <= maxMs, `Loan duration cannot exceed ${asset.maxLoanDays} day${asset.maxLoanDays === 1 ? "" : "s"}.`);
}

function effectiveLoanDurationMs(asset, loan) {
  if (asset.maxLoanDays) return asset.maxLoanDays * 24 * 60 * 60 * 1000;
  return Math.max(
    60 * 60 * 1000,
    new Date(loan.returnDueAt).getTime() - new Date(loan.collectionAt).getTime(),
  );
}

function isCollectionTimeAllowed(asset, collectionAt) {
  const date = toDate(collectionAt, "Collection date");
  const availability = asset.availability || normalizeAvailability();
  const inDateRange = !availability.dateRanges?.length || availability.dateRanges.some((range) =>
    date.getTime() >= new Date(range.start).getTime() && date.getTime() <= new Date(range.end).getTime()
  );
  if (!inDateRange) return false;

  return (availability.weekly || []).some((window) => {
    if (date.getDay() !== window.day) return false;
    const minutes = clockMinutes(date);
    return minutes >= parseClock(window.start) && minutes <= parseClock(window.end);
  });
}

function collectionMissed(loan, now) {
  return loan.status === "reserved" &&
    new Date(loan.collectionAt).getTime() + 24 * 60 * 60 * 1000 < new Date(now).getTime();
}

function addDebt(state, entry) {
  if (!entry.userId && !entry.userEmail) return null;
  const amountPence = Math.round(Number(entry.amountPence || 0));
  if (!Number.isFinite(amountPence) || amountPence === 0) return null;
  if (entry.id) {
    const existing = state.debts.find((transaction) => transaction.id === entry.id);
    if (existing) return existing;
  }

  const debt = {
    id: entry.id || id("debt"),
    userId: entry.userId || null,
    userEmail: entry.userEmail || null,
    amountPence,
    currency: "GBP",
    reason: entry.reason || "Asset charge",
    description: String(entry.description || entry.reason || "Asset charge").trim(),
    transactionType: entry.transactionType || entry.type || (amountPence < 0 ? "refund" : "asset_charge"),
    affectsBalance: entry.affectsBalance !== false,
    assetId: entry.assetId || null,
    unitIds: entry.unitIds || [],
    loanId: entry.loanId || null,
    fileId: entry.fileId || null,
    printName: entry.printName || null,
    createdByAdminId: entry.createdByAdminId || null,
    createdByAdminEmail: entry.createdByAdminEmail || null,
    createdAt: entry.createdAt || nowIso(),
  };
  state.debts.push(debt);
  return debt;
}

function normalizeTransaction(entry) {
  if (!entry || typeof entry !== "object") return null;
  const amountPence = Math.round(Number(entry.amountPence || 0));
  if (!Number.isFinite(amountPence) || amountPence === 0) return null;

  return {
    ...entry,
    id: entry.id || id("debt"),
    userId: entry.userId || null,
    userEmail: entry.userEmail || null,
    amountPence,
    currency: entry.currency || "GBP",
    reason: entry.reason || entry.description || (amountPence < 0 ? "Refund" : "Account charge"),
    description: String(entry.description || entry.reason || "").trim(),
    transactionType: entry.transactionType || entry.type || (amountPence < 0 ? "refund" : "asset_charge"),
    affectsBalance: entry.affectsBalance !== false,
    assetId: entry.assetId || null,
    unitIds: Array.isArray(entry.unitIds) ? entry.unitIds : [],
    loanId: entry.loanId || null,
    fileId: entry.fileId || null,
    printName: entry.printName || null,
    createdByAdminId: entry.createdByAdminId || null,
    createdByAdminEmail: entry.createdByAdminEmail || null,
    createdAt: entry.createdAt || nowIso(),
  };
}

function normalizeLoanabilityHistory(asset) {
  const history = Array.isArray(asset.loanabilityHistory) ? asset.loanabilityHistory : [];
  const normalized = history
    .filter((entry) => entry && typeof entry === "object" && (entry.startAt || entry.startedAt))
    .map((entry) => ({
      id: entry.id || id("loanable"),
      loanable: entry.loanable !== false,
      startAt: nowIso(entry.startAt || entry.startedAt),
      endAt: entry.endAt || entry.endedAt ? nowIso(entry.endAt || entry.endedAt) : null,
      changedByAdminId: entry.changedByAdminId || null,
      changedByAdminEmail: entry.changedByAdminEmail || null,
    }))
    .sort((left, right) => new Date(left.startAt).getTime() - new Date(right.startAt).getTime());

  if (!normalized.length && asset.loanable) {
    normalized.push({
      id: id("loanable"),
      loanable: true,
      startAt: asset.createdAt || asset.updatedAt || nowIso(),
      endAt: null,
      changedByAdminId: null,
      changedByAdminEmail: null,
    });
  }

  return normalized;
}

function setLoanability(asset, loanable, timestamp, admin = {}) {
  const nextLoanable = Boolean(loanable);
  asset.loanabilityHistory = normalizeLoanabilityHistory(asset);

  if (Boolean(asset.loanable) === nextLoanable) {
    asset.loanable = nextLoanable;
    return;
  }

  if (nextLoanable) {
    asset.loanabilityHistory.push({
      id: id("loanable"),
      loanable: true,
      startAt: timestamp,
      endAt: null,
      changedByAdminId: admin.id || admin.sub || null,
      changedByAdminEmail: admin.email || null,
    });
  } else {
    const openPeriod = [...asset.loanabilityHistory].reverse().find((entry) => entry.loanable && !entry.endAt);
    if (openPeriod) {
      openPeriod.endAt = timestamp;
      openPeriod.changedByAdminId = admin.id || admin.sub || openPeriod.changedByAdminId || null;
      openPeriod.changedByAdminEmail = admin.email || openPeriod.changedByAdminEmail || null;
    }
  }

  asset.loanable = nextLoanable;
}

function recordUnitHistory(unit, entry) {
  unit.damageHistory = Array.isArray(unit.damageHistory) ? unit.damageHistory : [];
  unit.damageHistory.push({
    id: entry.id || id("damage"),
    kind: entry.kind,
    damageDescription: entry.damageDescription || "",
    fixDescription: entry.fixDescription || "",
    chargePence: Math.max(0, Math.round(entry.chargePence || 0)),
    chargedUserId: entry.chargedUserId || null,
    chargedUserEmail: entry.chargedUserEmail || null,
    createdAt: entry.createdAt || nowIso(),
  });
}

export function expireMissedCollections(state, now = new Date()) {
  const next = migrateAssetState(state);
  const timestamp = nowIso(now);

  for (const loan of next.loans) {
    if (collectionMissed(loan, now)) {
      loan.status = "cancelled";
      loan.cancelledAt = timestamp;
      loan.cancelReason = "Collection was not completed within one day of the booked time.";
      loan.updatedAt = timestamp;
    }
  }

  next.updatedAt = timestamp;
  return next;
}

export function createAsset(state, input, now = new Date()) {
  const next = migrateAssetState(state);
  const name = String(input.name || "").trim();
  assert(name, "Asset name is required.");

  const quantity = toPositiveInteger(input.quantity, 1);
  const timestamp = nowIso(now);
  const loanable = Boolean(input.loanable);
  const units = makeSerials(name, quantity).map((serial) => ({
    id: id("unit"),
    serial,
    condition: "normal",
    damageHistory: [],
    createdAt: timestamp,
    deletedAt: null,
  }));
  const asset = {
    id: input.id || id("asset"),
    name,
    description: String(input.description || "").trim(),
    loanable,
    pricePence: toPence(input.pricePence ?? input.assetPricePence ?? input.assetPrice, 0),
    lateFeePence: toPence(input.lateFeePence ?? input.lateFee, DEFAULT_LATE_FEE_PENCE),
    totalFailureDays: toPositiveInteger(input.totalFailureDays, DEFAULT_FAILURE_DAYS),
    maxLoanDays: toOptionalPositiveInteger(input.maxLoanDays),
    availability: normalizeAvailability(input.availability),
    units,
    loanabilityHistory: loanable
      ? [{
          id: id("loanable"),
          loanable: true,
          startAt: timestamp,
          endAt: null,
          changedByAdminId: null,
          changedByAdminEmail: null,
        }]
      : [],
    createdAt: timestamp,
    updatedAt: timestamp,
    deletedAt: null,
  };

  next.assets.push(asset);
  next.updatedAt = timestamp;
  return { state: next, asset };
}

export function updateAsset(state, assetId, input, now = new Date()) {
  const next = migrateAssetState(state);
  const asset = findAsset(next, assetId);
  const timestamp = nowIso(now);
  const name = String(input.name ?? asset.name).trim();
  assert(name, "Asset name is required.");

  asset.name = name;
  asset.description = String(input.description ?? asset.description ?? "").trim();
  setLoanability(asset, Boolean(input.loanable ?? asset.loanable), timestamp);
  asset.pricePence = toPence(input.pricePence ?? input.assetPricePence ?? input.assetPrice, asset.pricePence);
  asset.lateFeePence = toPence(input.lateFeePence ?? input.lateFee, asset.lateFeePence ?? DEFAULT_LATE_FEE_PENCE);
  asset.totalFailureDays = toPositiveInteger(input.totalFailureDays, asset.totalFailureDays ?? DEFAULT_FAILURE_DAYS);
  asset.maxLoanDays = input.maxLoanDays === undefined ? asset.maxLoanDays ?? null : toOptionalPositiveInteger(input.maxLoanDays);
  asset.availability = normalizeAvailability(input.availability || asset.availability);

  if (input.quantity !== undefined) {
    const desiredQuantity = toPositiveInteger(input.quantity, activeUnits(asset).length || 1);
    const currentUnits = activeUnits(asset);
    if (desiredQuantity > currentUnits.length) {
      const serials = makeSerials(name, desiredQuantity - currentUnits.length, asset.units || []);
      asset.units.push(
        ...serials.map((serial) => ({
          id: id("unit"),
          serial,
          condition: "normal",
          damageHistory: [],
          createdAt: timestamp,
          deletedAt: null,
        })),
      );
    } else if (desiredQuantity < currentUnits.length) {
      const removable = currentUnits
        .filter((unit) => !isUnitOutOfPremises(next, unit.id))
        .slice(0, currentUnits.length - desiredQuantity);
      assert(removable.length === currentUnits.length - desiredQuantity, "Cannot reduce quantity while units are out on loan.");
      for (const unit of removable) {
        unit.condition = "deleted";
        unit.deletedAt = timestamp;
      }
    }
  }

  asset.updatedAt = timestamp;
  next.updatedAt = timestamp;
  return { state: next, asset };
}

export function setAssetLoanable(state, assetId, loanable, now = new Date()) {
  const next = migrateAssetState(state);
  const asset = findAsset(next, assetId);
  const timestamp = nowIso(now);
  setLoanability(asset, loanable, timestamp);
  asset.updatedAt = timestamp;
  next.updatedAt = timestamp;
  return { state: next, asset };
}

export function deleteAsset(state, assetId, now = new Date()) {
  const next = migrateAssetState(state);
  const asset = findAsset(next, assetId);
  const timestamp = nowIso(now);
  const activeLoan = next.loans.find((loan) =>
    activeLoanStatuses().has(loan.status) && loan.unitIds.some((unitId) => (asset.units || []).some((unit) => unit.id === unitId)),
  );
  assert(!activeLoan, "Cannot delete an asset while it has active reservations or loans.");
  asset.deletedAt = timestamp;
  asset.updatedAt = timestamp;
  for (const unit of asset.units || []) {
    unit.condition = "deleted";
    unit.deletedAt = timestamp;
  }
  next.updatedAt = timestamp;
  return { state: next, asset };
}

export function deleteUnit(state, assetId, unitId, now = new Date()) {
  const next = migrateAssetState(state);
  const asset = findAsset(next, assetId);
  const unit = findUnit(asset, unitId);
  assert(!isUnitOutOfPremises(next, unitId), "Cannot delete a unit while it is out on loan.");
  const activeReservation = next.loans.find((loan) => loan.status === "reserved" && loan.unitIds.includes(unitId));
  assert(!activeReservation, "Cannot delete a unit while it has an active reservation.");
  const timestamp = nowIso(now);
  unit.condition = "deleted";
  unit.deletedAt = timestamp;
  asset.updatedAt = timestamp;
  next.updatedAt = timestamp;
  return { state: next, unit };
}

function availableUnitsForRange(state, asset, start, end, exceptLoanId = null) {
  return normalLoanableUnits(asset).filter((unit) =>
    !conflictingLoans(state, unit.id, start, end, exceptLoanId).length,
  );
}

export function userHasOverdueLoan(state, actor, now = new Date()) {
  return state.loans.some((loan) =>
    actorMatchesLoan(loan, actor) &&
    loan.status === "collected" &&
    new Date(loan.returnDueAt).getTime() < new Date(now).getTime()
  );
}

export function bookLoan(state, input, now = new Date()) {
  let next = expireMissedCollections(state, now);
  const asset = findAsset(next, input.assetId);
  assert(asset.loanable, "This asset is not loanable.");
  assert(input.acceptTerms === true, "The loan terms must be accepted before booking.");

  const actor = { userId: input.userId, userEmail: input.userEmail };
  assert(actor.userId || actor.userEmail, "A borrower identity is required.");
  assert(!userHasOverdueLoan(next, actor, now), "Borrowers with overdue loans cannot make new bookings.");

  const collectionAt = toDate(input.collectionAt, "Collection date");
  const returnDueAt = toDate(input.returnAt ?? input.returnDueAt, "Return date");
  assert(collectionAt.getTime() >= new Date(now).getTime(), "Collection date cannot be in the past.");
  assert(returnDueAt.getTime() > collectionAt.getTime(), "Return date must be after collection date.");
  assertMaxLoanDuration(asset, collectionAt, returnDueAt);
  assert(isCollectionTimeAllowed(asset, collectionAt), "Collection time is outside this asset's availability windows.");

  const quantity = toRequiredPositiveInteger(
    input.quantity ?? (Array.isArray(input.unitIds) ? input.unitIds.length : undefined),
    "Loan quantity",
  );
  const available = availableUnitsForRange(next, asset, collectionAt, returnDueAt);
  const selectedUnitIds = Array.isArray(input.unitIds) && input.unitIds.length
    ? Array.from(new Set(input.unitIds))
    : available.slice(0, quantity).map((unit) => unit.id);
  assert(selectedUnitIds.length === quantity, "Not enough units are available for the selected dates.");

  for (const unitId of selectedUnitIds) {
    const unit = findUnit(asset, unitId);
    assert(unit.condition === "normal", "Only undamaged units can be loaned.");
    assert(available.some((entry) => entry.id === unitId), `Unit ${unit.serial} is not available for the selected dates.`);
  }

  const timestamp = nowIso(now);
  const loan = {
    id: input.id || id("loan"),
    assetId: asset.id,
    unitIds: selectedUnitIds,
    userId: input.userId || null,
    userEmail: input.userEmail || null,
    status: "reserved",
    collectionAt: collectionAt.toISOString(),
    originallyBookedCollectionAt: null,
    returnDueAt: returnDueAt.toISOString(),
    collectedAt: null,
    returnedAt: null,
    cancelledAt: null,
    lostAt: null,
    collectionCode: input.collectionCode || String(crypto.randomInt(100000, 999999)),
    returnCode: input.returnCode || String(crypto.randomInt(100000, 999999)),
    termsAcceptedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  next.loans.push(loan);
  next.updatedAt = timestamp;
  return { state: next, loan };
}

export function verifyCollectionCode(state, input, now = new Date()) {
  let next = expireMissedCollections(state, now);
  const loan = findLoan(next, input.loanId);
  assert(loan.status === "reserved", "Only reserved loans can be collected.");
  assert(String(input.code || "").trim() === loan.collectionCode, "Collection code is incorrect.");
  const asset = findAsset(next, loan.assetId);
  const timestamp = nowIso(now);
  const actualCollectionAt = input.overrideCollectionAt ? toDate(input.overrideCollectionAt, "Override collection date") : new Date(now);
  const bookedCollectionAt = new Date(loan.collectionAt);
  const earlyCollection = actualCollectionAt.getTime() < bookedCollectionAt.getTime() - 60_000;
  let nextReturnDueAt = new Date(loan.returnDueAt);

  if (earlyCollection) {
    assert(input.allowEarlyCollection === true, "Early collection requires admin override.");
    nextReturnDueAt = new Date(actualCollectionAt.getTime() + effectiveLoanDurationMs(asset, loan));
  }

  for (const unitId of loan.unitIds) {
    assert(!conflictingLoans(next, unitId, actualCollectionAt, nextReturnDueAt, loan.id).length, "This asset is booked by someone else before the requested early collection window ends.");
  }

  loan.status = "collected";
  if (earlyCollection) {
    loan.originallyBookedCollectionAt = loan.originallyBookedCollectionAt || loan.collectionAt;
    loan.collectionAt = actualCollectionAt.toISOString();
    loan.returnDueAt = nextReturnDueAt.toISOString();
    loan.collectedEarly = true;
  } else {
    loan.collectedEarly = false;
  }
  loan.collectedAt = actualCollectionAt.toISOString();
  loan.collectionVerifiedBy = input.adminId || null;
  loan.updatedAt = timestamp;
  next.updatedAt = timestamp;
  return { state: next, loan };
}

function normalizeReturnItems(inputItems, loan, legacyDamagedUnitIds, legacyDamaged) {
  const submitted = Array.isArray(inputItems)
    ? new Map(inputItems.map((item) => [item?.unitId, item]).filter(([unitId]) => unitId))
    : new Map();

  return loan.unitIds.map((unitId) => {
    const item = submitted.get(unitId) || {};
    const damaged = item.damaged === true || legacyDamaged === true || legacyDamagedUnitIds.has(unitId);
    return {
      unitId,
      returned: item.returned !== false,
      damaged,
      damageDescription: textOrNull(item.damageDescription, 1000),
    };
  });
}

function normalizeReturnPhotos(inputPhotos) {
  const photos = Array.isArray(inputPhotos) ? inputPhotos.slice(0, MAX_RETURN_PHOTOS) : [];
  return photos.map((photo) => {
    const name = textOrNull(photo?.name, 200) || "return-photo.jpg";
    const type = textOrNull(photo?.type, 100) || "image/jpeg";
    const dataUrl = String(photo?.dataUrl || "");
    assert(type.startsWith("image/"), "Return photos must be images.");
    assert(dataUrl.startsWith("data:image/"), "Return photos must be image data URLs.");
    assert(dataUrl.length <= MAX_RETURN_PHOTO_DATA_URL_BYTES, "Return photos must be 2.5 MB or smaller after compression.");
    return {
      id: photo?.id || id("return_photo"),
      name,
      type,
      size: Math.max(0, Math.round(Number(photo?.size || 0))),
      dataUrl,
      createdAt: nowIso(),
    };
  });
}

export function verifyReturnCode(state, input, now = new Date()) {
  const next = migrateAssetState(state);
  const loan = findLoan(next, input.loanId);
  assert(loan.status === "collected", "Only collected loans can be returned.");
  assert(String(input.code || "").trim() === loan.returnCode, "Return code is incorrect.");
  const asset = findAsset(next, loan.assetId);
  const timestamp = nowIso(now);
  const legacyDamagedUnitIds = new Set(input.damagedUnitIds || []);
  const returnItems = normalizeReturnItems(input.returnItems, loan, legacyDamagedUnitIds, input.damaged === true);
  assert(returnItems.every((item) => item.returned), "All loaned serials must be returned before closing the loan.");
  const damagedUnitIds = new Set(returnItems.filter((item) => item.damaged).map((item) => item.unitId));
  const chargePence = Math.max(0, Math.round(input.damageChargePence || 0));
  const discretionaryChargePence = toPence(input.discretionaryChargePence ?? input.discretionaryCharge, 0);
  const discretionaryChargeDescription = textOrNull(input.discretionaryChargeDescription, 500);
  const overdue = new Date(loan.returnDueAt).getTime() < new Date(now).getTime();
  const lateFeeWaived = Boolean(input.waiveLateFee);
  const lateFeePence = overdue && !lateFeeWaived ? (asset.lateFeePence || DEFAULT_LATE_FEE_PENCE) * loan.unitIds.length : 0;
  const returnPhotos = normalizeReturnPhotos(input.returnPhotos);
  const damageByUnitId = new Map(returnItems.map((item) => [item.unitId, item]));

  for (const unitId of loan.unitIds) {
    const unit = findUnit(asset, unitId);
    if (damagedUnitIds.has(unitId)) {
      const returnItem = damageByUnitId.get(unitId) || {};
      unit.condition = "damaged";
      recordUnitHistory(unit, {
        kind: "damage",
        damageDescription: returnItem.damageDescription || input.damageDescription || "Marked damaged on return.",
        chargePence,
        chargedUserId: chargePence ? loan.userId : null,
        chargedUserEmail: chargePence ? loan.userEmail : null,
        createdAt: timestamp,
      });
    }
  }

  if (chargePence) {
    addDebt(next, {
      userId: loan.userId,
      userEmail: loan.userEmail,
      amountPence: chargePence,
      reason: "Asset damage charge",
      description: `Damage charge for ${asset.name}`,
      transactionType: "asset_damage",
      assetId: asset.id,
      unitIds: Array.from(damagedUnitIds),
      loanId: loan.id,
      createdAt: timestamp,
    });
  }

  if (lateFeePence) {
    addDebt(next, {
      userId: loan.userId,
      userEmail: loan.userEmail,
      amountPence: lateFeePence,
      reason: "Late fee",
      description: `Late return fee for ${asset.name}`,
      transactionType: "late_fee",
      assetId: asset.id,
      unitIds: loan.unitIds,
      loanId: loan.id,
      createdAt: timestamp,
    });
  }

  if (discretionaryChargePence) {
    addDebt(next, {
      userId: loan.userId,
      userEmail: loan.userEmail,
      amountPence: discretionaryChargePence,
      reason: "Discretionary return charge",
      description: discretionaryChargeDescription || `Discretionary return charge for ${asset.name}`,
      transactionType: "asset_discretionary",
      assetId: asset.id,
      unitIds: loan.unitIds,
      loanId: loan.id,
      createdAt: timestamp,
    });
  }

  loan.status = "returned";
  loan.returnedAt = timestamp;
  loan.returnVerifiedBy = input.adminId || null;
  loan.returnNote = textOrNull(input.returnNote, 2000);
  loan.returnItems = returnItems;
  loan.returnPhotos = returnPhotos;
  loan.lateFeeWaived = lateFeeWaived;
  loan.lateFeePence = lateFeePence;
  loan.damageChargePence = chargePence;
  loan.discretionaryChargePence = discretionaryChargePence;
  loan.discretionaryChargeDescription = discretionaryChargeDescription;
  loan.updatedAt = timestamp;
  next.updatedAt = timestamp;
  return { state: next, loan };
}

export function rescheduleLoan(state, input, now = new Date()) {
  const next = expireMissedCollections(state, now);
  const loan = findLoan(next, input.loanId);
  assert(loan.status === "reserved", "Only future reservations can be rescheduled.");
  assert(actorMatchesLoan(loan, input), "Only the borrower can reschedule this loan.");

  const asset = findAsset(next, loan.assetId);
  const collectionAt = toDate(input.collectionAt ?? loan.collectionAt, "Collection date");
  const returnDueAt = toDate(input.returnAt ?? input.returnDueAt ?? loan.returnDueAt, "Return date");
  assert(collectionAt.getTime() >= new Date(now).getTime(), "Collection date cannot be in the past.");
  assert(returnDueAt.getTime() > collectionAt.getTime(), "Return date must be after collection date.");
  assertMaxLoanDuration(asset, collectionAt, returnDueAt);
  assert(isCollectionTimeAllowed(asset, collectionAt), "Collection time is outside this asset's availability windows.");

  for (const unitId of loan.unitIds) {
    assert(!conflictingLoans(next, unitId, collectionAt, returnDueAt, loan.id).length, "The selected dates clash with another booking.");
  }

  loan.collectionAt = collectionAt.toISOString();
  loan.returnDueAt = returnDueAt.toISOString();
  loan.updatedAt = nowIso(now);
  next.updatedAt = loan.updatedAt;
  return { state: next, loan };
}

export function extendLoan(state, input, now = new Date()) {
  const next = migrateAssetState(state);
  const loan = findLoan(next, input.loanId);
  assert(actorMatchesLoan(loan, input), "Only the borrower can update this loan.");
  assert(loan.status === "collected", "Only collected loans can be updated.");
  assert(new Date(loan.returnDueAt).getTime() >= new Date(now).getTime(), "Overdue loans cannot be extended.");

  const newReturnAt = toDate(input.returnAt ?? input.returnDueAt, "Return date");
  assert(newReturnAt.getTime() >= new Date(now).getTime(), "Return date cannot be in the past.");
  assert(newReturnAt.getTime() > new Date(loan.collectedAt || loan.collectionAt).getTime(), "Return date must be after collection.");
  assertMaxLoanDuration(findAsset(next, loan.assetId), new Date(loan.collectedAt || loan.collectionAt), newReturnAt);

  for (const unitId of loan.unitIds) {
    assert(!conflictingLoans(next, unitId, new Date(loan.collectedAt || loan.collectionAt), newReturnAt, loan.id).length, "The selected return date clashes with another booking.");
  }

  loan.returnDueAt = newReturnAt.toISOString();
  loan.updatedAt = nowIso(now);
  next.updatedAt = loan.updatedAt;
  return { state: next, loan };
}

export function markLoanLostByUser(state, input, now = new Date()) {
  const next = migrateAssetState(state);
  const loan = findLoan(next, input.loanId);
  assert(actorMatchesLoan(loan, input), "Only the borrower can mark this loan lost.");
  assert(loan.status === "collected", "Only collected loans can be marked lost.");
  const asset = findAsset(next, loan.assetId);
  const timestamp = nowIso(now);
  const chargePence = asset.pricePence * loan.unitIds.length;

  for (const unitId of loan.unitIds) {
    const unit = findUnit(asset, unitId);
    unit.condition = "lost";
    recordUnitHistory(unit, {
      kind: "lost",
      damageDescription: input.description || "Borrower marked the item lost.",
      chargePence: asset.pricePence,
      chargedUserId: loan.userId,
      chargedUserEmail: loan.userEmail,
      createdAt: timestamp,
    });
  }

  addDebt(next, {
    userId: loan.userId,
    userEmail: loan.userEmail,
    amountPence: chargePence,
    reason: "Full replacement value for lost asset",
    description: `Lost asset replacement charge for ${asset.name}`,
    transactionType: "lost_replacement",
    assetId: asset.id,
    unitIds: loan.unitIds,
    loanId: loan.id,
    createdAt: timestamp,
  });

  loan.status = "lost";
  loan.lostAt = timestamp;
  loan.updatedAt = timestamp;
  next.updatedAt = timestamp;
  return { state: next, loan };
}

export function markUnitsDamaged(state, input, now = new Date()) {
  const next = migrateAssetState(state);
  const asset = findAsset(next, input.assetId);
  const timestamp = nowIso(now);
  const unitIds = input.unitIds || [];
  assert(unitIds.length, "At least one serial number must be selected.");

  for (const unitId of unitIds) {
    const unit = findUnit(asset, unitId);
    unit.condition = "damaged";
    recordUnitHistory(unit, {
      kind: "damage",
      damageDescription: input.damageDescription || "Marked damaged by asset admin.",
      chargePence: input.chargePence || 0,
      chargedUserId: input.chargeUserId || null,
      chargedUserEmail: input.chargeUserEmail || null,
      createdAt: timestamp,
    });
  }

  if (input.chargePence) {
    addDebt(next, {
      userId: input.chargeUserId || null,
      userEmail: input.chargeUserEmail || null,
      amountPence: input.chargePence,
      reason: "Asset damage charge",
      description: `Damage charge for ${asset.name}`,
      transactionType: "asset_damage",
      assetId: asset.id,
      unitIds,
      createdAt: timestamp,
    });
  }

  asset.updatedAt = timestamp;
  next.updatedAt = timestamp;
  return { state: next, asset };
}

export function recoverLostUnits(state, input, now = new Date()) {
  const next = migrateAssetState(state);
  const asset = findAsset(next, input.assetId);
  const timestamp = nowIso(now);
  const unitIds = input.unitIds || [];
  assert(unitIds.length, "At least one serial number must be selected.");

  for (const unitId of unitIds) {
    const unit = findUnit(asset, unitId);
    assert(unit.condition === "lost", "Only lost units can be recovered.");
    unit.condition = input.damaged ? "damaged" : "normal";
    recordUnitHistory(unit, {
      kind: input.damaged ? "recovered_damaged" : "recovered",
      damageDescription: input.damageDescription || "",
      chargePence: input.chargePence || 0,
      chargedUserId: input.chargeUserId || null,
      chargedUserEmail: input.chargeUserEmail || null,
      createdAt: timestamp,
    });
  }

  if (input.chargePence) {
    addDebt(next, {
      userId: input.chargeUserId || null,
      userEmail: input.chargeUserEmail || null,
      amountPence: input.chargePence,
      reason: "Recovered asset damage charge",
      description: `Recovered asset damage charge for ${asset.name}`,
      transactionType: "recovered_damage",
      assetId: asset.id,
      unitIds,
      createdAt: timestamp,
    });
  }

  asset.updatedAt = timestamp;
  next.updatedAt = timestamp;
  return { state: next, asset };
}

export function repairUnits(state, input, now = new Date()) {
  const next = migrateAssetState(state);
  const asset = findAsset(next, input.assetId);
  const timestamp = nowIso(now);
  const unitIds = input.unitIds || [];
  assert(unitIds.length, "At least one serial number must be selected.");
  const repairCostPence = Math.max(0, Math.round(input.repairCostPence || 0));

  for (const unitId of unitIds) {
    const unit = findUnit(asset, unitId);
    assert(unit.condition === "damaged", "Only damaged units can be repaired.");
    unit.condition = "normal";
    recordUnitHistory(unit, {
      kind: "repair",
      fixDescription: input.fixDescription || "Marked repaired.",
      chargePence: repairCostPence,
      createdAt: timestamp,
    });
  }

  if (input.applyDiscount && input.chargedUserId && input.originalChargePence > repairCostPence) {
    addDebt(next, {
      userId: input.chargedUserId,
      userEmail: input.chargedUserEmail || null,
      amountPence: repairCostPence - input.originalChargePence,
      reason: "Damage repair discount",
      description: `Damage repair discount for ${asset.name}`,
      transactionType: "damage_refund",
      assetId: asset.id,
      unitIds,
      createdAt: timestamp,
    });
  }

  asset.updatedAt = timestamp;
  next.updatedAt = timestamp;
  return { state: next, asset };
}

export function adjustAccountBalance(state, input, admin = {}, now = new Date()) {
  const next = migrateAssetState(state);
  const userId = input.userId || null;
  const userEmail = String(input.userEmail || "").trim() || null;
  assert(userId || userEmail, "A user id or email is required.");

  const adjustmentType = String(input.adjustmentType || input.type || "").trim();
  assert(["surcharge", "refund"].includes(adjustmentType), "Adjustment type must be surcharge or refund.");

  const amountPence = toPence(input.amountPence ?? input.amount, 0);
  assert(amountPence > 0, "Adjustment amount must be greater than zero.");

  const description = String(input.description || "").trim();
  assert(description, "Adjustment description is required.");

  const timestamp = nowIso(now);
  const transaction = addDebt(next, {
    userId,
    userEmail,
    amountPence: adjustmentType === "refund" ? -amountPence : amountPence,
    reason: adjustmentType === "refund" ? "Manual refund" : "Manual surcharge",
    description,
    transactionType: adjustmentType === "refund" ? "manual_refund" : "manual_surcharge",
    createdByAdminId: admin.id || admin.sub || null,
    createdByAdminEmail: admin.email || null,
    createdAt: timestamp,
  });

  next.updatedAt = timestamp;
  return { state: next, transaction };
}

export function recordPrintPaymentTransaction(state, input, now = new Date()) {
  const next = migrateAssetState(state);
  const userId = input.userId || input.ownerSub || null;
  const userEmail = String(input.userEmail || "").trim() || null;
  assert(userId || userEmail, "A print payment owner is required.");

  const amountPence = Math.round(Number(input.amountPence || input.amountMinor || 0));
  assert(amountPence > 0, "Print payment amount must be greater than zero.");

  const printName = String(input.printName || input.filename || input.originalFilename || input.fileId || "3D print").trim();
  const fileId = String(input.fileId || "").trim();
  const timestamp = input.paidAt ? nowIso(input.paidAt) : nowIso(now);
  const transaction = addDebt(next, {
    id: fileId ? `print_payment_${fileId}` : undefined,
    userId,
    userEmail,
    amountPence,
    reason: "3D print payment",
    description: `3D print payment: ${printName}`,
    transactionType: "print_payment",
    affectsBalance: false,
    fileId,
    printName,
    createdAt: timestamp,
  });

  next.updatedAt = timestamp;
  return { state: next, transaction };
}

export function recordPrintFilamentAdjustmentTransaction(state, input, now = new Date()) {
  const next = migrateAssetState(state);
  const userId = input.userId || input.ownerSub || null;
  const userEmail = String(input.userEmail || "").trim() || null;
  assert(userId || userEmail, "A print adjustment owner is required.");

  const amountPence = Math.round(Number(input.amountPence || input.deltaMinor || 0));
  if (!Number.isFinite(amountPence) || amountPence === 0) {
    return { state: next, transaction: null };
  }

  const printName = String(input.printName || input.filename || input.originalFilename || input.fileId || "3D print").trim();
  const fileId = String(input.fileId || "").trim();
  const timestamp = nowIso(now);
  const isRefund = amountPence < 0;
  const transaction = addDebt(next, {
    id: fileId ? `print_filament_adjustment_${fileId}` : undefined,
    userId,
    userEmail,
    amountPence,
    reason: isRefund ? "3D print filament refund" : "3D print filament surcharge",
    description: input.description || `${isRefund ? "Filament refund" : "Filament surcharge"} for ${printName}`,
    transactionType: isRefund ? "print_filament_refund" : "print_filament_surcharge",
    fileId,
    printName,
    createdByAdminId: input.createdByAdminId || null,
    createdByAdminEmail: input.createdByAdminEmail || null,
    createdAt: timestamp,
  });

  next.updatedAt = timestamp;
  return { state: next, transaction };
}

function nextAvailability(asset, state, now = new Date()) {
  const start = new Date(now);
  for (let dayOffset = 0; dayOffset < 90; dayOffset += 1) {
    for (let hour = 0; hour < 24; hour += 1) {
      const candidate = new Date(start);
      candidate.setDate(start.getDate() + dayOffset);
      candidate.setHours(hour, 0, 0, 0);
      if (candidate.getTime() < start.getTime()) continue;
      if (!isCollectionTimeAllowed(asset, candidate)) continue;
      const end = new Date(candidate.getTime() + 60 * 60 * 1000);
      if (availableUnitsForRange(state, asset, candidate, end).length) {
        return candidate.toISOString();
      }
    }
  }
  return null;
}

function loanHistoryForUnit(state, unitId) {
  return state.loans
    .filter((loan) => Array.isArray(loan.unitIds) && loan.unitIds.includes(unitId))
    .map((loan) => ({
      loanId: loan.id,
      assetId: loan.assetId,
      borrowerId: loan.userId || null,
      borrowerEmail: loan.userEmail || null,
      status: loan.status,
      collectionAt: loan.collectionAt,
      collectedAt: loan.collectedAt || null,
      returnDueAt: loan.returnDueAt,
      returnedAt: loan.returnedAt || null,
      cancelledAt: loan.cancelledAt || null,
      lostAt: loan.lostAt || null,
      createdAt: loan.createdAt || null,
      updatedAt: loan.updatedAt || null,
    }))
    .sort((left, right) => new Date(right.collectionAt).getTime() - new Date(left.collectionAt).getTime());
}

function decorateAsset(state, asset, now = new Date()) {
  const units = activeUnits(asset);
  const normalUnits = units.filter((unit) => unit.condition === "normal");
  const damagedUnits = units.filter((unit) => unit.condition === "damaged");
  const lostUnits = units.filter((unit) => unit.condition === "lost");
  const physicallyPresentUnits = units.filter((unit) =>
    unit.condition !== "lost" && !isUnitOutOfPremises(state, unit.id),
  );
  const outOfPremisesUnits = units.filter((unit) => isUnitOutOfPremises(state, unit.id));
  const oneHour = new Date(new Date(now).getTime() + 60 * 60 * 1000);
  const bookableNow = asset.loanable && isCollectionTimeAllowed(asset, now) &&
    availableUnitsForRange(state, asset, new Date(now), oneHour).length > 0;

  return {
    ...asset,
    units: units.map((unit) => ({
      ...unit,
      loanHistory: loanHistoryForUnit(state, unit.id),
    })),
    loanabilityHistory: normalizeLoanabilityHistory(asset),
    quantityTotal: units.length,
    quantityNormal: normalUnits.length,
    quantityDamaged: damagedUnits.length,
    quantityLost: lostUnits.length,
    quantityPhysicallyPresent: physicallyPresentUnits.length,
    quantityOutOfPremises: outOfPremisesUnits.length,
    bookableNow,
    nextAvailableAt: bookableNow ? nowIso(now) : nextAvailability(asset, state, now),
  };
}

export function selectCatalogue(state, now = new Date()) {
  const current = migrateAssetState(state);
  return current.assets
    .filter((asset) => !asset.deletedAt)
    .map((asset) => decorateAsset(current, asset, now))
    .sort((left, right) => left.name.localeCompare(right.name));
}

export function selectInventory(state, now = new Date()) {
  return selectCatalogue(state, now)
    .map((asset) => ({
      ...asset,
      units: activeUnits(asset).filter((unit) => unit.condition !== "lost" && !isUnitOutOfPremises(migrateAssetState(state), unit.id)),
    }))
    .filter((asset) => asset.units.length);
}

function loanableStatus(asset) {
  if (asset.bookableNow) {
    return { loanStatus: "bookable_now", loanStatusLabel: "Bookable now" };
  }

  const presentNormalUnits = Math.max(0, asset.quantityNormal - asset.quantityOutOfPremises);

  if (presentNormalUnits > 0) {
    return { loanStatus: "bookable_later", loanStatusLabel: "Bookable later" };
  }

  if (asset.quantityOutOfPremises > 0) {
    return { loanStatus: "currently_out_of_premises", loanStatusLabel: "Currently out of premises" };
  }

  return { loanStatus: "not_currently_available", loanStatusLabel: "Not currently available" };
}

export function selectLoanableListings(state, now = new Date()) {
  return selectCatalogue(state, now)
    .filter((asset) => asset.loanable)
    .map((asset) => ({
      ...asset,
      ...loanableStatus(asset),
    }));
}

export function classifyLoan(loan, now = new Date()) {
  if (["returned", "cancelled", "lost"].includes(loan.status)) return "historical";
  if (loan.status === "reserved") return "future";
  if (loan.status === "collected" && new Date(loan.returnDueAt).getTime() < new Date(now).getTime()) return "overdue";
  if (loan.status === "collected") return "present";
  return "historical";
}

function decorateLoan(state, loan, now = new Date()) {
  const asset = state.assets.find((entry) => entry.id === loan.assetId);
  const unitIds = Array.isArray(loan.unitIds) ? loan.unitIds : [];
  const units = (asset?.units || []).filter((unit) => unitIds.includes(unit.id));
  const overdue = loan.status === "collected" && new Date(loan.returnDueAt).getTime() < new Date(now).getTime();
  const failureAt = asset && loan.collectedAt
    ? new Date(new Date(loan.collectedAt).getTime() + (asset.totalFailureDays || DEFAULT_FAILURE_DAYS) * 24 * 60 * 60 * 1000).toISOString()
    : null;
  const effectiveCollectionAt = loan.collectedAt || loan.collectionAt;
  const effectiveReturnAt = loan.returnedAt || loan.returnDueAt;

  return {
    ...loan,
    unitIds,
    assetName: asset?.name || "Deleted asset",
    assetPricePence: asset?.pricePence || 0,
    lateFeePence: asset?.lateFeePence || DEFAULT_LATE_FEE_PENCE,
    maxLoanDays: asset?.maxLoanDays || null,
    serials: units.map((unit) => unit.serial),
    units,
    displayState: classifyLoan(loan, now),
    overdue,
    failureAt,
    effectiveCollectionAt,
    effectiveReturnAt,
    collectedEarly: Boolean(loan.collectedEarly),
  };
}

export function selectUserLoans(state, actor, now = new Date()) {
  const current = expireMissedCollections(state, now);
  return current.loans
    .filter((loan) => actorMatchesLoan(loan, actor))
    .map((loan) => decorateLoan(current, loan, now))
    .sort((left, right) => new Date(left.collectionAt).getTime() - new Date(right.collectionAt).getTime());
}

export function selectAdminLoans(state, now = new Date()) {
  const current = expireMissedCollections(state, now);
  const loans = current.loans.map((loan) => decorateLoan(current, loan, now));
  const active = loans
    .filter((loan) => loan.status === "collected")
    .sort((left, right) => Number(right.overdue) - Number(left.overdue) || new Date(left.returnDueAt).getTime() - new Date(right.returnDueAt).getTime());
  const upcoming = loans
    .filter((loan) => loan.status === "reserved")
    .sort((left, right) => new Date(left.collectionAt).getTime() - new Date(right.collectionAt).getTime());
  return { active, upcoming, all: loans };
}

export function selectLostDamaged(state, now = new Date()) {
  const current = migrateAssetState(state);
  const entries = [];
  for (const asset of current.assets.filter((entry) => !entry.deletedAt)) {
    for (const unit of activeUnits(asset)) {
      if (unit.condition === "lost" || unit.condition === "damaged") {
        entries.push({
          assetId: asset.id,
          assetName: asset.name,
          assetLoanable: asset.loanable,
          unit,
          lastRecord: [...(unit.damageHistory || [])].reverse()[0] || null,
          nextAvailableAt: unit.condition === "damaged" ? null : nextAvailability(asset, current, now),
        });
      }
    }
  }
  return entries.sort((left, right) => left.assetName.localeCompare(right.assetName) || left.unit.serial.localeCompare(right.unit.serial));
}

function describeTransaction(state, transaction) {
  if (transaction.description) return transaction.description;

  const asset = transaction.assetId
    ? state.assets.find((entry) => entry.id === transaction.assetId)
    : null;
  const assetName = asset?.name || "asset";
  const printName = transaction.printName || transaction.fileName || transaction.filename || transaction.fileId || "3D print";

  const descriptions = {
    asset_damage: `Damage charge for ${assetName}`,
    lost_replacement: `Lost asset replacement charge for ${assetName}`,
    recovered_damage: `Recovered asset damage charge for ${assetName}`,
    damage_refund: `Damage repair refund for ${assetName}`,
    late_fee: `Late fee for ${assetName}`,
    asset_discretionary: `Discretionary return charge for ${assetName}`,
    manual_refund: "Manual refund",
    manual_surcharge: "Manual surcharge",
    print_payment: `3D print payment: ${printName}`,
    print_refund: `3D print refund: ${printName}`,
    print_filament_surcharge: `3D print filament surcharge: ${printName}`,
    print_filament_refund: `3D print filament refund: ${printName}`,
  };

  return descriptions[transaction.transactionType] || transaction.reason || "Account transaction";
}

function decorateTransaction(state, transaction) {
  return {
    ...transaction,
    description: describeTransaction(state, transaction),
  };
}

export function selectAccountTransactions(state, actor) {
  const current = migrateAssetState(state);
  return current.debts.filter((debt) =>
    (actor.userId && debt.userId === actor.userId) || (actor.userEmail && debt.userEmail === actor.userEmail),
  )
    .map((transaction) => decorateTransaction(current, transaction))
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

export function selectAccountDebts(state, actor) {
  return selectAccountTransactions(state, actor);
}

export function selectAccountBalance(state, actor) {
  return selectAccountTransactions(state, actor).reduce(
    (total, transaction) =>
      transaction.affectsBalance === false
        ? total
        : total + Math.round(Number(transaction.amountPence || 0)),
    0,
  );
}

export function defaultBookingWindow(asset, now = new Date()) {
  const current = migrateAssetState({ assets: [asset], loans: [] });
  const start = nextAvailability(asset, current, now) || nowIso(now);
  const end = new Date(new Date(start).getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  return { collectionAt: start, returnAt: end };
}
