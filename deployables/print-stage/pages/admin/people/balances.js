import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useRouter } from "next/router";
import { useEffect, useState } from "react";

import SiteShell from "../../../components/SiteShell";
import { toFileActor } from "../../../lib/auth";
import { authOptions } from "../../../lib/authOptions";

function formatMoney(pence) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format((Number(pence || 0) || 0) / 100);
}

export default function PeopleBalancesPage() {
  const router = useRouter();
  const [balances, setBalances] = useState([]);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ amount: "", description: "" });

  function parsePounds(value) {
    const parsed = Number.parseFloat(String(value || "").trim());
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
  }

  useEffect(() => {
    let active = true;

    async function loadBalances() {
      setPending(true);
      setError("");
      setMessage("");

      try {
        const response = await fetch("/api/admin/people/balances");
        const payload = await response.json();

        if (!response.ok) {
          throw new Error(payload.error || "Unable to load balances.");
        }

        if (active) {
          setBalances(payload.balances || []);
        }
      } catch (caught) {
        if (active) {
          setError(caught instanceof Error ? caught.message : "Unable to load balances.");
        }
      } finally {
        if (active) {
          setPending(false);
        }
      }
    }

    loadBalances();
    return () => {
      active = false;
    };
  }, []);

  function openAdjustment(entry, adjustmentType) {
    setForm({ amount: "", description: "" });
    setModal({ entry, adjustmentType });
    setError("");
    setMessage("");
  }

  async function submitAdjustment(event) {
    event.preventDefault();
    if (!modal?.entry) return;

    setPending(true);
    setError("");
    setMessage("");

    try {
      const response = await fetch("/api/admin/people/balances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: modal.entry.user.id,
          userEmail: modal.entry.user.email,
          adjustmentType: modal.adjustmentType,
          amountPence: parsePounds(form.amount),
          description: form.description,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Unable to update balance.");
      }

      setBalances(payload.balances || []);
      setMessage(`${modal.adjustmentType === "refund" ? "Refund" : "Surcharge"} recorded for ${modal.entry.user.email}.`);
      setModal(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to update balance.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SiteShell title="People balances">
      <Head>
        <title>People balances | 3D Printer</title>
      </Head>

      <div style={{ maxWidth: "72rem", margin: "0 auto", display: "grid", gap: "1.25rem" }}>
        <section className="panel" style={{ display: "grid", gap: "0.75rem" }}>
          <h1 style={{ margin: 0 }}>People balances</h1>
          <p style={{ margin: 0, maxWidth: "52rem", color: "#555" }}>
            Ordered from most indebted to least.
          </p>
          <div>
            <button type="button" onClick={() => router.push("/admin/people")}>
              Back to people
            </button>
          </div>
        </section>

        {error ? (
          <section className="panel" role="alert" style={{ borderColor: "rgba(164, 0, 0, 0.25)" }}>
            <strong>Could not load balances</strong>
            <p style={{ marginBottom: 0 }}>{error}</p>
          </section>
        ) : null}

        {message ? (
          <section className="panel" role="status" style={{ borderColor: "rgba(0, 110, 70, 0.25)" }}>
            {message}
          </section>
        ) : null}

        <section className="panel panelWide">
          {pending ? (
            <p style={{ color: "#666" }}>Loading balances...</p>
          ) : balances.length ? (
            <ol style={{ margin: 0, paddingLeft: "1.5rem", display: "grid", gap: "0.75rem" }}>
              {balances.map((entry) => (
                <li key={entry.user.id} style={{ paddingLeft: "0.25rem" }}>
                  <div style={{ display: "grid", gap: "0.2rem" }}>
                    <strong>{entry.user.email}</strong>
                    <span>
                      Balance: <strong>{formatMoney(entry.balancePence)}</strong>
                    </span>
                    <span style={{ color: "#666" }}>
                      {entry.transactions?.length ? `${entry.transactions.length} transaction${entry.transactions.length === 1 ? "" : "s"}` : "No transactions"}
                    </span>
                    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginTop: "0.3rem" }}>
                      <button type="button" onClick={() => openAdjustment(entry, "surcharge")}>
                        Add surcharge
                      </button>
                      <button type="button" onClick={() => openAdjustment(entry, "refund")}>
                        Add refund
                      </button>
                    </div>
                    {entry.transactions?.length ? (
                      <details style={{ marginTop: "0.35rem" }}>
                        <summary>Transactions</summary>
                        <ul style={{ marginBottom: 0, display: "grid", gap: "0.25rem" }}>
                          {entry.transactions.slice(0, 8).map((transaction) => (
                            <li key={transaction.id}>
                              {formatMoney(transaction.amountPence)} - {transaction.description || transaction.reason || "Account transaction"}
                            </li>
                          ))}
                        </ul>
                      </details>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: "#666" }}>No visible balances found.</p>
          )}
        </section>
      </div>

      {modal ? (
        <div className="assetModalBackdrop" role="presentation">
          <section className="assetModal" role="dialog" aria-modal="true" aria-label="Balance adjustment">
            <div className="assetModalHeader">
              <h2>{modal.adjustmentType === "refund" ? "Add refund" : "Add surcharge"}</h2>
              <button type="button" onClick={() => setModal(null)}>
                Close
              </button>
            </div>
            <form className="assetForm" onSubmit={submitAdjustment}>
              <p style={{ marginTop: 0 }}>{modal.entry.user.email}</p>
              <label>
                Amount, GBP
                <input
                  value={form.amount}
                  onChange={(event) => setForm({ ...form, amount: event.target.value })}
                  placeholder="5.00"
                  required
                />
              </label>
              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => setForm({ ...form, description: event.target.value })}
                  placeholder="Brief reason shown in the user's transactions tab"
                  required
                />
              </label>
              <button type="submit" disabled={pending}>
                Save adjustment
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </SiteShell>
  );
}

export async function getServerSideProps(context) {
  const session = await getServerSession(context.req, context.res, authOptions);
  const actor = toFileActor(session);

  if (!actor) {
    return {
      redirect: {
        destination: "/api/auth/signin?callbackUrl=%2Fadmin%2Fpeople%2Fbalances",
        permanent: false,
      },
    };
  }

  if (!actor.isHrAdmin) {
    return {
      notFound: true,
    };
  }

  return {
    props: {},
  };
}
