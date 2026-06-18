"use client";

import { useState } from "react";

type PrivilegeRequestButtonProps = {
  resource: string;
  requestedRole: string;
};

export default function PrivilegeRequestButton({
  resource,
  requestedRole,
}: PrivilegeRequestButtonProps) {
  const [status, setStatus] = useState<"idle" | "submitting" | "sent" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submitRequest() {
    setStatus("submitting");
    setMessage("");

    const response = await fetch("/api/privilege-requests", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resource, requestedRole }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      setStatus("error");
      setMessage(payload?.error ?? "Unable to create privilege request.");
      return;
    }

    setStatus("sent");
    setMessage("Privilege request sent. An owner can approve it from the admin page.");
  }

  return (
    <div style={{ marginTop: "1.5rem" }}>
      <button type="button" onClick={submitRequest} disabled={status === "submitting"}>
        {status === "submitting" ? "Requesting..." : "Request CMS privileges"}
      </button>
      {message ? <p>{message}</p> : null}
    </div>
  );
}
