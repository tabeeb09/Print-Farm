import PrivilegeRequestsAdmin from "@/components/admin/PrivilegeRequestsAdmin";
import { requireSession } from "@/src/lib/server/auth";
import { listPrivilegeRequests } from "@/src/lib/server/privilege-requests";

export const dynamic = "force-dynamic";

export default async function PrivilegeRequestsPage() {
  const session = await requireSession();
  const roles = session.user?.roles ?? [];

  if (!roles.includes("owner")) {
    return (
      <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
        <h1>Privilege Requests</h1>
        <p>You need the owner role to review privilege requests.</p>
        <p>Current roles: {roles.length ? roles.join(", ") : "none detected"}</p>
      </main>
    );
  }

  const requests = await listPrivilegeRequests();

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Privilege Requests</h1>
      <p>Owners can approve requests here. Approval assigns the requested Keycloak client role.</p>
      <PrivilegeRequestsAdmin initialRequests={requests} />
    </main>
  );
}
