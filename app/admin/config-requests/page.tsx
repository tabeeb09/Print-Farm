import ConfigRequestsAdmin from "@/components/admin/ConfigRequestsAdmin";
import { requireSession } from "@/src/lib/server/auth";
import { listConfigRequests } from "@/src/lib/server/config-requests";

export const dynamic = "force-dynamic";

export default async function ConfigRequestsPage() {
  const session = await requireSession();
  const roles = session.user?.roles ?? [];
  const authorized = roles.some((role) => role === "owner" || role === "config_admin");

  if (!authorized) {
    return (
      <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
        <h1>Config Requests</h1>
        <p>You need the owner or config_admin role to provide CAId config values.</p>
        <p>Current roles: {roles.length ? roles.join(", ") : "none detected"}</p>
      </main>
    );
  }

  const requests = await listConfigRequests();

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Config Requests</h1>
      <p>Missing human-provided CAId values are published here by the converge script.</p>
      <ConfigRequestsAdmin initialRequests={requests} />
    </main>
  );
}
