import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useEffect, useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";

export default function DiscountsPage() {
  const [payload, setPayload] = useState({ discounts: [], groups: [] });
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ groupId: "", percentOff: 10, description: "" });
  const selectedGroup = payload.groups?.find((group) => group.id === form.groupId);

  async function load() {
    const response = await fetch("/api/admin/discounts");
    const next = await response.json();
    if (response.ok) setPayload(next);
  }

  useEffect(() => { load(); }, []);

  async function save(event) {
    event.preventDefault();
    const response = await fetch("/api/admin/discounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...form, groupName: selectedGroup?.name }),
    });
    if (response.ok) {
      setModal(false);
      await load();
    }
  }

  async function remove(id) {
    await fetch(`/api/admin/discounts?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <SiteShell title="Discounts">
      <Head><title>Discounts | 3D Printer</title></Head>
      <section className="panel panelWide adminSingle">
        <div className="assetModalHeader">
          <div><h1>Group discounts</h1><p className="assetMuted">Apply a percentage discount rule to an existing people group.</p></div>
          <button type="button" onClick={() => setModal(true)}>Apply discount</button>
        </div>
        <table className="assetTable">
          <thead><tr><th>Group</th><th>Discount</th><th>Description</th><th>State</th><th>Actions</th></tr></thead>
          <tbody>{payload.discounts?.map((discount) => (
            <tr key={discount.id}><td>{discount.groupName}</td><td>{discount.percentOff}%</td><td>{discount.description || "—"}</td><td>{discount.active ? "Active" : "Inactive"}</td><td><button type="button" onClick={() => remove(discount.id)}>Delete</button></td></tr>
          ))}</tbody>
        </table>
      </section>
      {modal ? (
        <div className="assetModalBackdrop"><section className="assetModal">
          <div className="assetModalHeader"><h2>Apply discount</h2><button type="button" onClick={() => setModal(false)}>Close</button></div>
          <form className="assetForm" onSubmit={save}>
            <label>People group<select value={form.groupId} onChange={(e) => setForm({ ...form, groupId: e.target.value })} required><option value="">Select group</option>{payload.groups?.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label>
            <label>Discount percent<input type="number" min="1" max="100" value={form.percentOff} onChange={(e) => setForm({ ...form, percentOff: e.target.value })} required /></label>
            <label>Description<textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></label>
            <button type="submit">Save discount</button>
          </form>
        </section></div>
      ) : null}
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const actor = toFileActor(await getServerSession(context.req, context.res, authOptions));
  if (!actor) return { redirect: { destination: "/auth/signin?callbackUrl=%2Fadmin%2Fdiscounts", permanent: false } };
  if (!actor.isHrAdmin) return { notFound: true };
  return { props: {} };
}
