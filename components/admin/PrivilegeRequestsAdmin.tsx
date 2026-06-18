"use client";

import { useState } from "react";
import type { PrivilegeRequest } from "@/src/lib/server/privilege-requests";

type PrivilegeRequestsAdminProps = {
  initialRequests: PrivilegeRequest[];
};

const assignableRoles = [
  "viewer",
  "editor",
  "media_admin",
  "owner",
  "infra_admin",
  "identity_hr_manager",
  "config_admin",
  "audit_admin",
  "logging_admin",
  "openbao_admin",
  "rustfs_admin",
  "netbird_admin",
];

export default function PrivilegeRequestsAdmin({
  initialRequests,
}: PrivilegeRequestsAdminProps) {
  const [requests, setRequests] = useState(initialRequests);
  const [rolesByRequest, setRolesByRequest] = useState<Record<string, string>>(
    Object.fromEntries(initialRequests.map((request) => [request.id, request.requestedRole])),
  );
  const [message, setMessage] = useState("");

  async function decide(id: string, action: "approve" | "reject") {
    setMessage("");

    const response = await fetch(`/api/privilege-requests/${id}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: action === "approve" ? JSON.stringify({ role: rolesByRequest[id] }) : undefined,
    });

    const payload = await response.json().catch(() => null);

    if (!response.ok) {
      setMessage(payload?.error ?? `Unable to ${action} request.`);
      return;
    }

    setRequests((current) =>
      current.map((request) => (request.id === id ? payload.request : request)),
    );
    setMessage(`Request ${action === "approve" ? "approved" : "rejected"}.`);
  }

  return (
    <div style={{ overflowX: "auto" }}>
      {message ? <p>{message}</p> : null}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th align="left">Email</th>
            <th align="left">Name</th>
            <th align="left">Resource</th>
            <th align="left">Role</th>
            <th align="left">Status</th>
            <th align="left">Created</th>
            <th align="left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>{request.email}</td>
              <td>{request.name || "-"}</td>
              <td>{request.resource}</td>
              <td>
                {request.status === "pending" ? (
                  <select
                    value={rolesByRequest[request.id] ?? request.requestedRole}
                    onChange={(event) =>
                      setRolesByRequest((current) => ({
                        ...current,
                        [request.id]: event.target.value,
                      }))
                    }
                  >
                    {assignableRoles.map((role) => (
                      <option key={role} value={role}>
                        {role}
                      </option>
                    ))}
                  </select>
                ) : (
                  request.requestedRole
                )}
              </td>
              <td>{request.status}</td>
              <td>{new Date(request.createdAt).toLocaleString()}</td>
              <td>
                {request.status === "pending" ? (
                  <>
                    <button type="button" onClick={() => decide(request.id, "approve")}>
                      Approve
                    </button>{" "}
                    <button type="button" onClick={() => decide(request.id, "reject")}>
                      Reject
                    </button>
                  </>
                ) : (
                  "-"
                )}
              </td>
            </tr>
          ))}
          {!requests.length ? (
            <tr>
              <td colSpan={7}>No privilege requests yet.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
  );
}
