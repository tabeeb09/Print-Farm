import AssetClient from "@/components/assets/AssetClient";
import PrivilegeRequestButton from "@/components/cms/PrivilegeRequestButton";
import { requireSession } from "@/src/lib/server/auth";

export const dynamic = "force-dynamic";

function hasAssetAdminRole(roles: string[]) {
  return roles.includes("owner") || roles.includes("asset_admin");
}

export default async function AssetInventoryPage() {
  const session = await requireSession();
  const roles = session.user?.roles ?? [];

  if (!hasAssetAdminRole(roles)) {
    return (
      <section className="assetPage panel">
        <h1>Inventory</h1>
        <p>You need the owner or asset_admin role to manage inventory.</p>
        <p>Current roles: {roles.length ? roles.join(", ") : "none detected"}</p>
        <PrivilegeRequestButton resource="assets/inventory" requestedRole="asset_admin" />
      </section>
    );
  }

  return <AssetClient mode="inventory" />;
}
