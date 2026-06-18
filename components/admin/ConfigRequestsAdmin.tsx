"use client";

import { useState } from "react";
import type { ConfigRequest } from "@/src/lib/server/config-requests";

type ConfigRequestsAdminProps = {
  initialRequests: ConfigRequest[];
};

export default function ConfigRequestsAdmin({ initialRequests }: ConfigRequestsAdminProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  async function submitValue(id: string) {
    setMessage("");
    const value = values[id] ?? "";

    if (!value.trim()) {
      setMessage("Value is required.");
      return;
    }

    const response = await fetch(`/api/config-requests/${encodeURIComponent(id)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value }),
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(payload?.error ?? "Unable to update config value.");
      return;
    }

    setRequests((current) =>
      current.map((request) => (request.id === id ? payload.request : request)),
    );
    setValues((current) => ({ ...current, [id]: "" }));
    setMessage("Config value saved to OpenBao.");
  }

  return (
    <div style={{ overflowX: "auto" }}>
      {message ? <p>{message}</p> : null}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Service</th>
            <th align="left">Config</th>
            <th align="left">Status</th>
            <th align="left">Target</th>
            <th align="left">Value</th>
            <th align="left">Action</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>{request.serviceTitle || request.service}</td>
              <td>
                <strong>{request.label}</strong>
                <br />
                <small>{request.description || request.key}</small>
              </td>
              <td>{request.status}</td>
              <td>
                <code>{request.targetPath}</code>
                <br />
                <code>{request.key}</code>
              </td>
              <td>
                {request.status === "missing" ? (
                  <input
                    type={request.secret ? "password" : "text"}
                    value={values[request.id] ?? ""}
                    placeholder={request.placeholder || request.key}
                    onChange={(event) =>
                      setValues((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                  />
                ) : (
                  "-"
                )}
              </td>
              <td>
                {request.status === "missing" ? (
                  <button type="button" onClick={() => submitValue(request.id)}>
                    Save to OpenBao
                  </button>
                ) : (
                  "Provided"
                )}
              </td>
            </tr>
          ))}
          {!requests.length ? (
            <tr>
              <td colSpan={6}>No config requests have been published.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
