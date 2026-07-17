import Head from "next/head";
import { getServerSession } from "next-auth/next";

import SiteShell from "../components/SiteShell";
import { authOptions } from "../lib/authOptions";
import { toFileActor } from "../lib/auth";
import { listPrintQueue } from "../lib/s3Files";

function formatBytes(value) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return "—";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function PrintQueuePage({ files }) {
  async function markNextAsPrinting() {
    const response = await fetch("/api/print-queue", { method: "POST" });
    const payload = await response.json();

    if (!response.ok) {
      window.alert(payload.error || "Failed to update queue.");
      return;
    }

    window.location.reload();
  }

  function downloadQueueArtifact(fileId) {
    window.location.assign(`/api/print-queue/${encodeURIComponent(fileId)}/download`);
  }

  return (
    <SiteShell title="3D Printer">
      <Head>
        <title>Print queue | 3D Printer</title>
      </Head>

      <div style={{ maxWidth: "72rem", margin: "0 auto", display: "grid", gap: "1.25rem" }}>
        <section className="panel">
          <h1 style={{ margin: 0 }}>Print queue</h1>
          <p style={{ margin: 0, maxWidth: "48rem", color: "#555" }}>
            Files are ordered by print request time. The helper action marks the oldest queued file
            as being printed.
          </p>
          <div>
            <button type="button" onClick={markNextAsPrinting}>
              Mark next file as printing
            </button>
          </div>
        </section>

        <section className="panel panelWide">
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Source file</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Queued artifact</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Filament</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Owner</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Size</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Mass</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Print state</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Download</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Requested</th>
                <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Started</th>
              </tr>
            </thead>
            <tbody>
              {files.length ? (
                files.map((file) => (
                  <tr key={file.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <td style={{ padding: "0.65rem 0" }}>{file.originalFilename}</td>
                    <td style={{ padding: "0.65rem 0" }}>{file.gcodeFilename ?? "—"}</td>
                    <td style={{ padding: "0.65rem 0" }}>
                      {file.extractedFilamentType ?? file.filamentSelection ?? "—"}
                    </td>
                    <td style={{ padding: "0.65rem 0" }}>{file.ownerSub}</td>
                    <td style={{ padding: "0.65rem 0" }}>{formatBytes(file.sizeBytes)}</td>
                    <td style={{ padding: "0.65rem 0" }}>
                      {typeof file.extractedGrams === "number"
                        ? `${file.extractedGrams.toFixed(2)} g`
                        : "—"}
                    </td>
                    <td style={{ padding: "0.65rem 0", textTransform: "capitalize" }}>
                      {file.printStatus}
                    </td>
                    <td style={{ padding: "0.65rem 0" }}>
                      <button type="button" onClick={() => downloadQueueArtifact(file.id)}>
                        Download Gcode.3MF
                      </button>
                    </td>
                    <td style={{ padding: "0.65rem 0" }}>{formatDate(file.printRequestedAt)}</td>
                    <td style={{ padding: "0.65rem 0" }}>{formatDate(file.printStartedAt)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} style={{ padding: "0.9rem 0", color: "#666" }}>
                    No files are currently queued for printing.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return {
      redirect: {
        destination: "/auth/signin?callbackUrl=%2Fprint-queue",
        permanent: false,
      },
    };
  }

  if (!actor.isQueueAdmin) {
    return {
      notFound: true,
    };
  }

  const result = await listPrintQueue(actor);

  return {
    props: {
      files: result.files,
    },
  };
}
