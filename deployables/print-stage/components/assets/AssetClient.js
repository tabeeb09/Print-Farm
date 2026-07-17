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
            <label>
              Collection date
              <input type="datetime-local" value={form.collectionAt} onChange={(event) => setForm({ ...form, collectionAt: event.target.value })} required />
            </label>
            <label>
              Return date
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
          <label>
            Collection windows, one per line as weekday,start,end. 1 is Monday, 0 is Sunday.
            <textarea value={form.weekly || ""} onChange={(event) => setForm({ ...form, weekly: event.target.value })} />
          </label>
          <label>
            Optional available date ranges, one per line as ISO start,ISO end. Blank means indefinite.
            <textarea value={form.dateRanges || ""} onChange={(event) => setForm({ ...form, dateRanges: event.target.value })} />
          </label>
        </>
      ) : null}
      <button type="submit" disabled={pending}>
        Save asset
      </button>
    </form>
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
      </div>
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

function MyLoansView({ groups, debts, onReschedule, onExtend, onLost }) {
  const order = ["overdue", "present", "future", "historical"];
  return (
    <section className="panel assetStack">
      <h1>My bookings</h1>
      {debts.length ? (
        <div className="assetDebt">
          Account charges: {formatMoney(debts.reduce((total, debt) => total + debt.amountPence, 0))}
        </div>
      ) : null}
      {order.map((group) => (
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
      ))}
    </section>
  );
}
