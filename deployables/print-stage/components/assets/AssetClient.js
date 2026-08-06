import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useMemo, useState } from "react";

import {
  fromDatetimeLocalValue,
  toDatetimeLocalValue,
  toFutureDatetimeLocalValue,
} from "../../lib/dateTimeLocal.js";

const adminLinks = [
  ["/admin/assets/catalogue", "Catalogue"],
  ["/admin/assets/inventory", "Inventory"],
  ["/admin/assets/units", "Units"],
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

function formatShortDate(value) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function startOfLocalDay(value) {
  const date = new Date(value);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addCalendarDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function borrowerDisplayName(loan) {
  const explicitName = String(loan?.userName || loan?.borrowerName || "").trim();
  if (explicitName) return explicitName;

  const email = String(loan?.userEmail || "").trim();
  if (email) {
    const localPart = email.split("@")[0] || email;
    return localPart
      .split(/[._-]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ") || email;
  }

  return String(loan?.userId || loan?.status || "Borrower");
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
  if (amount < 0) return `+${formatted}`;
  if (amount > 0) return `-${formatted}`;
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
    print_filament_surcharge: "3D print filament surcharge",
    print_filament_refund: "3D print filament refund",
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
const PURCHASE_COLLECTION_WINDOW_MS = 60 * 60 * 1000;
const assetClassOptions = [
  ["inventory", "Inventory only"],
  ["loan", "Loan / returnable"],
  ["purchase", "Purchase / collection only"],
  ["consumable", "Consumable / continuous quantity"],
];

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

function assetClassForItem(item = {}) {
  const text = String(item.assetClass || "").trim().toLowerCase();
  if (text) return text;
  if (item.assetSourceType === "customer_print" || item.sourceType === "customer_print" || item.collectionOnly) return "purchase";
  if (item.continuous || item.sourceType === "consumable") return "consumable";
  if (item.loanable) return "loan";
  return "inventory";
}

function isPurchaseItem(item) {
  return assetClassForItem(item) === "purchase";
}

function requiresReturnForItem(item) {
  return !isPurchaseItem(item) && item?.requiresReturn !== false;
}

function assetClassLabel(item) {
  const labels = {
    inventory: "Inventory",
    loan: "Loan",
    purchase: "Purchase",
    consumable: "Consumable",
  };
  return labels[assetClassForItem(item)] || "Inventory";
}

function assetClassTone(item) {
  const tones = {
    inventory: "neutral",
    loan: "green",
    purchase: "amber",
    consumable: "neutral",
  };
  return tones[assetClassForItem(item)] || "neutral";
}

function purchaseReservationEnd(start) {
  return new Date(start.getTime() + PURCHASE_COLLECTION_WINDOW_MS);
}

function bookingWindow(form, asset = null) {
  const start = new Date(form?.collectionAt || "");
  if (isPurchaseItem(asset)) {
    if (!Number.isFinite(start.getTime())) return null;
    return { start, end: purchaseReservationEnd(start) };
  }
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
  const window = bookingWindow(form, asset);
  return (asset?.units || []).filter((unit) =>
    unit.condition === "normal" &&
    !unit.deletedAt &&
    !(unit.loanHistory || []).some((loan) => loanOverlapsWindow(loan, window)),
  );
}

function bookingDateError(asset, form) {
  const purchase = isPurchaseItem(asset);
  const collectionAt = new Date(form?.collectionAt || "");
  if (!Number.isFinite(collectionAt.getTime())) {
    return purchase ? "Choose a valid collection date." : "Choose valid collection and return dates.";
  }
  if (collectionAt.getTime() < Date.now() - 60_000) {
    return "Collection date cannot be in the past.";
  }
  if (asset && !isDateBookableForAsset(asset, dateOnly(form.collectionAt))) {
    return "Collection date is outside this asset's availability windows.";
  }
  if (!purchase) {
    const returnAt = new Date(form?.returnAt || "");
    if (!Number.isFinite(returnAt.getTime())) {
      return "Choose valid collection and return dates.";
    }
    if (returnAt.getTime() <= collectionAt.getTime()) {
      return "Return date must be after collection date.";
    }
    if (asset && !isDateInAssetDateRanges(asset, dateOnly(form.returnAt))) {
      return "Return date is outside this asset's available date ranges.";
    }
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
  if (isPurchaseItem(asset)) return "";
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

async function compressEvidencePhoto(file) {
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

function EvidencePhotoGrid({ photos = [], label = "Evidence photo", onRemove }) {
  if (!photos.length) return null;
  return (
    <div className="returnPhotoGrid">
      {photos.map((photo, index) => (
        <figure key={photo.id || `${photo.name}-${index}`} className="returnPhotoThumb">
          <img src={photo.dataUrl} alt={photo.name || `${label} ${index + 1}`} />
          <figcaption>{photo.name || `${label} ${index + 1}`}</figcaption>
          {onRemove ? (
            <button type="button" className="assetDanger" onClick={() => onRemove(index)}>
              Remove
            </button>
          ) : null}
        </figure>
      ))}
    </div>
  );
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
  const assetClass = assetClassForItem(form);
  const continuous = assetClass === "consumable" || Boolean(form.continuous);
  const returnableLoan = assetClass === "loan";
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
    assetClass,
    loanable: returnableLoan,
    groupId: form.groupId || null,
    imageUrl: form.imageUrl || "",
    unitLabel: form.unitLabel || "items",
    continuous,
    quantity: continuous ? 0 : Number.parseInt(form.quantity, 10) || 1,
    quantityValue: continuous ? Number.parseFloat(String(form.quantity || "0")) || 0 : Number.parseInt(form.quantity, 10) || 1,
    pricePence: parsePounds(form.price, 0),
    lateFeePence: returnableLoan ? parsePounds(form.lateFee, 500) : undefined,
    totalFailureDays: Number.parseInt(form.totalFailureDays, 10) || 30,
    maxLoanDays: returnableLoan
      ? (String(form.maxLoanDays || "").trim() ? Number.parseInt(form.maxLoanDays, 10) : null)
      : undefined,
    availability: { weekly, dateRanges },
  };
}

function emptyAssetForm(assetClassOrLoanable = "loan", groupId = null) {
  const assetClass = typeof assetClassOrLoanable === "string"
    ? assetClassOrLoanable
    : assetClassOrLoanable ? "loan" : "inventory";
  const continuous = assetClass === "consumable";
  return {
    name: "",
    description: "",
    groupId,
    imageUrl: "",
    assetClass,
    unitLabel: continuous ? "grams" : "items",
    continuous,
    loanable: assetClass === "loan",
    quantity: continuous ? 0 : 1,
    price: "",
    lateFee: assetClass === "loan" ? "5.00" : "0.00",
    totalFailureDays: 30,
    maxLoanDays: "",
    weekly: "1,09:00,17:00\n2,09:00,17:00\n3,09:00,17:00\n4,09:00,17:00\n5,09:00,17:00",
    dateRanges: "",
  };
}

function formFromAsset(asset) {
  const assetClass = assetClassForItem(asset);
  return {
    name: asset.name || "",
    description: asset.description || "",
    groupId: asset.groupId || null,
    imageUrl: asset.imageUrl || "",
    assetClass,
    unitLabel: asset.unitLabel || "items",
    continuous: Boolean(asset.continuous),
    loanable: assetClass === "loan",
    quantity: asset.continuous ? Number(asset.quantityValue ?? asset.quantityTotal ?? 0) : asset.quantityTotal || asset.units?.length || 1,
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
  if (mode === "inventory") return "inventory-tree";
  if (mode === "units") return "units";
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
  const router = useRouter();
  const [payload, setPayload] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modalError, setModalError] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [loanTab, setLoanTab] = useState(mode === "admin-gantt" ? "timeline" : "upcoming");
  const [revealedCollectionCodes, setRevealedCollectionCodes] = useState({});
  const view = viewForMode(mode);
  const currentGroupId = mode === "inventory"
    ? String(router.query.groupId || "").trim() || null
    : null;

  async function load() {
    setPending(true);
    setError("");
    try {
      const params = new URLSearchParams({ view });
      if (view === "inventory-tree" && currentGroupId) {
        params.set("groupId", currentGroupId);
      }
      const response = await fetch(`/api/assets?${params.toString()}`);
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
    if (!router.isReady) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, currentGroupId, router.isReady]);

  async function post(body, success) {
    setPending(true);
    setError("");
    setModalError("");
    setMessage("");
    try {
      const requestBody = { ...body, view };
      if (view === "inventory-tree" && requestBody.groupId === undefined && requestBody.asset?.groupId === undefined) {
        requestBody.groupId = currentGroupId || null;
      }
      const response = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
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

  function openCreate(assetClassOrLoanable) {
    const nextForm = emptyAssetForm(assetClassOrLoanable, currentGroupId);
    const titles = {
      inventory: "Add inventory item",
      loan: "Add loanable asset",
      purchase: "Add purchase item",
      consumable: "Add consumable",
    };
    setForm(nextForm);
    setModalError("");
    setModal({ type: "asset", title: titles[nextForm.assetClass] || "Add asset" });
  }

  function openEdit(asset) {
    setForm(formFromAsset(asset));
    setModalError("");
    setModal({ type: "asset", title: `Edit ${asset.name}`, asset });
  }

  function openBook(asset) {
    const purchase = isPurchaseItem(asset);
    const collectionAt = asset.nextAvailableAt || new Date().toISOString();
    const defaultLoanDays = asset.maxLoanDays || 7;
    const nextForm = {
      assetId: asset.id,
      quantity: 1,
      unitIds: [],
      collectionAt: toFutureDatetimeLocalValue(collectionAt),
      returnAt: purchase ? "" : toDatetimeLocalValue(addDays(collectionAt, defaultLoanDays)),
      acceptTerms: false,
    };
    setForm(sanitizeBookingForm(asset, nextForm));
    setModalError("");
    setModal({ type: "book", title: `${purchase ? "Reserve collection" : "Book"} ${asset.name}`, asset });
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
      collectionPhotos: [],
      damageCharge: "",
      discretionaryCharge: "",
      discretionaryChargeDescription: "",
      waiveLateFee: false,
    });
    setModalError("");
    setModal({ type, title: type === "collect" ? "Verify collection code" : "Verify return code", loan });
  }

  function openDamage(asset, unitIds = []) {
    setForm({ assetId: asset.id, unitIds, damageDescription: "", damagePhotos: [], chargePence: 0, chargeUserEmail: "" });
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
      repairPhotos: [],
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

  function openCreateGroup() {
    setForm({ name: "", description: "", imageUrl: "", parentId: currentGroupId || null });
    setModalError("");
    setModal({ type: "group", title: "Create inventory group" });
  }

  function navigateInventoryGroup(groupId = null) {
    router.push(
      {
        pathname: "/admin/assets/inventory",
        query: groupId ? { groupId } : {},
      },
      undefined,
      { shallow: true },
    );
  }

  function openLoanDetails(loan) {
    setForm({});
    setModalError("");
    setModal({ type: "loanDetails", title: `Loan details: ${loan.assetName}`, loan });
  }

  async function revealCollectionCode(loan) {
    if (!loan?.id) return;
    setPending(true);
    setModalError("");
    setMessage("");

    try {
      const response = await fetch(`/api/assets/loans/${encodeURIComponent(loan.id)}/collection-code`, {
        method: "POST",
      });
      const next = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(next.error || "Unable to reveal collection code.");
      setRevealedCollectionCodes((current) => ({
        ...current,
        [loan.id]: next.collectionCode || "",
      }));
      setMessage("Collection code revealed and audited.");
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "Unable to reveal collection code.";
      setError(message);
      setModalError(message);
    } finally {
      setPending(false);
    }
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

  async function submitGroup(event) {
    event.preventDefault();
    await post(
      {
        action: "createInventoryGroup",
        group: {
          name: form.name,
          description: form.description,
          imageUrl: form.imageUrl,
          parentId: form.parentId || currentGroupId || null,
        },
        groupId: form.parentId || currentGroupId || null,
      },
      "Inventory group created.",
    );
  }

  async function createUnit(unit) {
    return post({ action: "createInventoryUnit", unit }, "Unit created.");
  }

  async function createConversion(conversion) {
    return post({ action: "createUnitConversion", conversion }, "Conversion created.");
  }

  async function submitBook(event) {
    event.preventDefault();
    const purchase = isPurchaseItem(modal?.asset);
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
        returnAt: purchase ? undefined : fromDatetimeLocalValue(form.returnAt),
        acceptTerms: form.acceptTerms,
      },
      purchase ? "Collection reservation created." : "Booking created.",
    );
    if (result?.loan) {
      window.alert(result.loan.returnCode
        ? `Collection code: ${result.loan.collectionCode}\nReturn code: ${result.loan.returnCode}`
        : `Collection code: ${result.loan.collectionCode}`);
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
        collectionPhotos: form.collectionPhotos || [],
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

  async function addEvidencePhotos(field, fileList, label = "evidence photos") {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    setModalError("");
    try {
      const existing = form[field] || [];
      const remainingSlots = Math.max(0, MAX_RETURN_PHOTOS - existing.length);
      if (remainingSlots < 1) {
        throw new Error(`Only ${MAX_RETURN_PHOTOS} ${label} can be uploaded.`);
      }
      const photos = [];
      for (const file of files.slice(0, remainingSlots)) {
        photos.push(await compressEvidencePhoto(file));
      }
      setForm({ ...form, [field]: [...existing, ...photos] });
    } catch (caught) {
      setModalError(caught instanceof Error ? caught.message : `Unable to attach ${label}.`);
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
        damagePhotos: form.damagePhotos || [],
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
        repairPhotos: form.repairPhotos || [],
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
  const bookingRequiresReturn = modal?.type === "book" ? requiresReturnForItem(modal.asset) : true;
  const bookingIsPurchase = modal?.type === "book" ? isPurchaseItem(modal.asset) : false;
  const returnItems = modal?.type === "return" ? (form.returnItems || []) : [];
  const returnReadyError = modal?.type === "return" && returnItems.some((item) => !item.returned)
    ? "All loaned serials must be marked returned before the loan can be closed."
    : "";

  return (
    <div className="assetPage">
      {mode.startsWith("admin") || ["catalogue", "inventory", "units", "lost-damaged"].includes(mode) ? <AdminNav /> : null}

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
        <InventoryView
          tree={payload?.tree || null}
          onCreate={openCreate}
          onCreateGroup={openCreateGroup}
          onNavigateGroup={navigateInventoryGroup}
          onEdit={openEdit}
          onDamage={openDamage}
          onRepair={openRepair}
          onDelete={openDelete}
        />
      ) : null}

      {mode === "units" ? (
        <UnitsView
          units={payload?.units || []}
          conversions={payload?.conversions || []}
          canManage={Boolean(payload?.actor?.isInventoryUnitAdmin || payload?.actor?.isAssetAdmin)}
          pending={pending}
          onCreateUnit={createUnit}
          onCreateConversion={createConversion}
        />
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
              returnAt: requiresReturnForItem(loan) ? toDatetimeLocalValue(loan.returnDueAt) : "",
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
          <AssetForm
            form={form}
            setForm={setForm}
            onSubmit={submitAsset}
            pending={pending}
            units={payload?.units || []}
          />
        </Modal>
      ) : null}

      {modal?.type === "group" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={submitGroup}>
            <label>
              Group name
              <input value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label>
              Hero image URL, optional
              <input value={form.imageUrl || ""} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." />
            </label>
            <label>
              Description
              <textarea value={form.description || ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
            </label>
            <button type="submit" disabled={pending}>Create group</button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "loanDetails" ? (
        <Modal title={modal.title} error={modalError} onClose={() => setModal(null)}>
          <LoanDetails
            loan={modal.loan}
            canRevealCollectionCode={Boolean(payload?.actor?.isCollectionCodeOverrideAdmin)}
            revealedCollectionCode={revealedCollectionCodes[modal.loan.id] || ""}
            onRevealCollectionCode={revealCollectionCode}
            pending={pending}
          />
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
              Available for selected {bookingIsPurchase ? "collection time" : "dates"}: {bookingAvailableUnits.length} / {modal.asset.quantityNormal || 0} normal serials.
            </p>
            {currentBookingError ? <p className="assetErrorInline">{currentBookingError}</p> : null}
            {bookingRequiresReturn ? (
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
            ) : null}
            <label>
              Collection date and time
              <input
                type="datetime-local"
                value={form.collectionAt}
                onChange={(event) => setForm(sanitizeBookingForm(modal.asset, { ...form, collectionAt: event.target.value }))}
                required
              />
            </label>
            {bookingRequiresReturn ? (
              <label>
                Return date and time
                <input
                  type="datetime-local"
                  value={form.returnAt}
                  onChange={(event) => setForm(sanitizeBookingForm(modal.asset, { ...form, returnAt: event.target.value }))}
                  required
                />
              </label>
            ) : null}
            <fieldset className="assetFieldset">
              <legend>Serial numbers, optional</legend>
              <p className="assetMuted">Unavailable serials are locked for the selected {bookingIsPurchase ? "collection time" : "dates"}. Leave blank to let the backend pick the first free serials.</p>
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
                I accept the <Link href="/assets/terms">{bookingIsPurchase ? "purchase and collection terms" : "loan terms and liability agreement"}</Link>.
              </span>
            </label>
            <button type="submit" disabled={pending || Boolean(currentBookingError)}>
              {bookingIsPurchase ? "Reserve collection" : "Book asset"}
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
            <label>
              Collection photos, optional
              <input type="file" accept="image/*" multiple onChange={(event) => addEvidencePhotos("collectionPhotos", event.target.files, "collection photos")} />
            </label>
            <EvidencePhotoGrid
              photos={form.collectionPhotos || []}
              label="Collection photo"
              onRemove={(index) => setForm({ ...form, collectionPhotos: (form.collectionPhotos || []).filter((_, photoIndex) => photoIndex !== index) })}
            />
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
              <input type="file" accept="image/*" multiple onChange={(event) => addEvidencePhotos("returnPhotos", event.target.files, "return photos")} />
            </label>
            <EvidencePhotoGrid
              photos={form.returnPhotos || []}
              label="Return photo"
              onRemove={(index) => setForm({ ...form, returnPhotos: (form.returnPhotos || []).filter((_, photoIndex) => photoIndex !== index) })}
            />
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
            <label>
              Damage photos, optional
              <input type="file" accept="image/*" multiple onChange={(event) => addEvidencePhotos("damagePhotos", event.target.files, "damage photos")} />
            </label>
            <EvidencePhotoGrid
              photos={form.damagePhotos || []}
              label="Damage photo"
              onRemove={(index) => setForm({ ...form, damagePhotos: (form.damagePhotos || []).filter((_, photoIndex) => photoIndex !== index) })}
            />
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
            <label>
              Repair photos, optional
              <input type="file" accept="image/*" multiple onChange={(event) => addEvidencePhotos("repairPhotos", event.target.files, "repair photos")} />
            </label>
            <EvidencePhotoGrid
              photos={form.repairPhotos || []}
              label="Repair photo"
              onRemove={(index) => setForm({ ...form, repairPhotos: (form.repairPhotos || []).filter((_, photoIndex) => photoIndex !== index) })}
            />
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
            const requiresReturn = requiresReturnForItem(modal.loan);
            post({
              action: "rescheduleLoan",
              loanId: form.loanId,
              collectionAt: fromDatetimeLocalValue(form.collectionAt),
              returnAt: requiresReturn ? fromDatetimeLocalValue(form.returnAt) : undefined,
            }, "Booking updated.");
          }}>
            {requiresReturnForItem(modal.loan) ? (
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
            ) : null}
            <label>
              Collection date
              <input type="datetime-local" value={form.collectionAt} onChange={(event) => setForm({ ...form, collectionAt: event.target.value })} required />
            </label>
            {requiresReturnForItem(modal.loan) ? (
              <label>
                Return date
                <input type="datetime-local" value={form.returnAt} onChange={(event) => setForm({ ...form, returnAt: event.target.value })} required />
              </label>
            ) : null}
            <button type="submit" disabled={pending}>
              {requiresReturnForItem(modal.loan) ? "Update booking" : "Update collection"}
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

function AssetForm({ form, setForm, onSubmit, pending, units = [] }) {
  const assetClass = assetClassForItem(form);
  const continuous = assetClass === "consumable";
  const reservable = assetClass === "loan" || assetClass === "purchase";
  const returnableLoan = assetClass === "loan";

  function setAssetClass(nextClass) {
    const nextContinuous = nextClass === "consumable";
    setForm({
      ...form,
      assetClass: nextClass,
      continuous: nextContinuous,
      loanable: nextClass === "loan",
      unitLabel: nextContinuous && (!form.unitLabel || form.unitLabel === "items") ? "grams" : form.unitLabel || "items",
      quantity: nextContinuous && !form.quantity ? 0 : form.quantity || 1,
      lateFee: nextClass === "loan" ? form.lateFee || "5.00" : "0.00",
      maxLoanDays: nextClass === "loan" ? form.maxLoanDays || "" : "",
    });
  }

  return (
    <form className="assetForm" onSubmit={onSubmit}>
      <label>
        Asset name
        <input value={form.name || ""} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
      </label>
      <label>
        Hero image URL, optional
        <input value={form.imageUrl || ""} onChange={(event) => setForm({ ...form, imageUrl: event.target.value })} placeholder="https://..." />
      </label>
      <label>
        Description
        <textarea value={form.description || ""} onChange={(event) => setForm({ ...form, description: event.target.value })} />
      </label>
      <label>
        Item class
        <select value={assetClass} onChange={(event) => setAssetClass(event.target.value)}>
          {assetClassOptions.map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </label>
      <p className="assetMuted">
        Purchases and merch use collection codes and collection times, but never return dates or return codes.
      </p>
      <label>
        Quantity available
        <input
          type="number"
          min={continuous ? "0" : "1"}
          step={continuous ? "0.01" : "1"}
          value={form.quantity ?? (continuous ? 0 : 1)}
          onChange={(event) => setForm({ ...form, quantity: event.target.value })}
          required
        />
      </label>
      <label>
        Unit label
        <input
          list="asset-stock-units"
          value={form.unitLabel || "items"}
          onChange={(event) => setForm({ ...form, unitLabel: event.target.value })}
          placeholder="items, grams, litres..."
        />
        <datalist id="asset-stock-units">
          {units.map((unit) => (
            <option key={unit.id} value={unit.name} />
          ))}
        </datalist>
      </label>
      {reservable ? (
        <>
          <label>
            {returnableLoan ? "Asset price, GBP" : "Purchase price, GBP"}
            <input value={form.price || ""} onChange={(event) => setForm({ ...form, price: event.target.value })} placeholder="25.00" />
          </label>
          {returnableLoan ? (
            <>
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
            </>
          ) : null}
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
          <button type="button" onClick={() => onCreate("loan")}>Add loanable asset</button>
          <button type="button" onClick={() => onCreate("purchase")}>Add purchase item</button>
          <button type="button" onClick={() => onCreate("inventory")}>Add non-loanable asset</button>
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
            <StatusBadge tone={assetClassTone(asset)}>{assetClassLabel(asset)}</StatusBadge>
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
            {assetClassForItem(asset) === "loan" ? (
              <button type="button" onClick={() => onLoanable(asset, false)}>Make non-loanable</button>
            ) : assetClassForItem(asset) === "inventory" ? (
              <button type="button" onClick={() => onLoanable(asset, true)}>Make loanable</button>
            ) : null}
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
          {entry.status}: {formatDate(entry.collectionAt)}
          {entry.collectionOnly ? " collection only" : ` to ${formatDate(entry.returnDueAt)}`}
          {entry.borrowerEmail ? `, ${entry.borrowerEmail}` : ""}
          {entry.returnedAt ? `, returned ${formatDate(entry.returnedAt)}` : ""}
          {entry.lostAt ? `, lost ${formatDate(entry.lostAt)}` : ""}
        </li>
      ))}
    </ul>
  );
}

function groupPathLabel(tree) {
  const crumbs = Array.isArray(tree?.breadcrumbs) ? tree.breadcrumbs : [];
  return ["Inventory", ...crumbs.map((group) => group.name)].join(" / ");
}

function InventoryView({ tree, onCreate, onCreateGroup, onNavigateGroup, onEdit, onDamage, onRepair, onDelete }) {
  const assets = Array.isArray(tree?.inventory) ? tree.inventory : [];
  const childGroups = Array.isArray(tree?.childGroups) ? tree.childGroups : [];
  const breadcrumbs = Array.isArray(tree?.breadcrumbs) ? tree.breadcrumbs : [];

  return (
    <section className="panel assetStack">
      <div className="assetHeaderRow">
        <div>
          <h1>{groupPathLabel(tree)}</h1>
          <p>Folders organise physical makerspace stock. Customer prints live here temporarily until collection is fulfilled.</p>
        </div>
        <div className="assetButtonRow">
          <button type="button" onClick={() => onCreate("inventory")}>Add inventory item</button>
          <button type="button" onClick={() => onCreate("loan")}>Add loanable item</button>
          <button type="button" onClick={() => onCreate("purchase")}>Add purchase item</button>
          <button type="button" onClick={onCreateGroup}>Create group</button>
          <a href="/api/assets/export?format=json">Export JSON</a>
          <a href="/api/assets/export?format=xml">Export XML</a>
        </div>
      </div>
      <div className="inventoryBreadcrumbs">
        <button type="button" onClick={() => onNavigateGroup(null)}>Inventory root</button>
        {breadcrumbs.map((group) => (
          <button type="button" key={group.id} onClick={() => onNavigateGroup(group.id)}>
            {group.name}
          </button>
        ))}
      </div>
      <div className="inventoryHeroGrid">
        {childGroups.map((group) => (
          <article key={group.id} className="inventoryHeroCard inventoryFolderCard" onClick={() => onNavigateGroup(group.id)}>
            {group.imageUrl ? <img src={group.imageUrl} alt="" className="inventoryHeroImage" /> : <div className="inventoryHeroPlaceholder">Folder</div>}
            <div className="inventoryHeroBody">
              <span className="assetBadge assetBadge-neutral">Group</span>
              <h2>{group.name}</h2>
              <p>{group.description || "No description yet."}</p>
            </div>
          </article>
        ))}
        {assets.map((asset) => (
          <article key={asset.id} className="inventoryHeroCard">
            {asset.imageUrl ? <img src={asset.imageUrl} alt="" className="inventoryHeroImage" /> : <div className="inventoryHeroPlaceholder">Item</div>}
            <div className="inventoryHeroBody">
              <div className="assetHeaderRow">
                <div>
                  <h2>{asset.name}</h2>
                  <p>{asset.description || "No description."}</p>
                </div>
                <StatusBadge tone={assetClassTone(asset)}>{assetClassLabel(asset)}</StatusBadge>
              </div>
              <div className="assetStats">
                <span>
                  Physically present: {asset.continuous
                    ? `${Number(asset.quantityPhysicallyPresent || 0).toFixed(2)} ${asset.unitLabel || "units"}`
                    : asset.quantityPhysicallyPresent}
                </span>
                <span>Damaged: {asset.quantityDamaged}</span>
                <span>Out of premises: {asset.quantityOutOfPremises}</span>
                <span>Type: {asset.continuous ? "Continuous" : "Serialised"}</span>
              </div>
              <div className="assetButtonRow">
                <button type="button" onClick={() => onEdit(asset)}>Edit details</button>
                <button type="button" className="assetDanger" onClick={() => onDelete(asset)}>Delete item</button>
              </div>
              <details>
                <summary>Loanable periods</summary>
                <LoanabilityHistory history={asset.loanabilityHistory || []} />
              </details>
              {asset.continuous ? null : (
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
              )}
            </div>
          </article>
        ))}
      </div>
      {!assets.length && !childGroups.length ? <p className="assetMuted">This folder is empty.</p> : null}
    </section>
  );
}

function UnitsView({ units, conversions, canManage, pending, onCreateUnit, onCreateConversion }) {
  const [unitName, setUnitName] = useState("");
  const [conversion, setConversion] = useState({ fromUnitId: "", toUnitId: "", factor: "" });

  async function submitUnit(event) {
    event.preventDefault();
    const result = await onCreateUnit({ name: unitName });
    if (result) setUnitName("");
  }

  async function submitConversion(event) {
    event.preventDefault();
    const result = await onCreateConversion(conversion);
    if (result) setConversion({ fromUnitId: "", toUnitId: "", factor: "" });
  }

  return (
    <section className="panel assetStack">
      <div className="assetHeaderRow">
        <div>
          <h1>Inventory units</h1>
          <p>Reusable units and conversion factors keep stock macros interoperable instead of relying on one-off text entry.</p>
        </div>
        <div className="assetButtonRow">
          <a href="/api/assets/export?format=json">Export JSON</a>
          <a href="/api/assets/export?format=xml">Export XML</a>
        </div>
      </div>
      {canManage ? (
        <div className="assetCards">
          <form className="assetCard assetForm" onSubmit={submitUnit}>
            <h2>Add unit</h2>
            <label>
              Unit name
              <input value={unitName} onChange={(event) => setUnitName(event.target.value)} placeholder="grams" required />
            </label>
            <button type="submit" disabled={pending}>Add unit</button>
          </form>
          <form className="assetCard assetForm" onSubmit={submitConversion}>
            <h2>Add conversion</h2>
            <label>
              From
              <select value={conversion.fromUnitId} onChange={(event) => setConversion({ ...conversion, fromUnitId: event.target.value })} required>
                <option value="">Select unit</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>
            <label>
              To
              <select value={conversion.toUnitId} onChange={(event) => setConversion({ ...conversion, toUnitId: event.target.value })} required>
                <option value="">Select unit</option>
                {units.map((unit) => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
              </select>
            </label>
            <label>
              Factor
              <input type="number" min="0.000001" step="0.000001" value={conversion.factor} onChange={(event) => setConversion({ ...conversion, factor: event.target.value })} required />
            </label>
            <button type="submit" disabled={pending || units.length < 2}>Add conversion</button>
          </form>
        </div>
      ) : (
        <p className="assetMuted">You can view units, but creating units or conversions requires the inventory unit admin role.</p>
      )}
      <div className="assetCards">
        {units.map((unit) => {
          const unitConversions = conversions.filter((entry) => entry.fromUnitId === unit.id || entry.toUnitId === unit.id);
          return (
            <article key={unit.id} className="assetCard">
              <h2>{unit.name}</h2>
              <details>
                <summary>Conversions ({unitConversions.length})</summary>
                {unitConversions.length ? (
                  <ul className="assetHistoryList">
                    {unitConversions.map((entry) => (
                      <li key={entry.id}>
                        1 {entry.fromUnitName} = {entry.factor} {entry.toUnitName}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="assetMuted">No conversions recorded.</p>
                )}
              </details>
            </article>
          );
        })}
      </div>
      {!units.length ? <p className="assetMuted">No custom units yet.</p> : null}
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

function LoanDetails({ loan, canRevealCollectionCode = false, revealedCollectionCode = "", onRevealCollectionCode, pending = false }) {
  const returnRows = loanReturnRows(loan);
  const requiresReturn = requiresReturnForItem(loan);
  const adminCodesRedacted = Boolean(loan.codesRedacted);
  const visibleCollectionCode = adminCodesRedacted ? revealedCollectionCode : loan.collectionCode || "";
  const visibleReturnCode = adminCodesRedacted ? "" : loan.returnCode || "";
  return (
    <div className="assetStack">
      <div className="assetStats">
        <span>Status: {loan.status}</span>
        <span>Borrower: {loan.userEmail || loan.userId || "-"}</span>
        <span>Collection: {formatDate(loan.effectiveCollectionAt || loan.collectionAt)}</span>
        <span>{requiresReturn ? `Return: ${formatDate(loan.effectiveReturnAt || loan.returnDueAt)}` : "Return: not required"}</span>
        <span>Collection code: {visibleCollectionCode || (adminCodesRedacted ? "Hidden from admin view" : "-")}</span>
        {requiresReturn ? <span>Return code: {visibleReturnCode || (adminCodesRedacted ? "Hidden from admin view" : "-")}</span> : <span>Fulfilment: collection only</span>}
      </div>
      {adminCodesRedacted ? (
        <div className="assetButtonRow">
          {canRevealCollectionCode ? (
            <button type="button" onClick={() => onRevealCollectionCode?.(loan)} disabled={pending || Boolean(visibleCollectionCode)}>
              {visibleCollectionCode ? "Collection code revealed" : "Reveal collection code"}
            </button>
          ) : (
            <p className="assetMuted" style={{ margin: 0 }}>
              Collection code override permission is required to reveal borrower collection codes.
            </p>
          )}
        </div>
      ) : null}
      {loan.collectedEarly ? <StatusBadge tone="amber">Collected early</StatusBadge> : null}
      {loan.overdue ? <StatusBadge tone="red">Overdue</StatusBadge> : null}
      {requiresReturn ? (
        <>
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
        </>
      ) : null}
      {loan.discretionaryChargeDescription ? <p>{loan.discretionaryChargeDescription}</p> : null}
      {loan.printCompletionPhotos?.length ? (
        <>
          <h3>Print completion photos</h3>
          <EvidencePhotoGrid photos={loan.printCompletionPhotos} label="Print completion photo" />
        </>
      ) : null}
      {loan.collectionPhotos?.length ? (
        <>
          <h3>Collection photos</h3>
          <EvidencePhotoGrid photos={loan.collectionPhotos} label="Collection photo" />
        </>
      ) : null}
      {loan.returnNote ? <p>Return note: {loan.returnNote}</p> : null}
      {loan.returnPhotos?.length ? (
        <>
          <h3>Return photos</h3>
          <EvidencePhotoGrid photos={loan.returnPhotos} label="Return photo" />
        </>
      ) : null}
    </div>
  );
}

function loanVisualEnd(loan) {
  if (requiresReturnForItem(loan)) {
    return new Date(loan.effectiveReturnAt || loan.returnDueAt);
  }
  const start = new Date(loan.effectiveCollectionAt || loan.collectionAt);
  if (!Number.isFinite(start.getTime())) return new Date(loan.effectiveReturnAt || loan.returnDueAt);
  return purchaseReservationEnd(start);
}

function LoanGantt({ loans = [], onSelect }) {
  const visible = loans.filter((loan) => ["reserved", "collected", "returned"].includes(loan.status));
  if (!visible.length) return <p className="assetMuted">No active or upcoming loans to chart.</p>;

  const starts = visible.map((loan) => new Date(loan.effectiveCollectionAt || loan.collectionAt).getTime()).filter(Number.isFinite);
  const ends = visible.map((loan) => loanVisualEnd(loan).getTime()).filter(Number.isFinite);
  const dayMs = 24 * 60 * 60 * 1000;
  const minDate = startOfLocalDay(Math.min(...starts, Date.now()));
  const maxDate = addCalendarDays(startOfLocalDay(Math.max(...ends, minDate.getTime() + 7 * dayMs)), 1);
  const dayCount = Math.max(7, Math.ceil((maxDate.getTime() - minDate.getTime()) / dayMs));
  const timelineEnd = addCalendarDays(minDate, dayCount);
  const span = Math.max(1, timelineEnd.getTime() - minDate.getTime());
  const ticks = Array.from({ length: dayCount }, (_, index) => addCalendarDays(minDate, index));
  const minWidthRem = Math.max(52, 12 + dayCount * 4);

  return (
    <div className="loanGantt" style={{ "--gantt-days": ticks.length, "--gantt-min-width": `${minWidthRem}rem` }}>
      <div className="loanGanttInner">
      <div className="loanGanttScale">
        <span className="loanGanttScaleSpacer">Asset</span>
        <div className="loanGanttDateRow">
          {ticks.map((tick) => (
            <span key={tick.toISOString()}>{formatShortDate(tick)}</span>
          ))}
        </div>
      </div>
      {visible.map((loan) => {
        const start = new Date(loan.effectiveCollectionAt || loan.collectionAt);
        const end = loanVisualEnd(loan);
        const left = Math.max(0, ((start.getTime() - minDate.getTime()) / span) * 100);
        const width = Math.max(1.5, ((end.getTime() - start.getTime()) / span) * 100);
        const visibleWidth = Math.min(width, 100 - left);
        const tone = loan.status === "returned" ? "loanGanttReturned" : loan.status === "collected" ? "loanGanttActive" : "loanGanttUpcoming";
        const borrowerName = borrowerDisplayName(loan);
        const label = `${loan.collectedEarly ? "Early: " : ""}${borrowerName}`;
        const showLabel = visibleWidth >= 8;
        return (
          <div key={loan.id} className="loanGanttRow">
            <span className="loanGanttLabel">{loan.assetName}</span>
            <div className="loanGanttTrack">
              <button
                type="button"
                className={`loanGanttBar ${tone}`}
                style={{ left: `${left}%`, width: `${visibleWidth}%` }}
                title={`${borrowerName} collecting ${loan.assetName}: ${formatDate(start)}${requiresReturnForItem(loan) ? ` to ${formatDate(end)}` : " collection only"}`}
                onClick={() => onSelect?.(loan)}
              >
                {showLabel ? <span className="loanGanttBarText">{label}</span> : null}
              </button>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}

function AdminLoansView({ loans, tab, onTab, onCollect, onReturn, onDetails }) {
  const rows = tab === "active" ? loans.active || [] : loans.upcoming || [];
  return (
    <section className="panel assetStack">
      <div className="assetHeaderRow">
        <div>
          <h1>Asset loans and collections</h1>
          <p>Active returnable loans place overdue records at the top. Upcoming loans and purchase collections are ordered by collection time.</p>
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
            <th>Return / fulfilment</th>
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
              <td>{requiresReturnForItem(loan) ? formatDate(loan.effectiveReturnAt || loan.returnDueAt) : "No return required"}</td>
              <td>{loan.overdue ? <StatusBadge tone="red">Overdue</StatusBadge> : loan.status}</td>
              <td>
                <button type="button" onClick={() => onDetails?.(loan)}>Details</button>
                {tab === "upcoming" ? (
                  <button type="button" onClick={() => onCollect(loan)}>Enter collection key</button>
                ) : requiresReturnForItem(loan) ? (
                  <button type="button" onClick={() => onReturn(loan)}>Enter return code</button>
                ) : null}
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
            {entry.lastRecord?.photos?.length ? (
              <EvidencePhotoGrid photos={entry.lastRecord.photos} label="Damage record photo" />
            ) : null}
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
      <h1>Borrow or collect makerspace items</h1>
      <p>Green items can be reserved immediately. Amber items can be reserved for their next collection window or when units return.</p>
      <div className="assetCards">
        {listings.map((asset) => (
          <article key={asset.id} className={`assetCard ${asset.bookableNow ? "assetCardGreen" : "assetCardAmber"}`}>
            <div className="assetHeaderRow">
              <h2>{asset.name}</h2>
              <div className="assetButtonRow">
                <StatusBadge tone={assetClassTone(asset)}>{assetClassLabel(asset)}</StatusBadge>
                <StatusBadge tone={asset.bookableNow ? "green" : "amber"}>{asset.loanStatusLabel}</StatusBadge>
              </div>
            </div>
            <p>{asset.description || "No description."}</p>
            <p>Available serials: {asset.quantityNormal - asset.quantityOutOfPremises} / {asset.quantityNormal}</p>
            <p>Earliest available: {formatDate(asset.nextAvailableAt)}</p>
            <button type="button" onClick={() => onBook(asset)}>
              {isPurchaseItem(asset) ? "Select collection and reserve" : "Select dates and book"}
            </button>
          </article>
        ))}
      </div>
      {!listings.length ? <p className="assetMuted">No reservable assets or purchase items are currently available.</p> : null}
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
                  <div className="assetButtonRow">
                    <StatusBadge tone={assetClassTone(loan)}>{assetClassLabel(loan)}</StatusBadge>
                    <StatusBadge tone={group === "overdue" ? "red" : group === "future" ? "amber" : "green"}>{group}</StatusBadge>
                  </div>
                </div>
                <p>Serials: {serialText(loan)}</p>
                <p>Collection: {formatDate(loan.collectionAt)}</p>
                {requiresReturnForItem(loan) ? <p>Return: {formatDate(loan.returnDueAt)}</p> : <p>Return: not required</p>}
                {group === "future" ? <p>Collection code: <strong>{loan.collectionCode}</strong></p> : null}
                {requiresReturnForItem(loan) && (group === "present" || group === "overdue") ? <p>Return code: <strong>{loan.returnCode}</strong></p> : null}
                {group === "future" ? <button type="button" onClick={() => onReschedule(loan)}>{requiresReturnForItem(loan) ? "Edit booking" : "Edit collection"}</button> : null}
                {requiresReturnForItem(loan) && group === "present" ? <button type="button" onClick={() => onExtend(loan)}>Change return date</button> : null}
                {requiresReturnForItem(loan) && (group === "present" || group === "overdue") ? (
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
