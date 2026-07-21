import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useEffect, useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";
import { FILAMENT_EXTRACT_VALUE, FILAMENT_OPTIONS } from "../../lib/printPolicy";

function grams(value) {
  return `${(Number(value) || 0).toFixed(2)} g`;
}

export default function FilamentPage() {
  const [payload, setPayload] = useState({ entries: [], totals: {}, filaments: [] });
  const [form, setForm] = useState({ name: "", filamentType: "PLA", color: "", vendor: "", gramsAvailable: 1000, notes: "" });
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  async function load() {
    const response = await fetch("/api/admin/filament");
    const next = await response.json();
    if (response.ok) setPayload(next);
  }

  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function save(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/admin/filament", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Unable to save filament.");
      setPayload(next);
      setForm({ name: "", filamentType: "PLA", color: "", vendor: "", gramsAvailable: 1000, notes: "" });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save filament.");
    } finally {
      setPending(false);
    }
  }

  async function remove(id) {
    if (!window.confirm("Remove this filament stock record? Usage history is preserved.")) return;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/filament?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const next = await response.json();
      if (!response.ok) throw new Error(next.error || "Unable to remove filament.");
      setPayload(next);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to remove filament.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SiteShell title="Filament tracking">
      <Head><title>Filament tracking | 3D Printer</title></Head>
      <div className="adminGrid">
        <section className="panel">
          <h1>Filament tracking</h1>
          <p className="assetMuted">Completed print jobs record final filament grams here idempotently per file.</p>
          {Object.entries(payload.totals || {}).map(([type, total]) => <p key={type}><strong>{type}</strong>: {grams(total)}</p>)}
        </section>
        <section className="panel">
          <h2 style={{ marginTop: 0 }}>Add filament stock</h2>
          <form className="assetForm" onSubmit={save}>
            <label>
              Name
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="PLA black spool" required />
            </label>
            <label>
              Filament type
              <select value={form.filamentType} onChange={(event) => setForm({ ...form, filamentType: event.target.value })} required>
                {FILAMENT_OPTIONS.filter((option) => option.value !== FILAMENT_EXTRACT_VALUE).map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </label>
            <label>
              Grams available
              <input type="number" min="0.01" step="0.01" value={form.gramsAvailable} onChange={(event) => setForm({ ...form, gramsAvailable: event.target.value })} required />
            </label>
            <label>
              Colour
              <input value={form.color} onChange={(event) => setForm({ ...form, color: event.target.value })} />
            </label>
            <label>
              Vendor
              <input value={form.vendor} onChange={(event) => setForm({ ...form, vendor: event.target.value })} />
            </label>
            <label>
              Notes
              <textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} />
            </label>
            {error ? <p style={{ color: "#a40000", margin: 0 }}>{error}</p> : null}
            <button type="submit" disabled={pending}>{pending ? "Saving..." : "Add filament"}</button>
          </form>
        </section>
        <section className="panel panelWide">
          <h2 style={{ marginTop: 0 }}>Filament stock</h2>
          <table className="assetTable">
            <thead><tr><th>Name</th><th>Type</th><th>Colour</th><th>Starting</th><th>Used</th><th>Remaining</th><th>Actions</th></tr></thead>
            <tbody>{(payload.filaments || []).map((filament) => (
              <tr key={filament.id}>
                <td>{filament.name}</td>
                <td>{filament.filamentType}</td>
                <td>{filament.color || "-"}</td>
                <td>{grams(filament.startingGrams)}</td>
                <td>{grams(filament.usedGrams)}</td>
                <td>{grams(filament.remainingGrams)}</td>
                <td><button type="button" onClick={() => remove(filament.id)} disabled={pending}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table>
          {!(payload.filaments || []).length ? <p className="assetMuted">No filament stock has been added yet.</p> : null}
        </section>
        <section className="panel panelWide">
          <table className="assetTable">
            <thead><tr><th>File</th><th>Printer</th><th>Total</th><th>Breakdown</th><th>Recorded</th></tr></thead>
            <tbody>{(payload.entries || []).map((entry) => (
              <tr key={entry.fileId}><td>{entry.originalFilename}</td><td>{entry.printerLabel || entry.printerId || "—"}</td><td>{grams(entry.totalGrams)}</td><td>{(entry.breakdown || []).map((item) => `${item.filamentType}: ${grams(item.grams)}`).join(", ")}</td><td>{entry.recordedAt}</td></tr>
            ))}</tbody>
          </table>
        </section>
      </div>
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const actor = toFileActor(await getServerSession(context.req, context.res, authOptions));
  if (!actor) return { redirect: { destination: "/auth/signin?callbackUrl=%2Fadmin%2Ffilament", permanent: false } };
  if (!actor.isQueueAdmin) return { notFound: true };
  return { props: {} };
}
