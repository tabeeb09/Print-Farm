import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useEffect, useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";

export default function AuditPage() {
  const [events, setEvents] = useState([]);
  useEffect(() => {
    fetch("/api/admin/audit?limit=500").then((r) => r.json()).then((p) => setEvents(p.events || [])).catch(() => {});
  }, []);
  return (
    <SiteShell title="Audit log">
      <Head><title>Audit log | 3D Printer</title></Head>
      <section className="panel panelWide adminSingle">
        <h1>Audit log</h1>
        <table className="assetTable">
          <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Metadata</th></tr></thead>
          <tbody>{events.map((event) => (
            <tr key={event.id}><td>{event.at}</td><td>{event.actor?.email || event.actor?.sub || "—"}</td><td>{event.action}</td><td>{event.targetType || "—"} {event.targetId || ""}</td><td><code>{JSON.stringify(event.metadata || {})}</code></td></tr>
          ))}</tbody>
        </table>
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
