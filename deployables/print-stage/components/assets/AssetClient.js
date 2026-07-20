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
    .map((range) => `${range.start},${range.end}`)
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

function dateOnly(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
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
    .map((range) => `${range.start}T00:00:00.000Z,${range.end}T23:59:59.999Z`)
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
  const time = new Date(dateOnly(day)).getTime();
  const low = Math.min(new Date(start).getTime(), new Date(end).getTime());
  const high = Math.max(new Date(start).getTime(), new Date(end).getTime());
  return time >= low && time <= high;
}

function datetimeWithDate(currentValue, date, fallbackTime = "09:00") {
  const time = String(currentValue || "").match(/T(\d\d:\d\d)/)?.[1] || fallbackTime;
  return `${date}T${time}`;
}

function bookingRangeText(collectionAt, returnAt) {
  const start = dateOnly(fromDatetimeLocalValue(collectionAt) || collectionAt);
  const end = dateOnly(fromDatetimeLocalValue(returnAt) || returnAt);
  return start && end ? rangeLinesFromRanges([{ start, end }]) : "";
}

function activeBlockedRangesForAsset(asset) {
  const ranges = [];
  for (const unit of asset?.units || []) {
    for (const loan of unit.loanHistory || []) {
      if (["reserved", "collected"].includes(loan.status)) {
        ranges.push({ start: dateOnly(loan.collectionAt), end: dateOnly(loan.returnDueAt) });
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
      return { start, end };
    });

  return {
    name: form.name,
    description: form.description,
    loanable: form.loanable,
    quantity: Number.parseInt(form.quantity, 10) || 1,
    pricePence: parsePounds(form.price, 0),
    lateFeePence: parsePounds(form.lateFee, 500),
    totalFailureDays: Number.parseInt(form.totalFailureDays, 10) || 30,
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
    weekly: weeklyText(asset.availability),
    dateRanges: rangeText(asset.availability),
  };
}

function viewForMode(mode) {
  if (mode === "catalogue") return "catalogue";
  if (mode === "inventory") return "inventory";
  if (mode === "admin-loans") return "admin-loans";
  if (mode === "lost-damaged") return "lost-damaged";
  if (mode === "my-loans") return "my-loans";
  return "loanable";
}

function Modal({ title, children, onClose }) {
  return (
    <div className="assetModalBackdrop" role="presentation">
      <section className="assetModal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="assetModalHeader">
          <h2>{title}</h2>
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
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
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({});
  const [loanTab, setLoanTab] = useState("upcoming");
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
      setError(caught instanceof Error ? caught.message : "Asset action failed.");
      return null;
    } finally {
      setPending(false);
    }
  }

  function openCreate(loanable) {
    setForm(emptyAssetForm(loanable));
    setModal({ type: "asset", title: loanable ? "Add loanable asset" : "Add non-loanable asset" });
  }

  function openEdit(asset) {
    setForm(formFromAsset(asset));
    setModal({ type: "asset", title: `Edit ${asset.name}`, asset });
  }

  function openBook(asset) {
    const collectionAt = asset.nextAvailableAt || new Date().toISOString();
    setForm({
      assetId: asset.id,
      quantity: 1,
      unitIds: [],
      collectionAt: toFutureDatetimeLocalValue(collectionAt),
      returnAt: toDatetimeLocalValue(addDays(collectionAt, 7)),
      acceptTerms: false,
    });
    setModal({ type: "book", title: `Book ${asset.name}`, asset });
  }

  function openCode(type, loan) {
    setForm({ code: "", loanId: loan.id });
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
    const result = await post(
      {
        action: "bookLoan",
        assetId: form.assetId,
        quantity: form.unitIds?.length || Number.parseInt(form.quantity, 10) || 1,
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
    await post({ action: "verifyCollectionCode", loanId: form.loanId, code: form.code }, "Collection authorised.");
  }

  async function submitReturn(event) {
    event.preventDefault();
    await post(
      {
        action: "verifyReturnCode",
        loanId: form.loanId,
        code: form.code,
        damaged: Boolean(form.damaged),
        damagedUnitIds: form.damaged ? modal.loan.unitIds : [],
        damageDescription: form.damageDescription,
        damageChargePence: parsePounds(form.damageCharge, 0),
      },
      "Return recorded.",
    );
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

      {mode === "admin-loans" ? (
        <AdminLoansView
          loans={payload?.loans || { active: [], upcoming: [] }}
          tab={loanTab}
          onTab={setLoanTab}
          onCollect={(loan) => openCode("collect", loan)}
          onReturn={(loan) => openCode("return", loan)}
          onExpire={() => post({ action: "expireMissedCollections" }, "Missed collections cancelled.")}
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
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <AssetForm form={form} setForm={setForm} onSubmit={submitAsset} pending={pending} />
        </Modal>
      ) : null}

      {modal?.type === "book" ? (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={submitBook}>
            <label>
              Quantity
              <input type="number" min="1" value={form.quantity} onChange={(event) => setForm({ ...form, quantity: event.target.value })} />
            </label>
            <DateRangeCalendar
              label="Booking range"
              value={bookingRangeText(form.collectionAt, form.returnAt)}
              blockedRanges={activeBlockedRangesForAsset(modal.asset)}
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
              Collection date and time
              <input type="datetime-local" value={form.collectionAt} onChange={(event) => setForm({ ...form, collectionAt: event.target.value })} required />
            </label>
            <label>
              Return date and time
              <input type="datetime-local" value={form.returnAt} onChange={(event) => setForm({ ...form, returnAt: event.target.value })} required />
            </label>
            <fieldset className="assetFieldset">
              <legend>Serial numbers, optional</legend>
              <p className="assetMuted">Leave blank to let the backend pick the first non-conflicting serials.</p>
              {(modal.asset.units || []).filter((unit) => unit.condition === "normal" && !unit.deletedAt).map((unit) => {
                const checked = (form.unitIds || []).includes(unit.id);
                return (
                  <label key={unit.id} className="assetCheckbox">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) => {
                        const current = new Set(form.unitIds || []);
                        if (event.target.checked) current.add(unit.id);
                        else current.delete(unit.id);
                        setForm({ ...form, unitIds: Array.from(current), quantity: Math.max(1, current.size || Number.parseInt(form.quantity, 10) || 1) });
                      }}
                    />
                    <span>{unit.serial}</span>
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
            <button type="submit" disabled={pending}>
              Book asset
            </button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "collect" ? (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={submitCollect}>
            <p>Enter the borrower collection code for {modal.loan.assetName}.</p>
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
            <button type="submit" disabled={pending}>
              Authorise collection
            </button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "return" ? (
        <Modal title={modal.title} onClose={() => setModal(null)}>
          <form className="assetForm" onSubmit={submitReturn}>
            <p>Enter the borrower return code for {modal.loan.assetName}.</p>
            <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} required />
            <label className="assetCheckbox">
              <input type="checkbox" checked={Boolean(form.damaged)} onChange={(event) => setForm({ ...form, damaged: event.target.checked })} />
              <span>Returned damaged</span>
            </label>
            {form.damaged ? (
              <>
                <label>
                  Damage description
                  <textarea value={form.damageDescription || ""} onChange={(event) => setForm({ ...form, damageDescription: event.target.value })} />
                </label>
                <label>
                  Damage charge, GBP
                  <input value={form.damageCharge || ""} onChange={(event) => setForm({ ...form, damageCharge: event.target.value })} placeholder="0.00" />
                </label>
              </>
            ) : null}
            <button type="submit" disabled={pending}>
              Record return
            </button>
          </form>
        </Modal>
      ) : null}

      {modal?.type === "damage" ? (
        <Modal title={modal.title} onClose={() => setModal(null)}>
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
        <Modal title={modal.title} onClose={() => setModal(null)}>
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
        <Modal title={modal.title} onClose={() => setModal(null)}>
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
        <Modal title={modal.title} onClose={() => setModal(null)}>
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
        <Modal title={modal.title} onClose={() => setModal(null)}>
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
          <WeeklyAvailabilityEditor form={form} setForm={setForm} />
          <DateRangeCalendar
            label="Optional available date ranges. Blank means indefinite."
            value={form.dateRanges || ""}
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

function DateRangeCalendar({ label, value, onChange, blockedRanges = [], replaceOnSelect = false }) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [start, setStart] = useState(null);
  const [hover, setHover] = useState(null);
  const ranges = parseRangeLines(value);
  const days = calendarDays(month);

  function commit(day) {
    const picked = dateOnly(day);
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
      new Date(proposed.start).getTime() <= new Date(range.end).getTime() &&
      new Date(proposed.end).getTime() >= new Date(range.start).getTime()
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
          const selected = ranges.some((range) => inDateSpan(day, range.start, range.end));
          const preview = start && hover && inDateSpan(day, start, hover);
          const blocked = blockedRanges.some((range) => inDateSpan(day, range.start, range.end));
          return (
            <button
              key={current}
              type="button"
              className={`calendarDay ${day.getMonth() !== month.getMonth() ? "calendarFaded" : ""} ${selected ? "calendarSelected" : ""} ${preview ? "calendarPreview" : ""} ${blocked ? "calendarBlocked" : ""}`}
              onMouseEnter={() => setHover(current)}
              onFocus={() => setHover(current)}
              onClick={() => !blocked && commit(day)}
              disabled={blocked}
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
          </article>
        ))}
      </div>
      {!assets.length ? <p className="assetMuted">No assets are currently physically present.</p> : null}
    </section>
  );
}

function LoanGantt({ loans = [] }) {
  const visible = loans.filter((loan) => ["reserved", "collected"].includes(loan.status));
  if (!visible.length) return <p className="assetMuted">No active or upcoming loans to chart.</p>;

  const starts = visible.map((loan) => new Date(loan.collectionAt).getTime()).filter(Number.isFinite);
  const ends = visible.map((loan) => new Date(loan.returnDueAt).getTime()).filter(Number.isFinite);
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
        const left = Math.max(0, ((new Date(loan.collectionAt).getTime() - min) / span) * 100);
        const width = Math.max(2, ((new Date(loan.returnDueAt).getTime() - new Date(loan.collectionAt).getTime()) / span) * 100);
        return (
          <div key={loan.id} className="loanGanttRow">
            <span className="loanGanttLabel">{loan.assetName}</span>
            <div className="loanGanttTrack">
              <span
                className={`loanGanttBar ${loan.status === "collected" ? "loanGanttActive" : "loanGanttUpcoming"}`}
                style={{ left: `${left}%`, width: `${Math.min(width, 100 - left)}%` }}
                title={`${loan.assetName}: ${formatDate(loan.collectionAt)} to ${formatDate(loan.returnDueAt)}`}
              >
                {loan.userEmail || loan.userId || loan.status}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AdminLoansView({ loans, tab, onTab, onCollect, onReturn, onExpire }) {
  const rows = tab === "active" ? loans.active || [] : loans.upcoming || [];
  return (
    <section className="panel assetStack">
      <div className="assetHeaderRow">
        <div>
          <h1>Asset loans</h1>
          <p>Active loans place overdue records at the top. Upcoming reservations are ordered by collection time.</p>
        </div>
        <button type="button" onClick={onExpire}>Cancel missed collections</button>
      </div>
      <div className="assetTabs">
        <button type="button" onClick={() => onTab("upcoming")}>Upcoming collections</button>
        <button type="button" onClick={() => onTab("active")}>Out of premises</button>
        <button type="button" onClick={() => onTab("timeline")}>Timeline</button>
      </div>
      {tab === "timeline" ? <LoanGantt loans={loans.all || [...(loans.upcoming || []), ...(loans.active || [])]} /> : null}
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
              <td>{formatDate(loan.collectionAt)}</td>
              <td>{formatDate(loan.returnDueAt)}</td>
              <td>{loan.overdue ? <StatusBadge tone="red">Overdue</StatusBadge> : loan.status}</td>
              <td>
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
