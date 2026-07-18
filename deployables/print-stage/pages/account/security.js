import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useState } from "react";

import SiteShell from "../../components/SiteShell";
import { authOptions } from "../../lib/authOptions";

export default function AccountSecurityPage({ email }) {
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function requestPasswordEmail() {
    setPending(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/auth/change-password-email", {
        method: "POST",
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Unable to send password change email.");
      }

      setMessage(payload.message || "Password change email sent if this account supports password login.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to send password change email.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SiteShell title="Account security">
      <Head>
        <title>Account security | 3D Printer</title>
      </Head>

      <div style={{ maxWidth: "48rem", margin: "0 auto", display: "grid", gap: "1rem" }}>
        <section className="panel" style={{ display: "grid", gap: "0.75rem" }}>
          <p className="eyebrow" style={{ margin: 0 }}>Security</p>
          <h1 style={{ margin: 0 }}>Password change email</h1>
          <p style={{ margin: 0, color: "#555" }}>
            Signed in as <strong>{email}</strong>. Use this to send a one-time password-change link
            to your registered email address.
          </p>
          <div>
            <button type="button" onClick={requestPasswordEmail} disabled={pending}>
              {pending ? "Sending..." : "Send password change email"}
            </button>
          </div>
          {message ? <div className="assetMessage">{message}</div> : null}
          {error ? <div className="assetError">{error}</div> : null}
        </section>
      </div>
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);

  if (!session) {
    return {
      redirect: {
        destination: "/auth/signin?callbackUrl=%2Faccount%2Fsecurity",
        permanent: false,
      },
    };
  }

  return {
    props: {
      email: session.user?.email || "Signed-in account",
    },
  };
}
