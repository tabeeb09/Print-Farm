import Head from "next/head";
import { getServerSession } from "next-auth/next";
import { useState } from "react";

import SiteShell from "../../components/SiteShell";
import { toFileActor } from "../../lib/auth";
import { authOptions } from "../../lib/authOptions";
import { getAppRolePresets } from "../../lib/openbaoPresets";

function downloadText(filename, text) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export default function AppRolesPage({ presets }) {
  const [presetId, setPresetId] = useState(presets[0]?.id || "");
  const [roleName, setRoleName] = useState(presets[0]?.roleName || "print-worker");
  const [secretPath, setSecretPath] = useState(presets[0]?.secretPath || "print/prod");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  function selectPreset(nextPresetId) {
    setPresetId(nextPresetId);
    const preset = presets.find((item) => item.id === nextPresetId);
    if (preset) {
      setRoleName(preset.roleName);
      setSecretPath(preset.secretPath);
    }
  }

  async function mintCredential(event) {
    event.preventDefault();
    setPending(true);
    setError("");
    setResult(null);

    try {
      const response = await fetch("/api/admin/approles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetId: presetId || undefined,
          roleName,
          secretPath,
        }),
      });
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error || "Minting failed.");
      }

      setResult(payload);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Minting failed.");
    } finally {
      setPending(false);
    }
  }

  return (
    <SiteShell title="OpenBao AppRoles">
      <Head>
        <title>OpenBao AppRoles | 3D Printer</title>
      </Head>

      <div style={{ maxWidth: "68rem", margin: "0 auto", display: "grid", gap: "1.25rem" }}>
        <section className="panel">
          <h1 style={{ margin: 0 }}>Mint worker AppRole credentials</h1>
          <p style={{ margin: 0, maxWidth: "50rem", color: "#555" }}>
            Create a read-only OpenBao AppRole for a single KV secret path. The SecretID is returned
            once so it can be installed on a worker machine without giving that machine OpenBao admin
            privileges.
          </p>
        </section>

        <section className="panel">
          <form onSubmit={mintCredential} style={{ display: "grid", gap: "1rem" }}>
            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Safe preset</span>
              <select value={presetId} onChange={(event) => selectPreset(event.target.value)}>
                {presets.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.label}
                  </option>
                ))}
                <option value="">Custom read-only path</option>
              </select>
            </label>

            {presetId ? (
              <p style={{ margin: 0, color: "#666" }}>
                {presets.find((preset) => preset.id === presetId)?.description}
              </p>
            ) : null}

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>Role name</span>
              <input
                value={roleName}
                onChange={(event) => setRoleName(event.target.value)}
                placeholder="print-worker"
                pattern="[a-z][a-z0-9-]{2,62}"
                required
              />
            </label>

            <label style={{ display: "grid", gap: "0.35rem" }}>
              <span>KV secret path</span>
              <input
                value={secretPath}
                onChange={(event) => setSecretPath(event.target.value)}
                placeholder="print/prod"
                required
              />
            </label>

            <div
              style={{
                border: "1px solid rgba(137, 91, 0, 0.25)",
                background: "#fff8e8",
                padding: "0.8rem",
                color: "#5b3b00",
              }}
            >
              This creates or updates a read-only policy for exactly this path, then mints a new
              SecretID. If the file is pasted into chat, committed, or copied to the wrong machine,
              rotate it.
            </div>

            <button type="submit" disabled={pending}>
              {pending ? "Minting..." : "Mint AppRole"}
            </button>
          </form>
        </section>

        {error ? (
          <section className="panel" role="alert" style={{ borderColor: "rgba(164, 0, 0, 0.25)" }}>
            <strong>Minting failed</strong>
            <p style={{ marginBottom: 0 }}>{error}</p>
          </section>
        ) : null}

        {result ? (
          <section className="panel" style={{ display: "grid", gap: "0.85rem" }}>
            <div>
              <h2 style={{ margin: 0 }}>Credential created</h2>
              <p style={{ margin: "0.35rem 0 0", color: "#555" }}>
                Role <strong>{result.roleName}</strong> can read <strong>{result.secretPath}</strong>.
                The SecretID is shown once.
              </p>
            </div>

            <textarea
              readOnly
              value={result.envFile}
              rows={8}
              style={{ width: "100%", fontFamily: "monospace" }}
            />

            <button
              type="button"
              onClick={() => downloadText(`${result.roleName}-openbao-approle.env`, result.envFile)}
            >
              Download openbao-approle.env
            </button>
          </section>
        ) : null}
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
        destination: "/api/auth/signin?callbackUrl=%2Fadmin%2Fapproles",
        permanent: false,
      },
    };
  }

  if (!actor.isOpenBaoAdmin) {
    return {
      notFound: true,
    };
  }

  return {
    props: {
      presets: getAppRolePresets(),
    },
  };
}
