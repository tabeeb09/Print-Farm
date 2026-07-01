import { useEffect, useState } from "react";
import Head from "next/head";
import Link from "next/link";

import SiteShell from "../../components/SiteShell";

export default function PrintPaymentSuccessPage({ sessionId, fileId }) {
  const [status, setStatus] = useState("checking");
  const [message, setMessage] = useState("Checking payment status...");

  useEffect(() => {
    if (!sessionId || !fileId) {
      setStatus("error");
      setMessage("Missing payment session details.");
      return undefined;
    }

    let cancelled = false;
    let attempts = 0;

    const check = async () => {
      attempts += 1;

      try {
        const response = await fetch(
          `/api/stripe/checkout-session?session_id=${encodeURIComponent(sessionId)}&file_id=${encodeURIComponent(fileId)}`,
          { cache: "no-store" },
        );
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Failed to verify payment status.");
        }

        if (cancelled) {
          return;
        }

        if (payload.file?.paymentStatus === "paid") {
          setStatus("paid");
          setMessage("Payment confirmed. The file can now enter the print queue.");
          return;
        }

        if (attempts >= 10) {
          setStatus("pending");
          setMessage("Stripe returned successfully, but the payment has not been marked as paid yet. Return to your files and retry in a moment.");
          return;
        }

        setTimeout(check, 2000);
      } catch (error) {
        if (cancelled) {
          return;
        }

        setStatus("error");
        setMessage(error instanceof Error ? error.message : "Failed to verify payment status.");
      }
    };

    void check();

    return () => {
      cancelled = true;
    };
  }, [fileId, sessionId]);

  return (
    <SiteShell title="3D Printer">
      <Head>
        <title>Payment result | 3D Printer</title>
      </Head>

      <div style={{ maxWidth: "56rem", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section className="panel">
          <h1 style={{ margin: 0 }}>Payment received</h1>
          <p style={{ margin: 0, color: "#555" }}>
            Stripe has returned from Checkout. The backend is now verifying the payment and
            updating the file state so it can enter the print queue.
          </p>
          <p style={{ margin: 0, color: status === "error" ? "#a40000" : status === "paid" ? "#2d6a4f" : "#555" }}>
            {message}
          </p>
          <p style={{ margin: 0, color: "#555" }}>
            Session: <code>{sessionId || "unknown"}</code>
          </p>
          <p style={{ margin: 0, color: "#555" }}>
            File: <code>{fileId || "unknown"}</code>
          </p>
          <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
            <Link href={`/files${fileId ? `?file_id=${encodeURIComponent(fileId)}` : ""}`}>Back to files</Link>
          </div>
        </section>
      </div>
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  return {
    props: {
      sessionId: typeof context.query.session_id === "string" ? context.query.session_id : null,
      fileId: typeof context.query.file_id === "string" ? context.query.file_id : null,
    },
  };
}
