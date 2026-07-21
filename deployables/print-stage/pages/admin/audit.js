import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useEffect, useMemo, useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";

export default function AuditPage() {
  const [events, setEvents] = useState([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const response = await fetch("/api/admin/audit?limit=500");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Unable to load audit events.");
      setEvents(payload.events || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load audit events.");
    }
  }

  useEffect(() => {
    load();
  }, []);

  const visibleEvents = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    if (!needle) return events;
    return events.filter((event) =>
      [
        event.at,
        event.actor?.email,
        event.actor?.sub,
        event.action,
        event.targetType,
        event.targetId,
        JSON.stringify(event.metadata || {}),
      ].some((value) => String(value || "").toLowerCase().includes(needle)),
    );
  }, [events, filter]);

  return (
    <SiteShell title="Audit log">
      <Head><title>Audit log | 3D Printer</title></Head>
      <section className="panel panelWide adminSingle">
        <div className="assetModalHeader">
          <div>
            <h1>Audit log</h1>
            <p className="assetMuted">Recent protected actions are stored with sensitive fields redacted.</p>
          </div>
          <button type="button" onClick={load}>Reload</button>
        </div>
        <label className="assetForm">
          Search action logs
          <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="actor, action, target, metadata" />
        </label>
        {error ? <p style={{ color: "#a40000" }}>{error}</p> : null}
        <table className="assetTable">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Metadata</th></tr></thead>
          <tbody>{visibleEvents.map((event) => (
            <tr key={event.id}>
              <td>{event.at}</td>
              <td>{event.actor?.email || event.actor?.sub || "-"}</td>
              <td>{event.action}</td>
              <td>{event.targetType || "-"} {event.targetId || ""}</td>
              <td><code>{JSON.stringify(event.metadata || {})}</code></td>
            </tr>
          ))}</tbody>
        </table>
        {!visibleEvents.length ? <p className="assetMuted">No audit events match this filter.</p> : null}
      </section>
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const actor = toFileActor(await getServerSession(context.req, context.res, authOptions));
  if (!actor) return { redirect: { destination: "/auth/signin?callbackUrl=%2Fadmin%2Faudit", permanent: false } };
  if (!actor.isQueueAdmin && !actor.isHrAdmin && !actor.isAssetAdmin) return { notFound: true };
  return { props: {} };
}
