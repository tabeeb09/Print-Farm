import { requireSession } from "@/src/lib/server/auth";

export const dynamic = "force-dynamic";

export default async function LogsAdminPage() {
  const session = await requireSession();
  const roles = session.user?.roles ?? [];
  const authorized = roles.some(
    (role) => role === "owner" || role === "audit_admin" || role === "logging_admin",
  );
  const grafanaHost = process.env.GRAFANA_HOST;
  const grafanaUrl = grafanaHost ? `https://${grafanaHost}` : null;

  if (!authorized) {
    return (
      <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
        <h1>Audit Logs</h1>
        <p>You need the owner, audit_admin, or logging_admin role to view logs.</p>
        <p>Current roles: {roles.length ? roles.join(", ") : "none detected"}</p>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Audit Logs</h1>
      <p>
        The website emits structured JSON audit events to container stdout. In production those
        events should be collected by the CAId logging stack and viewed through Grafana/Loki.
      </p>
      {grafanaUrl ? (
        <p>
          <a href={grafanaUrl}>Open logging dashboard</a>
        </p>
      ) : (
        <p>
          GRAFANA_HOST has not been provided yet. Use /admin/config-requests to fill the logging
          config request once the CAId logging stack is enabled.
        </p>
      )}
    </main>
  );
}
