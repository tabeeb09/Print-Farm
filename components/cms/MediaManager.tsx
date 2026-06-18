"use client";

import { useEffect, useMemo, useState } from "react";

type MediaResponse = {
  bucket: string;
  prefix: string;
  folders: Array<{ prefix: string }>;
  objects: Array<{ key: string; size?: number; lastModified?: string; url: string }>;
};

function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error("Timed out"));
    }, timeoutMs);

    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function formatBytes(value?: number) {
  if (!value && value !== 0) {
    return "-";
  }

  if (value < 1024) {
    return `${value} B`;
  }

  if (value < 1024 * 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }

  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export default function MediaManager({
  initialPrefix,
  canWrite,
}: {
  initialPrefix: string;
  canWrite: boolean;
}) {
  const [prefix, setPrefix] = useState(initialPrefix);
  const [data, setData] = useState<MediaResponse | null>(null);
  const [status, setStatus] = useState("Loading media...");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploadKey, setUploadKey] = useState("");

  async function load(currentPrefix: string) {
    setStatus("Loading media...");
    setError("");

    const response = await fetch(`/api/cms/media/list?prefix=${encodeURIComponent(currentPrefix)}`);
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Failed to load media");
      setStatus("Media load failed");
      return;
    }

    setData(payload);
    setStatus("Media listing refreshed");
  }

  useEffect(() => {
    load(initialPrefix);
  }, [initialPrefix]);

  const suggestedKey = useMemo(() => {
    if (!file) {
      return prefix;
    }

    return `${prefix}${prefix && !prefix.endsWith("/") ? "/" : ""}${file.name}`.replace(/^\/+/, "");
  }, [file, prefix]);

  useEffect(() => {
    setUploadKey(suggestedKey);
  }, [suggestedKey]);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!file || !uploadKey) {
      setError("Select a file and key first.");
      return;
    }

    setStatus("Requesting upload URL...");
    setError("");

    const signedResponse = await fetch("/api/cms/media/upload-url", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: uploadKey, contentType: file.type || undefined }),
    });

    let signedPayload: { error?: string; uploadUrl?: string };

    try {
      signedPayload = await signedResponse.json();
    } catch {
      setError("Upload URL request returned a non-JSON response.");
      setStatus("Upload failed");
      return;
    }

    if (!signedResponse.ok) {
      setError(signedPayload.error ?? "Failed to create upload URL");
      setStatus("Upload failed");
      return;
    }

    setStatus("Uploading to RustFS...");

    try {
      const uploadResponse = await withTimeout(
        fetch(signedPayload.uploadUrl!, {
          method: "PUT",
          headers: file.type ? { "Content-Type": file.type } : {},
          body: file,
        }),
        30000,
      );

      if (!uploadResponse.ok) {
        throw new Error(`RustFS returned HTTP ${uploadResponse.status}.`);
      }
    } catch (uploadError) {
      const message =
        uploadError instanceof Error ? uploadError.message : "Unknown direct upload error.";

      setError(
        `Direct upload failed: ${message} Open the media endpoint once and accept the local TLS warning if this is a dev VM.`,
      );
      setStatus("Upload failed");
      return;
    }

    setFile(null);
    setStatus("Upload complete");
    await load(prefix);
  }

  async function handleDelete(key: string) {
    if (!window.confirm(`Delete ${key}?`)) {
      return;
    }

    setStatus(`Deleting ${key}...`);
    setError("");

    const response = await fetch("/api/cms/media/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });

    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Delete failed");
      setStatus("Delete failed");
      return;
    }

    await load(prefix);
  }

  async function handleSync() {
    setStatus("Syncing metadata...");
    setError("");

    const response = await fetch("/api/cms/media/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix }),
    });
    const payload = await response.json();

    if (!response.ok) {
      setError(payload.error ?? "Sync failed");
      setStatus("Sync failed");
      return;
    }

    setData(payload);
    setStatus(`Sync completed at ${new Date(payload.syncedAt).toLocaleString()}`);
  }

  return (
    <section style={{ display: "grid", gap: "1rem" }}>
      <div>
        <h1>Media CMS</h1>
        <p>Bucket: <strong>{data?.bucket ?? "Loading..."}</strong></p>
        <p>{status}</p>
        {error ? <p style={{ color: "#b91c1c" }}>{error}</p> : null}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          load(prefix);
        }}
        style={{ display: "grid", gap: "0.5rem", maxWidth: "40rem" }}
      >
        <label htmlFor="prefix">Current prefix</label>
        <input id="prefix" value={prefix} onChange={(event) => setPrefix(event.target.value)} />
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button type="submit">Reload</button>
          <button type="button" onClick={handleSync} disabled={!canWrite}>
            Sync
          </button>
        </div>
      </form>

      {canWrite ? (
        <form onSubmit={handleUpload} style={{ display: "grid", gap: "0.5rem", maxWidth: "40rem" }}>
          <label htmlFor="file">Upload file</label>
          <input
            id="file"
            type="file"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
          />
          <label htmlFor="upload-key">Object key</label>
          <input
            id="upload-key"
            value={uploadKey}
            onChange={(event) => setUploadKey(event.target.value)}
          />
          <button type="submit">Upload to RustFS</button>
        </form>
      ) : (
        <p>Your current role can view media but cannot upload or delete objects.</p>
      )}

      <div>
        <h2>Folders</h2>
        <table>
          <thead>
            <tr>
              <th align="left">Prefix</th>
            </tr>
          </thead>
          <tbody>
            {(data?.folders ?? []).map((folder) => (
              <tr key={folder.prefix}>
                <td>
                  <button type="button" onClick={() => setPrefix(folder.prefix)}>
                    {folder.prefix}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <h2>Objects</h2>
        <table>
          <thead>
            <tr>
              <th align="left">Key</th>
              <th align="left">Size</th>
              <th align="left">Modified</th>
              <th align="left">Public URL</th>
              <th align="left">Actions</th>
            </tr>
          </thead>
          <tbody>
            {(data?.objects ?? []).map((object) => (
              <tr key={object.key}>
                <td>{object.key}</td>
                <td>{formatBytes(object.size)}</td>
                <td>{object.lastModified ? new Date(object.lastModified).toLocaleString() : "-"}</td>
                <td>
                  <a href={object.url} target="_blank" rel="noreferrer">
                    Open
                  </a>
                </td>
                <td>
                  {canWrite ? (
                    <button type="button" onClick={() => handleDelete(object.key)}>
                      Delete
                    </button>
                  ) : (
                    "Read only"
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
