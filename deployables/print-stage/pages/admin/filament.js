import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useEffect, useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";

function grams(value) {
  return `${(Number(value) || 0).toFixed(2)} g`;
}

export default function FilamentPage() {
  const [payload, setPayload] = useState({ entries: [], totals: {} });
  useEffect(() => {
    fetch("/api/admin/filament").then((r) => r.json()).then(setPayload).catch(() => {});
  }, []);
  return (
    <SiteShell title="Filament tracking">
      <Head><title>Filament tracking | 3D Printer</title></Head>
      <div className="adminGrid">
        <section className="panel">
          <h1>Filament tracking</h1>
          <p className="assetMuted">Autoprint handoffs record the sliced filament grams here idempotently per file.</p>
          {Object.entries(payload.totals || {}).map(([type, total]) => <p key={type}><strong>{type}</strong>: {grams(total)}</p>)}
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
