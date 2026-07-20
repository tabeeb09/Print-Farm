import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useEffect, useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";

const EMPTY = { label: "", host: "", serial: "", accessCode: "", lanPort: 6000, ftpPort: 990, amsSlot: "", sslFtp: false, sslMqtt: false, active: true };

export default function PrintersPage() {
  const [payload, setPayload] = useState({ printers: [] });
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState("");

  async function load() {
    const response = await fetch("/api/admin/printers");
    const next = await response.json();
    if (!response.ok) throw new Error(next.error || "Failed to load printers.");
    setPayload(next);
  }

  useEffect(() => {
    load().catch((caught) => setError(caught.message));
  }, []);

  async function save(event) {
    event.preventDefault();
    setError("");
    const response = await fetch("/api/admin/printers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const next = await response.json();
    if (!response.ok) return setError(next.error || "Failed to save printer.");
    setPayload(next);
    setForm(EMPTY);
  }

  async function remove(id) {
    const response = await fetch(`/api/admin/printers?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    const next = await response.json();
    if (!response.ok) return setError(next.error || "Failed to delete printer.");
    setPayload(next);
  }

  function edit(printer) {
    setForm({ ...EMPTY, ...printer, accessCode: "", active: payload.activePrinterId === printer.id });
  }

  return (
    <SiteShell title="Printers">
      <Head><title>Printers | 3D Printer</title></Head>
      <div className="adminGrid">
        <section className="panel">
          <h1>Printers</h1>
          <p className="assetMuted">Configure LAN printers used by the autoprint worker. Existing LAN access codes are hidden; leave blank only when editing a printer that already has one.</p>
          {error ? <p className="assetErrorInline">{error}</p> : null}
          <form className="assetForm" onSubmit={save}>
            <label>Label<input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} required /></label>
            <label>LAN IP / host<input value={form.host} onChange={(e) => setForm({ ...form, host: e.target.value })} required /></label>
            <label>Serial / device ID<input value={form.serial} onChange={(e) => setForm({ ...form, serial: e.target.value })} required /></label>
            <label>LAN access code<input value={form.accessCode} onChange={(e) => setForm({ ...form, accessCode: e.target.value })} placeholder={form.id ? "Stored if left blank" : ""} /></label>
            <label>LAN port<input type="number" value={form.lanPort} onChange={(e) => setForm({ ...form, lanPort: e.target.value })} /></label>
            <label>FTP port<input type="number" value={form.ftpPort} onChange={(e) => setForm({ ...form, ftpPort: e.target.value })} /></label>
            <label>AMS slot<input value={form.amsSlot} onChange={(e) => setForm({ ...form, amsSlot: e.target.value })} placeholder="Optional" /></label>
            <label className="assetCheckbox"><input type="checkbox" checked={form.sslFtp} onChange={(e) => setForm({ ...form, sslFtp: e.target.checked })} /> Use SSL for FTP</label>
            <label className="assetCheckbox"><input type="checkbox" checked={form.sslMqtt} onChange={(e) => setForm({ ...form, sslMqtt: e.target.checked })} /> Use SSL for MQTT</label>
            <label className="assetCheckbox"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Make active printer</label>
            <button type="submit">{form.id ? "Update printer" : "Add printer"}</button>
          </form>
        </section>
        <section className="panel panelWide">
          <table className="assetTable">
            <thead><tr><th>Printer</th><th>Host</th><th>Serial</th><th>Access</th><th>State</th><th>Actions</th></tr></thead>
            <tbody>
              {payload.printers?.map((printer) => (
                <tr key={printer.id}>
                  <td>{printer.label}</td>
                  <td>{printer.host}</td>
                  <td>{printer.serial}</td>
                  <td>{printer.hasAccessCode ? "Stored" : "Missing"}</td>
                  <td>{payload.activePrinterId === printer.id ? "Active" : "Standby"}</td>
                  <td><button type="button" onClick={() => edit(printer)}>Edit</button> <button type="button" onClick={() => remove(printer.id)}>Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const actor = toFileActor(await getServerSession(context.req, context.res, authOptions));
  if (!actor) return { redirect: { destination: "/auth/signin?callbackUrl=%2Fadmin%2Fprinters", permanent: false } };
  if (!actor.isQueueAdmin) return { notFound: true };
  return { props: {} };
}
