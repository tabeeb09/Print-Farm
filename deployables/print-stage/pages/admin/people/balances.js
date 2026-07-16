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

  useEffect(() => {
    let active = true;

    async function loadBalances() {
      setPending(true);
      setError("");

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
                      {entry.debts?.length ? `${entry.debts.length} charge${entry.debts.length === 1 ? "" : "s"}` : "No charges"}
                    </span>
                  </div>
                </li>
              ))}
            </ol>
          ) : (
            <p style={{ color: "#666" }}>No visible balances found.</p>
          )}
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
