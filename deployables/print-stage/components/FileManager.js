"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FILAMENT_OPTIONS,
  FILAMENT_EXTRACT_VALUE,
  getEffectiveFilamentLabel,
  getPrintEligibility,
} from "../lib/printPolicy";

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
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatCurrency(minor, currency) {
  if (typeof minor !== "number" || Number.isNaN(minor)) {
    return "—";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: (currency || "gbp").toUpperCase(),
  }).format(minor / 100);
}

function PaymentModal({ file, onClose, onContinue, loading }) {
  if (!file?.paymentQuote) {
    return null;
  }

  const quote = file.paymentQuote;

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "grid",
        placeItems: "center",
        padding: "1rem",
        zIndex: 500,
      }}
    >
      <div
        style={{
          width: "min(40rem, 100%)",
          background: "#fff",
          border: "1px solid rgba(23,27,31,0.18)",
          padding: "1rem",
          display: "grid",
          gap: "0.9rem",
        }}
      >
        <div>
          <h3 style={{ margin: 0 }}>Pay before queueing print</h3>
          <p style={{ margin: "0.5rem 0 0", color: "#555" }}>{file.originalFilename}</p>
        </div>

        <div style={{ display: "grid", gap: "0.5rem" }}>
          {quote.lineItems.map((lineItem) => (
            <div
              key={`${lineItem.filamentType}-${lineItem.grams}`}
              style={{
                display: "grid",
                gridTemplateColumns: "1fr auto auto",
                gap: "0.75rem",
                alignItems: "center",
              }}
            >
              <strong>{lineItem.label}</strong>
              <span>{lineItem.grams.toFixed(2)} g</span>
              <span>{formatCurrency(lineItem.amountMinor, lineItem.currency)}</span>
            </div>
          ))}
        </div>

        <div style={{ borderTop: "1px solid rgba(0,0,0,0.08)", paddingTop: "0.75rem", display: "grid", gap: "0.35rem" }}>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Total grams</span>
            <strong>{quote.totalGrams.toFixed(2)} g</strong>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span>Total</span>
            <strong>{formatCurrency(quote.totalMinor, quote.currency)}</strong>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
          <button type="button" onClick={onClose} disabled={loading}>Close</button>
          <button type="button" onClick={onContinue} disabled={loading}>
            {loading ? "Preparing checkout..." : "Continue to Stripe Checkout"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function FileManager() {
  const fileInputRef = useRef(null);
  const [files, setFiles] = useState([]);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [printingId, setPrintingId] = useState(null);
  const [verifyingId, setVerifyingId] = useState(null);
  const [checkoutLoadingId, setCheckoutLoadingId] = useState(null);
  const [paymentTargetFile, setPaymentTargetFile] = useState(null);
  const [queueSummary, setQueueSummary] = useState({
    usedBytes: 0,
    uploadLimitBytes: null,
    remainingBytes: null,
  });
  const [actorState, setActorState] = useState({
    isQueueAdmin: false,
    paymentsEnabled: false,
  });
  const [nextCursor, setNextCursor] = useState(null);
  const [selectedFilament, setSelectedFilament] = useState("");
  const [fileFilamentEdits, setFileFilamentEdits] = useState({});

  async function loadFiles(cursor, append = false) {
    setLoading(true);
    setError(null);

    try {
      const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
      const response = await fetch(`/api/files${query}`, { cache: "no-store" });
      const payload = await response.json();

      if (!response.ok || !Array.isArray(payload.files)) {
        throw new Error(payload.error || "Failed to load files.");
      }

      setFiles((current) => (append ? [...current, ...payload.files] : payload.files));
      setFileFilamentEdits((current) => {
        const next = { ...current };
        for (const file of payload.files) {
          next[file.id] = file.filamentSelection || "";
        }
        return next;
      });
      setNextCursor(payload.nextCursor);
      setQueueSummary(payload.summary ?? { usedBytes: 0, uploadLimitBytes: null, remainingBytes: null });
      setActorState(payload.actor ?? { isQueueAdmin: false, paymentsEnabled: false });
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to load files.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadFiles();
  }, []);

  const selectedSummary = useMemo(() => {
    if (!selectedFile) {
      return "No file chosen";
    }

    return `${selectedFile.name} (${formatBytes(selectedFile.size)})`;
  }, [selectedFile]);

  function getPendingFilamentValue(file) {
    return fileFilamentEdits[file.id] ?? file.filamentSelection ?? "";
  }

  async function verifyFilamentForFile(fileId) {
    const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/verify-filament`, {
      method: "POST",
    });
    const payload = await response.json();

    if (!response.ok || !payload.file) {
      throw new Error(payload.error || "Failed to verify filament metadata.");
    }

    setFiles((current) => current.map((file) => (file.id === fileId ? payload.file : file)));
    return payload.file;
  }

  async function handleUpload() {
    const file = fileInputRef.current?.files?.[0] ?? selectedFile;
    const filamentSelection = selectedFilament;

    if (!file) {
      setError("Choose a file before uploading.");
      return;
    }

    if (!filamentSelection) {
      setError("Select a filament before uploading.");
      return;
    }

    setLoading(true);
    setError(null);
    setNotice(null);

    try {
      if (typeof queueSummary.remainingBytes === "number" && file.size > queueSummary.remainingBytes) {
        setNotice(`Upload limit exceeded. ${formatBytes(queueSummary.remainingBytes)} remaining for this account.`);
        setLoading(false);
        return;
      }

      const response = await fetch("/api/files/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type || undefined,
          sizeBytes: file.size,
          filamentSelection,
        }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.uploadUrl) {
        if ((payload.error || "").includes("Upload limit exceeded")) {
          setNotice(payload.error);
          setLoading(false);
          return;
        }

        throw new Error(payload.error || "Failed to create upload URL.");
      }

      const uploadResponse = await fetch(payload.uploadUrl, {
        method: payload.uploadMethod,
        headers: payload.uploadHeaders,
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error(`Upload failed (${uploadResponse.status}).`);
      }

      if (payload.file?.id) {
        try {
          await verifyFilamentForFile(payload.file.id);
        } catch (caught) {
          setNotice(
            caught instanceof Error
              ? `File uploaded, but backend processing failed: ${caught.message}`
              : "File uploaded, but backend processing failed.",
          );
        }
      }

      setSelectedFile(null);
      setSelectedFilament("");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      await loadFiles();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Upload failed.");
    } finally {
      setLoading(false);
    }
  }

  async function updatePrintState(fileId, method) {
    setPrintingId(fileId);
    setError(null);
    setNotice(null);

    try {
      const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/print`, {
        method,
      });
      const payload = await response.json();

      if (!response.ok || !payload.file) {
        throw new Error(payload.error || "Failed to update print status.");
      }

      setFiles((current) => current.map((file) => (file.id === fileId ? payload.file : file)));
      await loadFiles();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Print request failed.");
    } finally {
      setPrintingId(null);
    }
  }

  async function handleRequestPrint(fileId) {
    await updatePrintState(fileId, "POST");
  }

  async function handleCancelPrint(fileId) {
    await updatePrintState(fileId, "DELETE");
  }

  async function handleDownload(fileId) {
    setDownloadingId(fileId);
    setError(null);

    try {
      const response = await fetch(`/api/files/${encodeURIComponent(fileId)}/download-url`, {
        cache: "no-store",
      });
      const payload = await response.json();

      if (!response.ok || !payload.downloadUrl) {
        throw new Error(payload.error || "Failed to create download URL.");
      }

      window.open(payload.downloadUrl, "_blank", "noopener,noreferrer");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Download failed.");
    } finally {
      setDownloadingId(null);
    }
  }

  async function handleDelete(fileId) {
    setDeletingId(fileId);
    setError(null);

    try {
      const response = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
        method: "DELETE",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to delete file.");
      }

      setFiles((current) => current.filter((file) => file.id !== fileId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Delete failed.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleFilamentChange(fileId, filamentSelection) {
    setError(null);
    setNotice(null);
    setVerifyingId(fileId);
    setFileFilamentEdits((current) => ({ ...current, [fileId]: filamentSelection }));

    try {
      const response = await fetch(`/api/files/${encodeURIComponent(fileId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filamentSelection }),
      });
      const payload = await response.json();

      if (!response.ok || !payload.file) {
        throw new Error(payload.error || "Failed to update filament.");
      }

      setFiles((current) => current.map((file) => (file.id === fileId ? payload.file : file)));
      setFileFilamentEdits((current) => ({ ...current, [fileId]: payload.file.filamentSelection || "" }));
      try {
        await verifyFilamentForFile(fileId);
      } catch (caught) {
        setNotice(
          caught instanceof Error
            ? `Filament updated, but backend processing failed: ${caught.message}`
            : "Filament updated, but backend processing failed.",
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to update filament.");
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleVerifyFilament(fileId) {
    setVerifyingId(fileId);
    setError(null);
    setNotice(null);

    try {
      await verifyFilamentForFile(fileId);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Filament verification failed.");
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleStartPayment(file) {
    setCheckoutLoadingId(file.id);
    setError(null);

    try {
      const response = await fetch(`/api/files/${encodeURIComponent(file.id)}/checkout-session`, {
        method: "POST",
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Failed to start payment.");
      }

      if (payload.alreadyPaid) {
        setPaymentTargetFile(null);
        await loadFiles();
        return;
      }

      if (!payload.checkoutUrl) {
        throw new Error("Stripe did not return a checkout URL.");
      }

      window.location.assign(payload.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Failed to start payment.");
    } finally {
      setCheckoutLoadingId(null);
    }
  }

  return (
    <div style={{ display: "grid", gap: "1.25rem" }}>
      <section className="panel">
        <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Upload model</h2>
        <p style={{ margin: 0, color: "#555" }}>
          Used: <strong>{formatBytes(queueSummary.usedBytes)}</strong> · Remaining: <strong>{formatBytes(queueSummary.remainingBytes)}</strong>
        </p>
        {!actorState.paymentsEnabled ? (
          <p style={{ margin: 0, color: "#8a6500" }}>
            Checkout is currently unavailable. Models can still be uploaded and prepared for later submission.
          </p>
        ) : null}
        <input
          ref={fileInputRef}
          type="file"
          accept=".3mf,.stl,.obj,.step,.stp,.iges,.igs,.ply,.amf"
          onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
          disabled={loading}
        />
        <label style={{ display: "grid", gap: "0.35rem" }}>
          <span style={{ fontWeight: 600 }}>Filament</span>
          <select value={selectedFilament} onChange={(event) => setSelectedFilament(event.target.value)} disabled={loading}>
            <option value="">Select filament</option>
            {FILAMENT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        {selectedFilament === FILAMENT_EXTRACT_VALUE ? (
          <p style={{ margin: 0, color: "#555" }}>
            Advanced mode expects an unsliced Orca project 3MF. The backend keeps the embedded
            material mapping, slices it server-side, and calculates a per-filament breakdown.
          </p>
        ) : null}
        <p style={{ margin: 0, color: "#555" }}>{selectedSummary}</p>
        <div>
          <button type="button" onClick={handleUpload} disabled={loading}>{loading ? "Working..." : "Upload"}</button>
        </div>
        {notice ? (
          <div role="alertdialog" aria-modal="true" style={{ border: "1px solid rgba(164,0,0,0.2)", background: "#fff4f4", padding: "0.9rem", display: "grid", gap: "0.75rem" }}>
            <strong>Notice</strong>
            <p style={{ margin: 0, color: "#7a0000" }}>{notice}</p>
            <div><button type="button" onClick={() => setNotice(null)}>Close</button></div>
          </div>
        ) : null}
        {error ? <p style={{ margin: 0, color: "#a40000" }}>{error}</p> : null}
      </section>

      <section className="panel panelWide">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: "1.2rem" }}>Your print jobs</h2>
          <button type="button" onClick={() => loadFiles()} disabled={loading}>Reload</button>
        </div>

        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "1rem" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Filename</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Filament</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Size</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Status</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Created</th>
              <th style={{ textAlign: "left", padding: "0.5rem 0" }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {files.length ? (
              files.map((file) => {
                const effectiveSelection = getPendingFilamentValue(file);
                const fileWithPendingSelection = { ...file, filamentSelection: effectiveSelection };
                const printEligibility = getPrintEligibility(fileWithPendingSelection);
                const needsProcessingCheck = file.extractionStatus !== "verified";
                const paymentRequired = file.paymentStatus !== "paid";
                const quote = file.paymentQuote;

                return (
                  <tr key={file.id} style={{ borderTop: "1px solid rgba(0,0,0,0.08)" }}>
                    <td style={{ padding: "0.65rem 0" }}>{file.originalFilename}</td>
                    <td style={{ padding: "0.65rem 0", minWidth: "16rem" }}>
                      <div style={{ display: "grid", gap: "0.4rem" }}>
                        <select value={effectiveSelection} onChange={(event) => handleFilamentChange(file.id, event.target.value)}>
                          <option value="">Select filament</option>
                          {FILAMENT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <small style={{ color: "#555" }}>{getEffectiveFilamentLabel(fileWithPendingSelection)}</small>
                        {Array.isArray(file.extractedFilamentBreakdown) && file.extractedFilamentBreakdown.length ? (
                          <div style={{ display: "grid", gap: "0.2rem" }}>
                            {file.extractedFilamentBreakdown.map((entry) => (
                              <small key={`${file.id}-${entry.filamentType}-${entry.grams}`} style={{ color: "#555" }}>
                                {entry.filamentType}: {entry.grams.toFixed(2)} g
                              </small>
                            ))}
                          </div>
                        ) : null}
                        {file.extractionStatus === "verified" && typeof file.extractedGrams === "number" ? (
                          <small style={{ color: "#555" }}>Filament mass: {file.extractedGrams.toFixed(2)} g</small>
                        ) : null}
                        {quote ? (
                          <small style={{ color: "#555" }}>Price: {formatCurrency(quote.totalMinor, quote.currency)}</small>
                        ) : null}
                        {file.paymentStatus === "paid" ? (
                          <small style={{ color: "#2d6a4f" }}>Payment received</small>
                        ) : !actorState.paymentsEnabled ? (
                          <small style={{ color: "#8a6500" }}>Checkout is not configured yet</small>
                        ) : file.paymentStatus === "checkout_pending" ? (
                          <small style={{ color: "#8a6500" }}>Checkout started, payment still pending</small>
                        ) : (
                          <small style={{ color: "#8a6500" }}>Payment required before joining the print queue</small>
                        )}
                        {file.extractionStatus === "failed" && file.extractionError ? (
                          <small style={{ color: "#a40000" }}>{file.extractionError}</small>
                        ) : null}
                      </div>
                    </td>
                    <td style={{ padding: "0.65rem 0" }}>{formatBytes(file.sizeBytes)}</td>
                    <td style={{ padding: "0.65rem 0", textTransform: "capitalize" }}>
                      {file.printStatus && file.printStatus !== "idle"
                        ? file.printStatus === "printing"
                          ? "Being printed"
                          : "In queue"
                        : file.status}
                    </td>
                    <td style={{ padding: "0.65rem 0" }}>{formatDate(file.createdAt)}</td>
                    <td style={{ padding: "0.65rem 0", display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
                      <button type="button" onClick={() => handleDownload(file.id)} disabled={downloadingId === file.id}>
                        {downloadingId === file.id ? "Preparing..." : "Download"}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(file.id)}
                        disabled={deletingId === file.id || (file.printStatus && file.printStatus !== "idle")}
                      >
                        {deletingId === file.id ? "Deleting..." : "Delete"}
                      </button>
                      {file.printStatus === "idle" || !file.printStatus ? (
                        <>
                          {needsProcessingCheck ? (
                            <button type="button" onClick={() => handleVerifyFilament(file.id)} disabled={verifyingId === file.id}>
                              {verifyingId === file.id ? "Processing..." : "Process file"}
                            </button>
                          ) : null}
                          {paymentRequired ? (
                            <button
                              type="button"
                              onClick={() => setPaymentTargetFile(file)}
                              disabled={checkoutLoadingId === file.id || !printEligibility.canPrint || !quote || !actorState.paymentsEnabled}
                              title={printEligibility.reason || undefined}
                            >
                              {checkoutLoadingId === file.id ? "Preparing..." : "Pay to print"}
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleRequestPrint(file.id)}
                              disabled={printingId === file.id || !printEligibility.canPrint}
                              title={printEligibility.reason || undefined}
                            >
                              {printingId === file.id ? "Queueing..." : "Print"}
                            </button>
                          )}
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleCancelPrint(file.id)}
                          disabled={printingId === file.id || (file.printStatus === "printing" && !actorState.isQueueAdmin)}
                          title={
                            file.printStatus === "printing" && !actorState.isQueueAdmin
                              ? "Only an admin can cancel a file once printing has started."
                              : undefined
                          }
                        >
                          {file.printStatus === "printing"
                            ? printingId === file.id
                              ? "Updating..."
                              : "Being printed"
                            : printingId === file.id
                              ? "Updating..."
                              : "Cancel print"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={6} style={{ padding: "0.9rem 0", color: "#666" }}>No print jobs uploaded yet.</td>
              </tr>
            )}
          </tbody>
        </table>

        {nextCursor ? (
          <div style={{ marginTop: "1rem" }}>
            <button type="button" onClick={() => loadFiles(nextCursor, true)} disabled={loading}>Load more</button>
          </div>
        ) : null}
      </section>

      <PaymentModal
        file={paymentTargetFile}
        loading={paymentTargetFile ? checkoutLoadingId === paymentTargetFile.id : false}
        onClose={() => setPaymentTargetFile(null)}
        onContinue={() => paymentTargetFile && handleStartPayment(paymentTargetFile)}
      />
    </div>
  );
}
