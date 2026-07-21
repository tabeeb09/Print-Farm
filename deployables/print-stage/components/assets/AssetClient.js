import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  toFutureDatetimeLocalValue,
} from "../../lib/dateTimeLocal.js";

const adminLinks = [
  ["/admin/assets/catalogue", "Catalogue"],
  ["/admin/assets/inventory", "Inventory"],
  ["/admin/assets/loans", "Collections"],
  ["/admin/assets/gantt", "Gantt board"],
  ["/admin/assets/lost-damaged", "Lost and damaged"],
];

function formatDate(value) {
  if (!value) return "-";
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatMoney(pence) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((Number(pence) || 0) / 100);
}

function formatSignedMoney(pence) {
  const amount = Number(pence) || 0;
  const formatted = formatMoney(Math.abs(amount));
  if (amount < 0) return `-${formatted}`;
  if (amount > 0) return `+${formatted}`;
  return formatted;
}

function transactionTypeLabel(type) {
  const labels = {
    asset_charge: "Asset charge",
    asset_damage: "Damage charge",
    lost_replacement: "Lost replacement",
    recovered_damage: "Recovered damage",
    damage_refund: "Damage refund",
    late_fee: "Late fee",
    asset_discretionary: "Discretionary asset charge",
    manual_refund: "Manual refund",
    manual_surcharge: "Manual surcharge",
    print_payment: "3D print payment",
    print_refund: "3D print refund",
  };
  return labels[type] || "Transaction";
}

function serialText(loan) {
  const serials = Array.isArray(loan?.serials) ? loan.serials.filter(Boolean) : [];
  return serials.length ? serials.join(", ") : "-";
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date.toISOString();
}

function parsePounds(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value || "").trim());
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : fallback;
}

function weeklyText(availability) {
  return (availability?.weekly || [])
    .map((window) => `${window.day},${window.start},${window.end}`)
    .join("\n");
}

function rangeText(availability) {
  return (availability?.dateRanges || [])
    .map((range) => `${dateOnly(range.start)},${dateOnly(range.end)}`)
    .join("\n");
}

const dayOptions = [
  [1, "Mon"],
  [2, "Tue"],
  [3, "Wed"],
  [4, "Thu"],
  [5, "Fri"],
  [6, "Sat"],
  [0, "Sun"],
];
const MAX_RETURN_PHOTOS = 6;
const MAX_RETURN_PHOTO_DATA_URL_BYTES = 2_500_000;

function dateOnly(value) {
  if (!value) return "";
  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

function localDateOnlyFromInstant(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? dateOnly(value) : dateOnly(date);
}

function dateKeyTime(value) {
  const key = dateOnly(value);
  if (!key) return Number.NaN;
  const [year, month, day] = key.split("-").map(Number);
  return new Date(year, month - 1, day).getTime();
}

function todayKey() {
  return dateOnly(new Date());
}

function parseRangeLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [start, end] = line.split(",").map((part) => dateOnly(part.trim()) || part.trim().slice(0, 10));
      return start && end ? { start, end } : null;
    })
    .filter(Boolean);
}

function rangeLinesFromRanges(ranges) {
  return ranges
    .map((range) => `${dateOnly(range.start)},${dateOnly(range.end)}`)
    .join("\n");
}

function parseWeeklyLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [day, start, end] = line.split(",").map((part) => part.trim());
      return { day: Number.parseInt(day, 10), start: start || "09:00", end: end || "17:00" };
    })
    .filter((entry) => Number.isFinite(entry.day));
}

function weeklyLinesFromWindows(windows) {
  return windows.map((window) => `${window.day},${window.start},${window.end}`).join("\n");
}

function startOfMonth(value = new Date()) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function addMonths(value, count) {
  return new Date(value.getFullYear(), value.getMonth() + count, 1);
}

function calendarDays(month) {
  const first = startOfMonth(month);
  const start = new Date(first);
  start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    return date;
  });
}

function sameDate(left, right) {
  return dateOnly(left) === dateOnly(right);
}

function inDateSpan(day, start, end) {
  if (!start || !end) return false;
  const time = dateKeyTime(day);
  const low = Math.min(dateKeyTime(start), dateKeyTime(end));
  const high = Math.max(dateKeyTime(start), dateKeyTime(end));
  return time >= low && time <= high;
}

function dateKeyBefore(left, right) {
  return dateKeyTime(left) < dateKeyTime(right);
}

function isDateInAssetDateRanges(asset, dateKey) {
  const ranges = Array.isArray(asset?.availability?.dateRanges) ? asset.availability.dateRanges : [];
  return !ranges.length || ranges.some((range) => inDateSpan(dateKey, range.start, range.end));
}

function isDateInAssetWeeklyWindow(asset, dateKey) {
  const windows = Array.isArray(asset?.availability?.weekly) ? asset.availability.weekly : [];
  if (!windows.length) return true;
  const day = new Date(`${dateKey}T12:00:00`).getDay();
  return windows.some((window) => Number(window.day) === day);
}

function isDateBookableForAsset(asset, dateKey) {
  return isDateInAssetDateRanges(asset, dateKey) && isDateInAssetWeeklyWindow(asset, dateKey);
}

function parseBookingQuantity(value) {
  const text = String(value ?? "").trim();
  if (!/^[1-9]\d*$/.test(text)) return Number.NaN;
  return Number.parseInt(text, 10);
}

function bookingWindow(form) {
  const start = new Date(form?.collectionAt || "");
  const end = new Date(form?.returnAt || "");
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end.getTime() <= start.getTime()) {
    return null;
  }
  return { start, end };
}

function loanOverlapsWindow(loan, window) {
  if (!window || !["reserved", "collected"].includes(loan?.status)) return false;
  const start = new Date(loan.collectionAt);
  const end = new Date(loan.returnDueAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
  return window.start.getTime() < end.getTime() && window.end.getTime() > start.getTime();
}

function availableUnitsForBooking(asset, form) {
  const window = bookingWindow(form);
  return (asset?.units || []).filter((unit) =>
    unit.condition === "normal" &&
    !unit.deletedAt &&
    !(unit.loanHistory || []).some((loan) => loanOverlapsWindow(loan, window)),
  );
}

function bookingDateError(asset, form) {
  const collectionAt = new Date(form?.collectionAt || "");
  const returnAt = new Date(form?.returnAt || "");
  if (!Number.isFinite(collectionAt.getTime()) || !Number.isFinite(returnAt.getTime())) {
    return "Choose valid collection and return dates.";
  }
  if (collectionAt.getTime() < Date.now() - 60_000) {
    return "Collection date cannot be in the past.";
  }
  if (returnAt.getTime() <= collectionAt.getTime()) {
    return "Return date must be after collection date.";
  }
  if (asset && !isDateBookableForAsset(asset, dateOnly(form.collectionAt))) {
    return "Collection date is outside this asset's availability windows.";
  }
  if (asset && !isDateInAssetDateRanges(asset, dateOnly(form.returnAt))) {
    return "Return date is outside this asset's available date ranges.";
  }
  return "";
}

function bookingQuantityError(asset, form) {
  const quantity = form?.unitIds?.length || parseBookingQuantity(form?.quantity);
  const maxQuantity = availableUnitsForBooking(asset, form).length;
  if (maxQuantity < 1) return "No serials are available for the selected dates.";
  if (!Number.isInteger(quantity) || quantity < 1) return "Enter a positive whole-number quantity.";
  if (quantity > maxQuantity) return `Only ${maxQuantity} serial${maxQuantity === 1 ? "" : "s"} are available for the selected dates.`;
  return "";
}

function bookingDurationError(asset, form) {
  if (!asset?.maxLoanDays) return "";
  const collectionAt = new Date(form?.collectionAt || "");
  const returnAt = new Date(form?.returnAt || "");
  if (!Number.isFinite(collectionAt.getTime()) || !Number.isFinite(returnAt.getTime())) return "";
  const maxMs = asset.maxLoanDays * 24 * 60 * 60 * 1000;
  if (returnAt.getTime() - collectionAt.getTime() > maxMs) {
    return `This asset can only be loaned for ${asset.maxLoanDays} day${asset.maxLoanDays === 1 ? "" : "s"}.`;
  }
  return "";
}

function bookingFormError(asset, form) {
  return bookingDateError(asset, form) || bookingQuantityError(asset, form) || bookingDurationError(asset, form);
}

function returnItemsFromLoan(loan) {
  const unitsById = new Map((loan?.units || []).map((unit) => [unit.id, unit]));
  const unitIds = Array.isArray(loan?.unitIds) && loan.unitIds.length
    ? loan.unitIds
    : (loan?.units || []).map((unit) => unit.id);

  return unitIds.map((unitId, index) => ({
    unitId,
    serial: unitsById.get(unitId)?.serial || loan?.serials?.[index] || unitId,
    returned: true,
    damaged: false,
    damageDescription: "",
  }));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read image file."));
    reader.readAsDataURL(file);
  });
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Unable to read compressed image."));
    reader.readAsDataURL(blob);
  });
}

async function compressReturnPhoto(file) {
  if (!file.type.startsWith("image/")) {
    throw new Error(`${file.name} is not an image.`);
  }

  const original = await fileToDataUrl(file);
  if (original.length <= MAX_RETURN_PHOTO_DATA_URL_BYTES) {
    return { name: file.name, type: file.type, size: file.size, dataUrl: original };
  }

  if (typeof createImageBitmap !== "function") {
    throw new Error(`${file.name} is too large. Use an image smaller than 2.5 MB.`);
  }

  const bitmap = await createImageBitmap(file);
  const maxSide = 1600;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`${file.name} could not be compressed.`);
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
  if (!blob) throw new Error(`${file.name} could not be compressed.`);
  const dataUrl = await blobToDataUrl(blob);
  if (dataUrl.length > MAX_RETURN_PHOTO_DATA_URL_BYTES) {
    throw new Error(`${file.name} is still too large after compression.`);
  }
  return { name: file.name.replace(/\.[^.]+$/, ".jpg"), type: "image/jpeg", size: blob.size, dataUrl };
}

function sanitizeBookingForm(asset, nextForm) {
  const availableIds = new Set(availableUnitsForBooking(asset, nextForm).map((unit) => unit.id));
  const unitIds = (nextForm.unitIds || []).filter((unitId) => availableIds.has(unitId));
  const maxQuantity = availableIds.size;
  const requested = unitIds.length || parseBookingQuantity(nextForm.quantity) || 1;

  return {
    ...nextForm,
    unitIds,
    quantity: maxQuantity > 0 ? Math.min(Math.max(1, requested), maxQuantity) : 0,
  };
}

function datetimeWithDate(currentValue, date, fallbackTime = "09:00") {
  const time = String(currentValue || "").match(/T(\d\d:\d\d)/)?.[1] || fallbackTime;
  return `${date}T${time}`;
}

function bookingRangeText(collectionAt, returnAt) {
  const start = dateOnly(collectionAt);
  const end = dateOnly(returnAt);
  return start && end ? rangeLinesFromRanges([{ start, end }]) : "";
}

function activeBlockedRangesForAsset(asset) {
  const ranges = [];
  for (const unit of asset?.units || []) {
    for (const loan of unit.loanHistory || []) {
      if (["reserved", "collected"].includes(loan.status)) {
        ranges.push({ start: localDateOnlyFromInstant(loan.collectionAt), end: localDateOnlyFromInstant(loan.returnDueAt) });
      }
    }
  }
  return ranges.filter((range) => range.start && range.end);
}

function parseAssetForm(form) {
  const weekly = String(form.weekly || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [day, start, end] = line.split(",").map((part) => part.trim());
      return { day: Number.parseInt(day, 10), start, end };
    });
  const dateRanges = String(form.dateRanges || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [start, end] = line.split(",").map((part) => part.trim());
      const startDate = dateOnly(start);
      const endDate = dateOnly(end);
      return startDate && endDate
        ? { start: `${startDate}T00:00:00.000Z`, end: `${endDate}T23:59:59.999Z` }
        : null;
    })
    .filter(Boolean);

  return {
    name: form.name,
    description: form.description,
    loanable: form.loanable,
    quantity: Number.parseInt(form.quantity, 10) || 1,
    pricePence: parsePounds(form.price, 0),
    lateFeePence: parsePounds(form.lateFee, 500),
    totalFailureDays: Number.parseInt(form.totalFailureDays, 10) || 30,
    maxLoanDays: String(form.maxLoanDays || "").trim() ? Number.parseInt(form.maxLoanDays, 10) : null,
    availability: { weekly, dateRanges },
  };
}

function emptyAssetForm(loanable = true) {
  return {
    name: "",
    description: "",
    loanable,
    quantity: 1,
    price: "",
    lateFee: "5.00",
    totalFailureDays: 30,
    maxLoanDays: "",
    weekly: "1,09:00,17:00\n2,09:00,17:00\n3,09:00,17:00\n4,09:00,17:00\n5,09:00,17:00",
    dateRanges: "",
  };
}

function formFromAsset(asset) {
  return {
    name: asset.name || "",
    description: asset.description || "",
    loanable: Boolean(asset.loanable),
    quantity: asset.quantityTotal || asset.units?.length || 1,
    price: ((asset.pricePence || 0) / 100).toFixed(2),
    lateFee: ((asset.lateFeePence ?? 500) / 100).toFixed(2),
    totalFailureDays: asset.totalFailureDays || 30,
    maxLoanDays: asset.maxLoanDays || "",
    weekly: weeklyText(asset.availability),
    dateRanges: rangeText(asset.availability),
  };
}

function viewForMode(mode) {
  if (mode === "catalogue") return "catalogue";
  if (mode === "inventory") return "inventory";
  if (mode === "admin-loans" || mode === "admin-gantt") return "admin-loans";
  if (mode === "lost-damaged") return "lost-damaged";
  if (mode === "my-loans") return "my-loans";
  return "loanable";
}

function Modal({ title, children, onClose, error = "" }) {
  return (
    <div className="assetModalBackdrop" role="presentation">
      <section className="assetModal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="assetModalHeader">
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
        {error ? <p className="assetErrorInline" role="alert">{error}</p> : null}
        {children}
      </section>
    </div>
  );
}

function AdminNav() {
  return (
    <nav className="assetTabs" aria-label="Asset admin navigation">
      {adminLinks.map(([href, label]) => (
        <Link key={href} href={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}

function StatusBadge({ tone = "neutral", children }) {
  return <span className={`assetBadge assetBadge-${tone}`}>{children}</span>;
}

export default function AssetClient({ mode }) {
  const [payload, setPayload] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [loanTab, setLoanTab] = useState(mode === "admin-gantt" ? "timeline" : "upcoming");
  const view = viewForMode(mode);

  async function load() {
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/assets?view=${encodeURIComponent(view)}`);
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Unable to load assets.");
      setPayload(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load assets.");
    } finally {
      setPending(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  async function post(body, success) {
    setPending(true);
    setError("");
    setModalError("");
    setMessage("");
    try {
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...body, view }),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Asset action failed.");
      setPayload(next.snapshot);
      setMessage(success || "Saved.");
      setModal(null);
      return next;
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Asset action failed.";
      setError(message);
      setModalError(message);
      return null;
    } finally {
      setPending(false);
    }
  }

  function openCreate(loanable) {
    setForm(emptyAssetForm(loanable));
    setModalError("");
    setModal({ type: "asset", title: loanable ? "Add loanable asset" : "Add non-loanable asset" });
  }

  function openEdit(asset) {
    setForm(formFromAsset(asset));
    setModalError("");
    setModal({ type: "asset", title: `Edit ${asset.name}`, asset });
  }

  function openBook(asset) {
    const collectionAt = asset.nextAvailableAt || new Date().toISOString();
    const defaultLoanDays = asset.maxLoanDays || 7;
    const nextForm = {
      assetId: asset.id,
      quantity: 1,
      unitIds: [],
      collectionAt: toFutureDatetimeLocalValue(collectionAt),
      returnAt: toDatetimeLocalValue(addDays(collectionAt, defaultLoanDays)),
      acceptTerms: false,
    };
    setForm(sanitizeBookingForm(asset, nextForm));
    setModalError("");
    setModal({ type: "book", title: `Book ${asset.name}`, asset });
  }

  function openCode(type, loan) {
    const collectionAt = new Date(loan.collectionAt);
    const early = type === "collect" && collectionAt.getTime() > Date.now() + 60_000;
    setForm({
      code: "",
      loanId: loan.id,
      allowEarlyCollection: false,
      overrideCollectionAt: early ? new Date().toISOString() : "",
      returnItems: type === "return" ? returnItemsFromLoan(loan) : [],
      returnNote: "",
      returnPhotos: [],
      damageCharge: "",
      discretionaryCharge: "",
      discretionaryChargeDescription: "",
      waiveLateFee: false,
    });
    setModalError("");
    setModal({ type, title: type === "collect" ? "Verify collection code" : "Verify return code", loan });
  }

  function openDamage(asset, unitIds = []) {
    setForm({ assetId: asset.id, unitIds, damageDescription: "", chargePence: 0, chargeUserEmail: "" });
    setModal({ type: "damage", title: `Mark damaged: ${asset.name}`, asset });
  }

  function openRepair(entryOrAsset, unitIds = []) {
    const asset = entryOrAsset.assetId ? { id: entryOrAsset.assetId, name: entryOrAsset.assetName } : entryOrAsset;
    const ids = entryOrAsset.unit ? [entryOrAsset.unit.id] : unitIds;
    setForm({
      assetId: asset.id,
      unitIds: ids,
      fixDescription: "",
      repairCostPence: 0,
      applyDiscount: false,
      chargedUserId: "",
      chargedUserEmail: "",
      originalChargePence: 0,
    });
    setModal({ type: "repair", title: `Repair ${asset.name}`, asset });
  }

  function openDelete(asset, unit = null) {
    setForm({ assetId: asset.id, unitId: unit?.id || "" });
    setModal({
      type: "delete",
      title: unit ? `Delete ${unit.serial}` : `Delete ${asset.name}`,
      asset,
      unit,
    });
  }

  function openLoanDetails(loan) {
    setForm({});
    setModalError("");
    setModal({ type: "loanDetails", title: `Loan details: ${loan.assetName}`, loan });
  }

  async function submitAsset(event) {
    event.preventDefault();
    const asset = parseAssetForm(form);
    if (modal.asset) {
      await post({ action: "updateAsset", assetId: modal.asset.id, asset }, "Asset updated.");
      return;
    }
    await post({ action: "createAsset", asset }, "Asset created.");
  }

  async function submitBook(event) {
    event.preventDefault();
    const quantity = form.unitIds?.length || parseBookingQuantity(form.quantity);
    const formError = bookingFormError(modal?.asset, form);
    if (formError) {
      setModalError(formError);
      return;
    }
    const result = await post(
      {
        action: "bookLoan",
        assetId: form.assetId,
        quantity,
        unitIds: form.unitIds?.length ? form.unitIds : undefined,
        collectionAt: fromDatetimeLocalValue(form.collectionAt),
        returnAt: fromDatetimeLocalValue(form.returnAt),
        acceptTerms: form.acceptTerms,
      },
      "Booking created.",
    );
    if (result?.loan) {
      window.alert(`Collection code: ${result.loan.collectionCode}\nReturn code: ${result.loan.returnCode}`);
    }
  }

  async function submitCollect(event) {
    event.preventDefault();
    await post(
      {
        action: "verifyCollectionCode",
        loanId: form.loanId,
        code: form.code,
        allowEarlyCollection: Boolean(form.allowEarlyCollection),
        overrideCollectionAt: form.allowEarlyCollection ? new Date().toISOString() : undefined,
      },
      "Collection authorised.",
    );
  }

  async function submitReturn(event) {
    event.preventDefault();
    await post(
      {
        action: "verifyReturnCode",
        loanId: form.loanId,
        code: form.code,
        returnItems: form.returnItems || [],
        returnNote: form.returnNote,
        returnPhotos: form.returnPhotos || [],
        damagedUnitIds: (form.returnItems || []).filter((item) => item.damaged).map((item) => item.unitId),
        damageDescription: form.damageDescription,
        damageChargePence: parsePounds(form.damageCharge, 0),
        discretionaryChargePence: parsePounds(form.discretionaryCharge, 0),
        discretionaryChargeDescription: form.discretionaryChargeDescription,
        waiveLateFee: Boolean(form.waiveLateFee),
      },
      "Return recorded.",
    );
  }

  async function addReturnPhotos(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setModalError("");
    try {
      const remainingSlots = Math.max(0, MAX_RETURN_PHOTOS - (form.returnPhotos || []).length);
      if (remainingSlots < 1) {
        throw new Error(`Only ${MAX_RETURN_PHOTOS} return photos can be uploaded.`);
      }
      const photos = [];
      for (const file of files.slice(0, remainingSlots)) {
        photos.push(await compressReturnPhoto(file));
      }
      setForm({ ...form, returnPhotos: [...(form.returnPhotos || []), ...photos] });
    } catch (caught) {
      setModalError(caught instanceof Error ? caught.message : "Unable to attach return photos.");
    }
  }

  async function submitDamage(event) {
    event.preventDefault();
    await post(
      {
        action: "adminDamageUnits",
        assetId: form.assetId,
        unitIds: form.unitIds,
        damageDescription: form.damageDescription,
        chargePence: parsePounds(form.charge, 0),
        chargeUserEmail: form.chargeUserEmail,
      },
      "Damage recorded.",
    );
  }

  async function submitRepair(event) {
    event.preventDefault();
    await post(
      {
        action: "repairUnits",
        assetId: form.assetId,
        unitIds: form.unitIds,
        fixDescription: form.fixDescription,
        repairCostPence: parsePounds(form.repairCost, 0),
        applyDiscount: Boolean(form.applyDiscount),
        chargedUserId: form.chargedUserId,
        chargedUserEmail: form.chargedUserEmail,
        originalChargePence: parsePounds(form.originalCharge, 0),
      },
      "Repair recorded.",
    );
  }

  const groupedLoans = useMemo(() => {
    const groups = { future: [], present: [], overdue: [], historical: [] };
    const loans = Array.isArray(payload?.loans) ? payload.loans : [];
    for (const loan of loans) {
      groups[loan.displayState || "historical"].push(loan);
    }
    return groups;
  }, [payload]);
  const bookingAvailableUnits = modal?.type === "book" ? availableUnitsForBooking(modal.asset, form) : [];
  const bookingAvailableUnitIds = new Set(bookingAvailableUnits.map((unit) => unit.id));
  const currentBookingDateError = modal?.type === "book" ? bookingDateError(modal.asset, form) : "";
  const currentBookingError = modal?.type === "book" ? bookingFormError(modal.asset, form) : "";
  const returnItems = modal?.type === "return" ? (form.returnItems || []) : [];
  const returnReadyError = modal?.type === "return" && returnItems.some((item) => !item.returned)
    ? "All loaned serials must be marked returned before the loan can be closed."
    : "";

  return (
    <div className="assetPage">
      {mode.startsWith("admin") || ["catalogue", "inventory", "lost-damaged"].includes(mode) ? <AdminNav /> : null}

      {error ? <section className="panel assetError">{error}</section> : null}
      {message ? <section className="panel assetMessage">{message}</section> : null}
      {pending ? <p className="assetMuted">Working...</p> : null}

      {mode === "catalogue" ? (
        <CatalogueView
          assets={payload?.catalogue || []}
          onCreate={openCreate}
          onEdit={openEdit}
          onDelete={openDelete}
          onLoanable={(asset, loanable) =>
            post({ action: "setAssetLoanable", assetId: asset.id, loanable }, loanable ? "Asset made loanable." : "Asset made non-loanable.")
          }
          onDamage={openDamage}
        />
      ) : null}

      {mode === "inventory" ? (
        <InventoryView assets={payload?.inventory || []} onDamage={openDamage} onRepair={openRepair} onDelete={openDelete} />
      ) : null}

      {mode === "admin-loans" || mode === "admin-gantt" ? (
        <AdminLoansView
          loans={payload?.loans || { active: [], upcoming: [] }}
          tab={loanTab}
          onTab={setLoanTab}
          onCollect={(loan) => openCode("collect", loan)}
          onReturn={(loan) => openCode("return", loan)}
          onDetails={openLoanDetails}
        />
      ) : null}

      {mode === "lost-damaged" ? (
        <LostDamagedView
          entries={payload?.entries || []}
          onRepair={openRepair}
          onRecover={(entry, damaged) =>
            post(
              {
                action: "recoverLostUnits",
                assetId: entry.assetId,
                unitIds: [entry.unit.id],
                damaged,
                damageDescription: damaged ? "Recovered and marked damaged." : "Recovered.",
              },
              damaged ? "Recovered as damaged." : "Recovered.",
            )
          }
        />
      ) : null}

      {mode === "loanable" ? <LoanableView listings={payload?.listings || []} onBook={openBook} /> : null}

      {mode === "my-loans" ? (
        <MyLoansView
          groups={groupedLoans}
          debts={payload?.debts || []}
          transactions={payload?.transactions || payload?.debts || []}
          balancePence={payload?.balancePence || 0}
          onReschedule={(loan) => {
            setForm({
              loanId: loan.id,
              collectionAt: toDatetimeLocalValue(loan.collectionAt),
              returnAt: toDatetimeLocalValue(loan.returnDueAt),
            });
            setModal({ type: "reschedule", title: `Edit booking: ${loan.assetName}`, loan });
          }}
          onExtend={(loan) => {
            setForm({ loanId: loan.id, returnAt: toDatetimeLocalValue(loan.returnDueAt) });
            setModal({ type: "extend", title: `Update return: ${loan.assetName}`, loan });
          }}
          onLost={(loan) => post({ action: "markLoanLost", loanId: loan.id }, "Loan marked lost and account charge added.")}
        />
      ) : null}

      {modal?.type === "asset" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <AssetForm form={form} setForm={setForm} onSubmit={submitAsset} pending={pending} />
        </Modal>
      ) : null}

      {modal?.type === "loanDetails" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <LoanDetails loan={modal.loan} />
        </Modal>
      ) : null}

      {modal?.type === "book" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={submitBook}>
            <label>
              Quantity
              <select
                value={String(form.quantity || 0)}
                disabled={!bookingAvailableUnits.length || Boolean(currentBookingDateError)}
                onChange={(event) => setForm(sanitizeBookingForm(modal.asset, { ...form, quantity: event.target.value, unitIds: [] }))}
              >
                {bookingAvailableUnits.length ? Array.from({ length: bookingAvailableUnits.length }, (_, index) => (
                  <option key={index + 1} value={index + 1}>{index + 1}</option>
                )) : (
                  <option value="0">None available</option>
                )}
              </select>
            </label>
            <p className="assetMuted">
              Available for selected dates: {bookingAvailableUnits.length} / {modal.asset.quantityNormal || 0} normal serials.
            </p>
            {currentBookingError ? <p className="assetErrorInline">{currentBookingError}</p> : null}
            <DateRangeCalendar
              label="Booking range"
              value={bookingRangeText(form.collectionAt, form.returnAt)}
              blockedRanges={activeBlockedRangesForAsset(modal.asset)}
              availabilityAsset={modal.asset}
              replaceOnSelect
              onChange={(rangeValue) => {
                const [range] = parseRangeLines(rangeValue);
                if (range) {
                  setForm(sanitizeBookingForm(modal.asset, {
                    ...form,
                    collectionAt: datetimeWithDate(form.collectionAt, range.start, "09:00"),
                    returnAt: datetimeWithDate(form.returnAt, range.end, "17:00"),
                  }));
                }
              }}
            />
            <label>
              Collection date and time
              <input
                type="datetime-local"
                value={form.collectionAt}
                onChange={(event) => setForm(sanitizeBookingForm(modal.asset, { ...form, collectionAt: event.target.value }))}
                required
              />
            </label>
            <label>
              Return date and time
              <input
                type="datetime-local"
                value={form.returnAt}
                onChange={(event) => setForm(sanitizeBookingForm(modal.asset, { ...form, returnAt: event.target.value }))}
                required
              />
            </label>
            <fieldset className="assetFieldset">
              <legend>Serial numbers, optional</legend>
              <p className="assetMuted">Unavailable serials are locked for the selected dates. Leave blank to let the backend pick the first free serials.</p>
              {(modal.asset.units || []).filter((unit) => unit.condition === "normal" && !unit.deletedAt).map((unit) => {
                const checked = (form.unitIds || []).includes(unit.id);
                const available = !currentBookingDateError && bookingAvailableUnitIds.has(unit.id);
                return (
                  <label key={unit.id} className="assetCheckbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={!available}
                      onChange={(event) => {
                        const current = new Set(form.unitIds || []);
                        if (event.target.checked) current.add(unit.id);
                        else current.delete(unit.id);
                        setForm(sanitizeBookingForm(modal.asset, {
                          ...form,
                          unitIds: Array.from(current),
                          quantity: current.size || parseBookingQuantity(form.quantity) || 1,
                        }));
                      }}
                    />
                    <span>{unit.serial}{available ? "" : " (booked for selected dates)"}</span>
                  </label>
                );
              })}
            </fieldset>
            <label className="assetCheckbox">
              <input type="checkbox" checked={Boolean(form.acceptTerms)} onChange={(event) => setForm({ ...form, acceptTerms: event.target.checked })} />
              <span>
                I accept the <Link href="/assets/terms">loan terms and liability agreement</Link>.
              </span>
            </label>
            <button type="submit" disabled={pending || Boolean(currentBookingError)}>
              Book asset
            </button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "collect" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={submitCollect}>
            <p>Enter the borrower collection code for {modal.loan.assetName}.</p>
            {new Date(modal.loan.collectionAt).getTime() > Date.now() + 60_000 ? (
              <fieldset className="assetFieldset">
                <legend>Early collection</legend>
                <p className="assetMuted">
                  This loan is booked for {formatDate(modal.loan.collectionAt)}. Actual collection now is {formatDate(new Date())}.
                  If no other booking conflicts, the backend will move the loan start to now and recalculate the return date.
                </p>
                <label className="assetCheckbox">
                  <input
                    type="checkbox"
                    checked={Boolean(form.allowEarlyCollection)}
                    onChange={(event) => setForm({ ...form, allowEarlyCollection: event.target.checked })}
                  />
                  <span>Override collection date to now</span>
                </label>
              </fieldset>
            ) : null}
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
            <button type="submit" disabled={pending}>
              Authorise collection
            </button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "return" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={submitReturn}>
            <p>Enter the borrower return code for {modal.loan.assetName}.</p>
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
            <fieldset className="assetFieldset">
              <legend>Returned serials</legend>
              <div className="returnSerialGrid">
                {returnItems.map((item, index) => (
                  <div key={item.unitId} className="returnSerialRow">
                    <strong>{item.serial}</strong>
                    <label className="assetCheckbox">
                      <input
                        type="checkbox"
                        checked={item.returned !== false}
                        onChange={(event) => {
                          const next = returnItems.map((entry, itemIndex) =>
                            itemIndex === index ? { ...entry, returned: event.target.checked } : entry,
                          );
                          setForm({ ...form, returnItems: next });
                        }}
                      />
                      <span>Returned</span>
                    </label>
                    <label className="assetCheckbox">
                      <input
                        type="checkbox"
                        checked={Boolean(item.damaged)}
                        onChange={(event) => {
                          const next = returnItems.map((entry, itemIndex) =>
                            itemIndex === index ? { ...entry, damaged: event.target.checked } : entry,
                          );
                          setForm({ ...form, returnItems: next });
                        }}
                      />
                      <span>Damaged</span>
                    </label>
                    {item.damaged ? (
                      <textarea
                        value={item.damageDescription || ""}
                        onChange={(event) => {
                          const next = returnItems.map((entry, itemIndex) =>
                            itemIndex === index ? { ...entry, damageDescription: event.target.value } : entry,
                          );
                          setForm({ ...form, returnItems: next });
                        }}
                        placeholder="Damage note for this serial"
                      />
                    ) : null}
                  </div>
                ))}
              </div>
            </fieldset>
            {returnReadyError ? <p className="assetErrorInline">{returnReadyError}</p> : null}
            <label>
              Return note
              <textarea value={form.returnNote || ""} onChange={(event) => setForm({ ...form, returnNote: event.target.value })} placeholder="Condition, accessories returned, handover notes..." />
            </label>
            <label>
              Damage charge, GBP. Leave blank or zero for no damage charge.
              <input value={form.damageCharge || ""} onChange={(event) => setForm({ ...form, damageCharge: event.target.value })} placeholder="0.00" />
            </label>
            <label>
              Discretionary charge, GBP
              <input value={form.discretionaryCharge || ""} onChange={(event) => setForm({ ...form, discretionaryCharge: event.target.value })} placeholder="0.00" />
            </label>
            <label>
              Discretionary charge description
              <textarea value={form.discretionaryChargeDescription || ""} onChange={(event) => setForm({ ...form, discretionaryChargeDescription: event.target.value })} placeholder="Missing accessories, cleaning charge, consumables, etc." />
            </label>
            <label className="assetCheckbox">
              <input type="checkbox" checked={Boolean(form.waiveLateFee)} onChange={(event) => setForm({ ...form, waiveLateFee: event.target.checked })} />
              <span>Waive late fee for this return</span>
            </label>
            <label>
              Return photos
              <input type="file" accept="image/*" multiple onChange={(event) => addReturnPhotos(event.target.files)} />
            </label>
            {form.returnPhotos?.length ? (
              <div className="returnPhotoGrid">
                {form.returnPhotos.map((photo, index) => (
                  <figure key={`${photo.name}-${index}`} className="returnPhotoThumb">
                    <img src={photo.dataUrl} alt={photo.name || `Return photo ${index + 1}`} />
                    <figcaption>{photo.name}</figcaption>
                    <button
                      type="button"
                      className="assetDanger"
                      onClick={() => setForm({ ...form, returnPhotos: form.returnPhotos.filter((_, photoIndex) => photoIndex !== index) })}
                    >
                      Remove
                    </button>
                  </figure>
                ))}
              </div>
            ) : null}
            <button type="submit" disabled={pending || Boolean(returnReadyError)}>
              Record return
            </button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "damage" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={submitDamage}>
            <label>
              Damage description
              <textarea value={form.damageDescription || ""} onChange={(event) => setForm({ ...form, damageDescription: event.target.value })} required />
            </label>
            <label>
              Charge, GBP. Leave blank or zero for no charge.
              <input value={form.charge || ""} onChange={(event) => setForm({ ...form, charge: event.target.value })} placeholder="0.00" />
            </label>
            <label>
              Account email to charge, optional
              <input value={form.chargeUserEmail || ""} onChange={(event) => setForm({ ...form, chargeUserEmail: event.target.value })} placeholder="person@example.com" />
            </label>
            <button type="submit" disabled={pending}>
              Mark damaged
            </button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "repair" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={submitRepair}>
            <label>
              Fix description
              <textarea value={form.fixDescription || ""} onChange={(event) => setForm({ ...form, fixDescription: event.target.value })} required />
            </label>
            <label>
              Repair cost, GBP
              <input value={form.repairCost || ""} onChange={(event) => setForm({ ...form, repairCost: event.target.value })} placeholder="0.00" />
            </label>
            <label className="assetCheckbox">
              <input type="checkbox" checked={Boolean(form.applyDiscount)} onChange={(event) => setForm({ ...form, applyDiscount: event.target.checked })} />
              <span>Apply discount if applicable</span>
            </label>
            {form.applyDiscount ? (
              <>
                <label>
                  Original charge, GBP
                  <input value={form.originalCharge || ""} onChange={(event) => setForm({ ...form, originalCharge: event.target.value })} placeholder="0.00" />
                </label>
                <label>
                  Charged user id
                  <input value={form.chargedUserId || ""} onChange={(event) => setForm({ ...form, chargedUserId: event.target.value })} />
                </label>
                <label>
                  Charged user email
                  <input value={form.chargedUserEmail || ""} onChange={(event) => setForm({ ...form, chargedUserEmail: event.target.value })} />
                </label>
              </>
            ) : null}
            <button type="submit" disabled={pending}>
              Mark repaired
            </button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "delete" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <div className="assetForm">
            <p>
              Permanently remove {modal.unit ? modal.unit.serial : modal.asset.name}
              {modal.unit ? "" : `, quantity ${modal.asset.quantityTotal}, serials ${(modal.asset.units || []).map((unit) => unit.serial).join(", ")}`}?
            </p>
            <button
              type="button"
              className="assetDanger"
              disabled={pending}
              onClick={() =>
                modal.unit
                  ? post({ action: "deleteUnit", assetId: modal.asset.id, unitId: modal.unit.id }, "Serial removed.")
                  : post({ action: "deleteAsset", assetId: modal.asset.id }, "Asset removed.")
              }
            >
              Yes, delete
            </button>
            <button type="button" onClick={() => setModal(null)}>
              Cancel
            </button>
          </div>
        </Modal>
      ) : null}

      {modal?.type === "reschedule" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={(event) => {
            event.preventDefault();
            post({
              action: "rescheduleLoan",
              loanId: form.loanId,
              collectionAt: fromDatetimeLocalValue(form.collectionAt),
              returnAt: fromDatetimeLocalValue(form.returnAt),
            }, "Booking updated.");
          }}>
            <DateRangeCalendar
              label="Booking range"
              value={bookingRangeText(form.collectionAt, form.returnAt)}
              replaceOnSelect
              onChange={(rangeValue) => {
                const [range] = parseRangeLines(rangeValue);
                if (range) {
                  setForm({
                    ...form,
                    collectionAt: datetimeWithDate(form.collectionAt, range.start, "09:00"),
                    returnAt: datetimeWithDate(form.returnAt, range.end, "17:00"),
                  });
                }
              }}
            />
            <label>
              Collection date
              <input type="datetime-local" value={form.collectionAt} onChange={(event) => setForm({ ...form, collectionAt: event.target.value })} required />
            </label>
            <label>
              Return date
              <input type="datetime-local" value={form.returnAt} onChange={(event) => setForm({ ...form, returnAt: event.target.value })} required />
            </label>
            <button type="submit" disabled={pending}>
              Update booking
            </button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "extend" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={(event) => {
            event.preventDefault();
            post({ action: "extendLoan", loanId: form.loanId, returnAt: fromDatetimeLocalValue(form.returnAt) }, "Return date updated.");
          }}>
            <label>
              Return date
              <input type="datetime-local" value={form.returnAt} onChange={(event) => setForm({ ...form, returnAt: event.target.value })} required />
            </label>
            <button type="submit" disabled={pending}>
              Update return date
            </button>
          </form>
        </Modal>
      ) : null}
    </div>
  );
}

function AssetForm({ form, setForm, onSubmit, pending }) {
  return (
    <form className="assetForm" onSubmit={onSubmit}>
      <label>
        Asset name
        <input value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </label>
      <label>
        Description
        <textarea value={form.description || ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </label>
      <label className="assetCheckbox">
        <input type="checkbox" checked={Boolean(form.loanable)} onChange={(event) => setForm({ ...form, loanable: event.target.checked })} />
        <span>Available to loan</span>
      </label>
      <label>
        Quantity available
        <input type="number" min="1" value={form.quantity || 1} onChange={(event) => setForm({ ...form, quantity: event.target.value })} required />
      </label>
      {form.loanable ? (
        <>
          <label>
            Asset price, GBP
            <input value={form.price || ""} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="25.00" />
          </label>
          <label>
            Late fee, GBP
            <input value={form.lateFee || "5.00"} onChange={(event) => setForm({ ...form, lateFee: event.target.value })} />
          </label>
          <label>
            Total failure to return after days
            <input type="number" min="1" value={form.totalFailureDays || 30} onChange={(event) => setForm({ ...form, totalFailureDays: event.target.value })} />
          </label>
          <label>
            Maximum loan duration in days, optional
            <input type="number" min="1" value={form.maxLoanDays || ""} onChange={(event) => setForm({ ...form, maxLoanDays: event.target.value })} placeholder="Blank for no fixed maximum" />
          </label>
          <WeeklyAvailabilityEditor form={form} setForm={setForm} />
          <DateRangeCalendar
            label="Optional available date ranges. Blank means indefinite."
            value={form.dateRanges || ""}
            weeklyValue={form.weekly || ""}
            onChange={(dateRanges) => setForm({ ...form, dateRanges })}
          />
        </>
      ) : null}
      <button type="submit" disabled={pending}>
        Save asset
      </button>
    </form>
  );
}

function WeeklyAvailabilityEditor({ form, setForm }) {
  const windows = parseWeeklyLines(form.weekly);
  const first = windows[0] || { start: "09:00", end: "17:00" };
  const selected = new Set(windows.map((entry) => entry.day));

  function toggle(day) {
    const next = selected.has(day)
      ? windows.filter((entry) => entry.day !== day)
      : [...windows, { day, start: first.start, end: first.end }];
    setForm({ ...form, weekly: weeklyLinesFromWindows(next.sort((a, b) => a.day - b.day)) });
  }

  function updateTimes(field, value) {
    const next = windows.map((entry) => ({ ...entry, [field]: value }));
    setForm({ ...form, weekly: weeklyLinesFromWindows(next) });
  }

  return (
    <fieldset className="assetFieldset">
      <legend>Weekly collection windows</legend>
      <div className="dayChipRow">
        {dayOptions.map(([day, label]) => (
          <button key={day} type="button" className={selected.has(day) ? "dayChip dayChipActive" : "dayChip"} onClick={() => toggle(day)}>
            {label}
          </button>
        ))}
      </div>
      <div className="assetInlineFields">
        <label>Start<input type="time" value={first.start} onChange={(event) => updateTimes("start", event.target.value)} /></label>
        <label>End<input type="time" value={first.end} onChange={(event) => updateTimes("end", event.target.value)} /></label>
      </div>
      <p className="assetMuted">Selected days use the shown collection time range.</p>
    </fieldset>
  );
}

function DateRangeCalendar({ label, value, onChange, blockedRanges = [], replaceOnSelect = false, weeklyValue = "", availabilityAsset = null }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [start, setStart] = useState(null);
  const [hover, setHover] = useState(null);
  const ranges = parseRangeLines(value);
  const displayRanges = replaceOnSelect && start ? [] : ranges;
  const weeklyDays = new Set(parseWeeklyLines(weeklyValue).map((entry) => entry.day));
  const days = calendarDays(month);
  const minDate = todayKey();

  function commit(day) {
    const picked = dateOnly(day);
    if (dateKeyBefore(picked, minDate)) return;
    if (!start) {
      setStart(picked);
      setHover(picked);
      return;
    }
    const next = [start, picked].sort();
    const proposed = { start: next[0], end: next[1] };
    if (replaceOnSelect) {
      onChange(rangeLinesFromRanges([proposed]));
      setStart(null);
      setHover(null);
      return;
    }
    const intersects = ranges.some((range) =>
      dateKeyTime(proposed.start) <= dateKeyTime(range.end) &&
      dateKeyTime(proposed.end) >= dateKeyTime(range.start)
    );
    if (!intersects) onChange(rangeLinesFromRanges([...ranges, proposed]));
    setStart(null);
    setHover(null);
  }

  function remove(index) {
    onChange(rangeLinesFromRanges(ranges.filter((_, itemIndex) => itemIndex !== index)));
  }

  return (
    <fieldset className="assetFieldset">
      <legend>{label}</legend>
      <div className="calendarHeader">
        <button type="button" onClick={() => setMonth(addMonths(month, -1))}>Previous</button>
        <strong>{month.toLocaleDateString("en-GB", { month: "long", year: "numeric" })}</strong>
        <button type="button" onClick={() => setMonth(addMonths(month, 1))}>Next</button>
      </div>
      <div className="rangeCalendar">
        {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => <span key={`${day}-${index}`} className="calendarDow">{day}</span>)}
        {days.map((day) => {
          const current = dateOnly(day);
          const selected = displayRanges.some((range) => inDateSpan(day, range.start, range.end));
          const preview = start && hover && inDateSpan(day, start, hover);
          const anchor = start && sameDate(day, start);
          const blocked = blockedRanges.some((range) => inDateSpan(day, range.start, range.end));
          const past = dateKeyBefore(current, minDate);
          const weekly = weeklyDays.has(day.getDay());
          const unavailable = availabilityAsset ? !isDateBookableForAsset(availabilityAsset, current) : false;
          return (
            <button
              key={current}
              type="button"
              className={`calendarDay ${day.getMonth() !== month.getMonth() ? "calendarFaded" : ""} ${weekly ? "calendarWeekly" : ""} ${selected ? "calendarSelected" : ""} ${preview ? "calendarPreview" : ""} ${anchor ? "calendarAnchor" : ""} ${blocked ? "calendarBooked" : ""} ${unavailable ? "calendarUnavailable" : ""} ${past ? "calendarPast" : ""}`}
              data-date={current}
              aria-pressed={selected || preview || anchor}
              onMouseEnter={() => setHover(current)}
              onFocus={() => setHover(current)}
              onClick={() => !blocked && !past && !unavailable && commit(day)}
              disabled={blocked || past || unavailable}
            >
              {day.getDate()}
            </button>
          );
        })}
      </div>
      <div className="rangePills">
        {ranges.map((range, index) => (
          <button type="button" key={`${range.start}-${range.end}`} onClick={() => remove(index)}>
            {range.start} to {range.end} x
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function CatalogueView({ assets, onCreate, onEdit, onDelete, onLoanable, onDamage }) {
  return (
    <section className="panel assetStack">
      <div className="assetHeaderRow">
        <div>
          <h1>Item catalogue</h1>
          <p>All assets appear here regardless of loan status. Loanable defaults are retained when loaning is disabled.</p>
        </div>
        <div className="assetButtonRow">
          <button type="button" onClick={() => onCreate(true)}>Add loanable asset</button>
          <button type="button" onClick={() => onCreate(false)}>Add non-loanable asset</button>
        </div>
      </div>
      <AssetList assets={assets} onEdit={onEdit} onDelete={onDelete} onLoanable={onLoanable} onDamage={onDamage} />
    </section>
  );
}

function AssetList({ assets, onEdit, onDelete, onLoanable, onDamage }) {
  if (!assets.length) return <p className="assetMuted">No assets have been added yet.</p>;
  return (
    <div className="assetCards">
      {assets.map((asset) => (
        <article key={asset.id} className="assetCard">
          <div className="assetHeaderRow">
            <div>
              <h2>{asset.name}</h2>
              <p>{asset.description || "No description."}</p>
            </div>
            <StatusBadge tone={asset.loanable ? "green" : "neutral"}>{asset.loanable ? "Loanable" : "Non-loanable"}</StatusBadge>
          </div>
          <div className="assetStats">
            <span>Total: {asset.quantityTotal}</span>
            <span>Normal: {asset.quantityNormal}</span>
            <span>Damaged: {asset.quantityDamaged}</span>
            <span>Lost: {asset.quantityLost}</span>
            <span>Price: {formatMoney(asset.pricePence)}</span>
            <span>Late fee: {formatMoney(asset.lateFeePence)}</span>
            <span>Max loan: {asset.maxLoanDays ? `${asset.maxLoanDays} days` : "No fixed max"}</span>
          </div>
          <div className="assetButtonRow">
            <button type="button" onClick={() => onEdit(asset)}>Edit details</button>
            {asset.loanable ? (
              <button type="button" onClick={() => onLoanable(asset, false)}>Make non-loanable</button>
            ) : (
              <button type="button" onClick={() => onLoanable(asset, true)}>Make loanable</button>
            )}
            <button type="button" className="assetDanger" onClick={() => onDelete(asset)}>Delete item</button>
          </div>
          <details>
            <summary>Serial numbers and unit history</summary>
            <div className="assetUnitList">
              {(asset.units || []).filter((unit) => !unit.deletedAt).map((unit) => (
                <div key={unit.id} className="assetUnitRow">
                  <span><input type="checkbox" readOnly /> {unit.serial}</span>
                  <StatusBadge tone={unit.condition === "normal" ? "green" : unit.condition === "damaged" ? "amber" : "red"}>{unit.condition}</StatusBadge>
                  <button type="button" onClick={() => onDamage(asset, [unit.id])}>Mark damaged</button>
                  <button type="button" className="assetDanger" onClick={() => onDelete(asset, unit)}>Dustbin</button>
                </div>
              ))}
            </div>
          </details>
        </article>
      ))}
    </div>
  );
}

function LoanabilityHistory({ history = [] }) {
  const periods = Array.isArray(history) ? history.filter((entry) => entry.loanable !== false) : [];
  if (!periods.length) return <p className="assetMuted">No recorded loanable periods.</p>;

  return (
    <ul className="assetHistoryList">
      {periods.map((entry) => (
        <li key={entry.id || `${entry.startAt}-${entry.endAt || "open"}`}>
          Loanable from {formatDate(entry.startAt)} to {entry.endAt ? formatDate(entry.endAt) : "now"}
        </li>
      ))}
    </ul>
  );
}

function UnitLoanHistory({ history = [] }) {
  if (!history.length) return <p className="assetMuted">No loans recorded for this serial.</p>;

  return (
    <ul className="assetHistoryList">
      {history.map((entry) => (
        <li key={entry.loanId}>
          {entry.status}: {formatDate(entry.collectionAt)} to {formatDate(entry.returnDueAt)}
          {entry.borrowerEmail ? `, ${entry.borrowerEmail}` : ""}
          {entry.returnedAt ? `, returned ${formatDate(entry.returnedAt)}` : ""}
          {entry.lostAt ? `, lost ${formatDate(entry.lostAt)}` : ""}
        </li>
      ))}
    </ul>
  );
}

function InventoryView({ assets, onDamage, onRepair, onDelete }) {
  return (
    <section className="panel assetStack">
      <h1>Inventory</h1>
      <p>Only units physically at the makerspace are listed here. Collected loans are removed until returned.</p>
      <div className="assetCards">
        {assets.map((asset) => (
          <article key={asset.id} className="assetCard">
            <div className="assetHeaderRow">
              <div>
                <h2>{asset.name}</h2>
                <p>{asset.description || "No description."}</p>
              </div>
              <StatusBadge tone={asset.loanable ? "green" : "neutral"}>{asset.loanable ? "Loanable" : "Non-loanable"}</StatusBadge>
            </div>
            <div className="assetStats">
              <span>Physically present: {asset.quantityPhysicallyPresent}</span>
              <span>Damaged: {asset.quantityDamaged}</span>
              <span>Out of premises: {asset.quantityOutOfPremises}</span>
            </div>
            <details>
              <summary>Loanable periods</summary>
              <LoanabilityHistory history={asset.loanabilityHistory || []} />
            </details>
            <details>
              <summary>Serial numbers ({asset.units?.length || 0})</summary>
              <div className="assetUnitList">
                {(asset.units || []).map((unit) => (
                  <div key={unit.id} className="assetUnitRow">
                    <span><input type="checkbox" readOnly /> {unit.serial}</span>
                    <StatusBadge tone={unit.condition === "normal" ? "green" : "amber"}>{unit.condition}</StatusBadge>
                    {unit.condition === "damaged" ? (
                      <button type="button" onClick={() => onRepair(asset, [unit.id])}>Repaired</button>
                    ) : (
                      <button type="button" onClick={() => onDamage(asset, [unit.id])}>Mark damaged</button>
                    )}
                    <button type="button" className="assetDanger" onClick={() => onDelete(asset, unit)}>Dustbin</button>
                    <details className="assetUnitHistory">
                      <summary>Loan history</summary>
                      <UnitLoanHistory history={unit.loanHistory || []} />
                    </details>
                  </div>
                ))}
              </div>
            </details>
          </article>
        ))}
      </div>
      {!assets.length ? <p className="assetMuted">No assets are currently physically present.</p> : null}
    </section>
  );
}

function loanReturnRows(loan) {
  const unitsById = new Map((loan?.units || []).map((unit) => [unit.id, unit]));
  const items = Array.isArray(loan?.returnItems) && loan.returnItems.length
    ? loan.returnItems
    : (loan?.unitIds || []).map((unitId) => ({ unitId, returned: loan.status === "returned", damaged: false }));

  return items.map((item, index) => ({
    ...item,
    serial: unitsById.get(item.unitId)?.serial || loan?.serials?.[index] || item.unitId,
  }));
}

function LoanDetails({ loan }) {
  const returnRows = loanReturnRows(loan);
  return (
    <div className="assetStack">
      <div className="assetStats">
        <span>Status: {loan.status}</span>
        <span>Borrower: {loan.userEmail || loan.userId || "-"}</span>
        <span>Collection: {formatDate(loan.effectiveCollectionAt || loan.collectionAt)}</span>
        <span>Return: {formatDate(loan.effectiveReturnAt || loan.returnDueAt)}</span>
        <span>Collection code: {loan.collectionCode || "-"}</span>
        <span>Return code: {loan.returnCode || "-"}</span>
      </div>
      {loan.collectedEarly ? <StatusBadge tone="amber">Collected early</StatusBadge> : null}
      {loan.overdue ? <StatusBadge tone="red">Overdue</StatusBadge> : null}
      <table className="assetTable">
        <thead>
          <tr>
            <th>Serial</th>
            <th>Returned</th>
            <th>Damaged</th>
            <th>Damage note</th>
          </tr>
        </thead>
        <tbody>
          {returnRows.map((item) => (
            <tr key={item.unitId}>
              <td>{item.serial}</td>
              <td>{item.returned === false ? "No" : "Yes"}</td>
              <td>{item.damaged ? "Yes" : "No"}</td>
              <td>{item.damageDescription || "-"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="assetStats">
        <span>Late fee: {formatMoney(loan.lateFeePence || 0)}</span>
        <span>Late fee waived: {loan.lateFeeWaived ? "Yes" : "No"}</span>
        <span>Damage charge: {formatMoney(loan.damageChargePence || 0)}</span>
        <span>Discretionary charge: {formatMoney(loan.discretionaryChargePence || 0)}</span>
      </div>
      {loan.discretionaryChargeDescription ? <p>{loan.discretionaryChargeDescription}</p> : null}
      {loan.returnNote ? <p>Return note: {loan.returnNote}</p> : null}
      {loan.returnPhotos?.length ? (
        <div className="returnPhotoGrid">
          {loan.returnPhotos.map((photo, index) => (
            <figure key={photo.id || `${photo.name}-${index}`} className="returnPhotoThumb">
              <img src={photo.dataUrl} alt={photo.name || `Return photo ${index + 1}`} />
              <figcaption>{photo.name || `Return photo ${index + 1}`}</figcaption>
            </figure>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function LoanGantt({ loans = [], onSelect }) {
  const visible = loans.filter((loan) => ["reserved", "collected", "returned"].includes(loan.status));
  if (!visible.length) return <p className="assetMuted">No active or upcoming loans to chart.</p>;

  const starts = visible.map((loan) => new Date(loan.effectiveCollectionAt || loan.collectionAt).getTime()).filter(Number.isFinite);
  const ends = visible.map((loan) => new Date(loan.effectiveReturnAt || loan.returnDueAt).getTime()).filter(Number.isFinite);
  const min = Math.min(...starts, Date.now());
  const max = Math.max(...ends, min + 7 * 24 * 60 * 60 * 1000);
  const span = Math.max(1, max - min);
  const dayCount = Math.min(45, Math.max(7, Math.ceil(span / (24 * 60 * 60 * 1000))));
  const ticks = Array.from({ length: dayCount + 1 }, (_, index) => {
    const date = new Date(min + index * 24 * 60 * 60 * 1000);
    return date.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  });

  return (
    <div className="loanGantt">
      <div className="loanGanttScale">
        {ticks.map((tick) => <span key={tick}>{tick}</span>)}
      </div>
      {visible.map((loan) => {
        const start = new Date(loan.effectiveCollectionAt || loan.collectionAt);
        const end = new Date(loan.effectiveReturnAt || loan.returnDueAt);
        const left = Math.max(0, ((start.getTime() - min) / span) * 100);
        const width = Math.max(2, ((end.getTime() - start.getTime()) / span) * 100);
        const tone = loan.status === "returned" ? "loanGanttReturned" : loan.status === "collected" ? "loanGanttActive" : "loanGanttUpcoming";
        return (
          <div key={loan.id} className="loanGanttRow">
            <span className="loanGanttLabel">{loan.assetName}</span>
            <div className="loanGanttTrack">
              <button
                type="button"
                className={`loanGanttBar ${tone}`}
                style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                title={`${loan.assetName}: ${formatDate(start)} to ${formatDate(end)}`}
                onClick={() => onSelect?.(loan)}
              >
                {loan.collectedEarly ? "Collected early: " : ""}{loan.userEmail || loan.userId || loan.status}
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminLoansView({ loans, tab, onTab, onCollect, onReturn, onDetails }) {
  const rows = tab === "active" ? loans.active || [] : loans.upcoming || [];
  return (
    <section className="panel assetStack">
      <div className="assetHeaderRow">
        <div>
          <h1>Asset loans</h1>
          <p>Active loans place overdue records at the top. Upcoming reservations are ordered by collection time.</p>
        </div>
      </div>
      <div className="assetTabs">
        <button type="button" onClick={() => onTab("upcoming")}>Upcoming collections</button>
        <button type="button" onClick={() => onTab("active")}>Out of premises</button>
        <button type="button" onClick={() => onTab("timeline")}>Gantt board</button>
      </div>
      {tab === "timeline" ? <LoanGantt loans={loans.all || [...(loans.upcoming || []), ...(loans.active || [])]} onSelect={onDetails} /> : null}
      {tab !== "timeline" ? (
      <table className="assetTable">
        <thead>
          <tr>
            <th>Asset</th>
            <th>Borrower</th>
            <th>Serials</th>
            <th>Collection</th>
            <th>Return</th>
            <th>State</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((loan) => (
            <tr key={loan.id}>
              <td>{loan.assetName}</td>
              <td>{loan.userEmail || loan.userId}</td>
              <td>{serialText(loan)}</td>
              <td>
                {formatDate(loan.effectiveCollectionAt || loan.collectionAt)}
                {loan.collectedEarly ? <div><StatusBadge tone="amber">Collected early</StatusBadge></div> : null}
              </td>
              <td>{formatDate(loan.effectiveReturnAt || loan.returnDueAt)}</td>
              <td>{loan.overdue ? <StatusBadge tone="red">Overdue</StatusBadge> : loan.status}</td>
              <td>
                <button type="button" onClick={() => onDetails?.(loan)}>Details</button>
                {tab === "upcoming" ? (
                  <button type="button" onClick={() => onCollect(loan)}>Enter collection key</button>
                ) : (
                  <button type="button" onClick={() => onReturn(loan)}>Enter return code</button>
                )}
              </td>
            </tr>
          ))}
          {!rows.length ? (
            <tr><td colSpan={7}>No loans in this tab.</td></tr>
          ) : null}
        </tbody>
      </table>
      ) : null}
    </section>
  );
}

function LostDamagedView({ entries, onRecover, onRepair }) {
  return (
    <section className="panel assetStack">
      <h1>Lost and damaged equipment</h1>
      <p>Recovered assets return to inventory. Recovered and damaged assets remain unavailable until repaired.</p>
      <div className="assetCards">
        {entries.map((entry) => (
          <article key={`${entry.assetId}-${entry.unit.id}`} className="assetCard">
            <div className="assetHeaderRow">
              <h2>{entry.assetName} / {entry.unit.serial}</h2>
              <StatusBadge tone={entry.unit.condition === "lost" ? "red" : "amber"}>{entry.unit.condition}</StatusBadge>
            </div>
            <p>{entry.lastRecord?.damageDescription || entry.lastRecord?.fixDescription || "No damage notes."}</p>
            <div className="assetButtonRow">
              {entry.unit.condition === "lost" ? (
                <>
                  <button type="button" onClick={() => onRecover(entry, false)}>Recovered</button>
                  <button type="button" onClick={() => onRecover(entry, true)}>Recovered and damaged</button>
                </>
              ) : null}
              {entry.unit.condition === "damaged" ? (
                <button type="button" onClick={() => onRepair(entry)}>Repaired</button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {!entries.length ? <p className="assetMuted">No lost or damaged assets are currently tracked.</p> : null}
    </section>
  );
}

function LoanableView({ listings, onBook }) {
  return (
    <section className="panel assetStack">
      <h1>Borrow makerspace assets</h1>
      <p>Green items can be booked immediately. Amber items can be booked for their next collection window or when units return.</p>
      <div className="assetCards">
        {listings.map((asset) => (
          <article key={asset.id} className={`assetCard ${asset.bookableNow ? "assetCardGreen" : "assetCardAmber"}`}>
            <div className="assetHeaderRow">
              <h2>{asset.name}</h2>
              <StatusBadge tone={asset.bookableNow ? "green" : "amber"}>{asset.loanStatusLabel}</StatusBadge>
            </div>
            <p>{asset.description || "No description."}</p>
            <p>Available serials: {asset.quantityNormal - asset.quantityOutOfPremises} / {asset.quantityNormal}</p>
            <p>Earliest available: {formatDate(asset.nextAvailableAt)}</p>
            <button type="button" onClick={() => onBook(asset)}>Select dates and book</button>
          </article>
        ))}
      </div>
      {!listings.length ? <p className="assetMuted">No loanable assets are currently available.</p> : null}
    </section>
  );
}

function MyLoansView({ groups, transactions, balancePence, onReschedule, onExtend, onLost }) {
  const [tab, setTab] = useState("loans");
  const order = ["overdue", "present", "future", "historical"];
  return (
    <section className="panel assetStack">
      <h1>My bookings</h1>
      {transactions.length ? (
        <div className="assetDebt">
          Account balance: {formatMoney(balancePence)}
        </div>
      ) : null}
      <div className="assetTabs">
        <button type="button" onClick={() => setTab("loans")}>Loans</button>
        <button type="button" onClick={() => setTab("transactions")}>Transactions</button>
      </div>
      {tab === "loans" ? order.map((group) => (
        <div key={group}>
          <h2>{group}</h2>
          <div className="assetCards">
            {(groups[group] || []).map((loan) => (
              <article key={loan.id} className="assetCard">
                <div className="assetHeaderRow">
                  <h3>{loan.assetName}</h3>
                  <StatusBadge tone={group === "overdue" ? "red" : group === "future" ? "amber" : "green"}>{group}</StatusBadge>
                </div>
                <p>Serials: {serialText(loan)}</p>
                <p>Collection: {formatDate(loan.collectionAt)}</p>
                <p>Return: {formatDate(loan.returnDueAt)}</p>
                {group === "future" ? <p>Collection code: <strong>{loan.collectionCode}</strong></p> : null}
                {group === "present" || group === "overdue" ? <p>Return code: <strong>{loan.returnCode}</strong></p> : null}
                {group === "future" ? <button type="button" onClick={() => onReschedule(loan)}>Edit booking</button> : null}
                {group === "present" ? <button type="button" onClick={() => onExtend(loan)}>Change return date</button> : null}
                {group === "present" || group === "overdue" ? (
                  <button type="button" className="assetDanger" onClick={() => onLost(loan)}>Lost</button>
                ) : null}
                {group === "overdue" ? <p className="assetErrorInline">Overdue loans must be returned in person before making new bookings.</p> : null}
              </article>
            ))}
          </div>
          {!groups[group]?.length ? <p className="assetMuted">No {group} loans.</p> : null}
        </div>
      )) : (
        <div>
          <h2>Transactions</h2>
          <table className="assetTable">
            <thead>
              <tr>
                <th>Date</th>
                <th>Type</th>
                <th>Description</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {transactions.map((transaction) => (
                <tr key={transaction.id}>
                  <td>{formatDate(transaction.createdAt)}</td>
                  <td>{transactionTypeLabel(transaction.transactionType)}</td>
                  <td>{transaction.description || transaction.reason || "Account transaction"}</td>
                  <td>{formatSignedMoney(transaction.amountPence)}</td>
                </tr>
              ))}
              {!transactions.length ? (
                <tr><td colSpan={4}>No account transactions yet.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
