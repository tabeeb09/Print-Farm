import MediaManager from "@/components/cms/MediaManager";
import PrivilegeRequestButton from "@/components/cms/PrivilegeRequestButton";
import { getReadRoles, getWriteRoles, requireSession } from "@/src/lib/server/auth";
import { getMissingSecrets } from "@/src/lib/server/secret-status";

export const dynamic = "force-dynamic";

export default async function CmsMediaPage() {
  const missingMediaSecrets = getMissingSecrets("cmsMedia");

  if (missingMediaSecrets.length) {
    return (
      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
        <h1>Media CMS</h1>
        <p>The CMS cannot start because required runtime secrets are missing.</p>
        <p>Missing keys: {missingMediaSecrets.join(", ")}</p>
        <p>Check <a href="/ops/secrets">/ops/secrets</a> for the full runtime status.</p>
      </div>
    );
  }

  const session = await requireSession();
  const userRoles = session.user.roles ?? [];
  const canRead = getReadRoles().some((role) => userRoles.includes(role));

  if (!canRead) {
    return (
      <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
        <h1>Media CMS</h1>
        <p>You are signed in, but your session does not include a CMS read role.</p>
        <p>Expected one of: {getReadRoles().join(", ")}</p>
        <p>Current roles: {userRoles.length ? userRoles.join(", ") : "none detected"}</p>
        <PrivilegeRequestButton resource="cms/media" requestedRole="media_admin" />
      </div>
    );
  }

  const canWrite = getWriteRoles().some((role) => userRoles.includes(role));

  return (
    <div style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
      <MediaManager initialPrefix="" canWrite={canWrite} />
    </div>
  );
}
