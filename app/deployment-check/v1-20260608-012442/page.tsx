const deploymentCheck = {
  version: 1,
  label: "v1-20260608-012442",
  commitTime: "2026-06-08T01:24:42+01:00",
};

export default function DeploymentCheckPage() {
  return (
    <main style={{ padding: "3rem", maxWidth: "48rem", margin: "0 auto", fontFamily: "sans-serif" }}>
      <p style={{ letterSpacing: "0.12em", textTransform: "uppercase", color: "#5f6f52", fontWeight: 700 }}>
        Deployment Check
      </p>
      <h1 style={{ fontSize: "2.5rem", margin: "0.5rem 0" }}>Website deployment version {deploymentCheck.version}</h1>
      <p style={{ fontSize: "1.125rem", lineHeight: 1.6 }}>
        Placeholder deployment verification page. If you can see this page on the VPS, the latest website image was pulled and restarted successfully.
      </p>
      <dl style={{ marginTop: "2rem", display: "grid", gap: "0.75rem" }}>
        <div>
          <dt style={{ fontWeight: 700 }}>Version</dt>
          <dd style={{ margin: 0 }}>{deploymentCheck.version}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Version label</dt>
          <dd style={{ margin: 0 }}>{deploymentCheck.label}</dd>
        </div>
        <div>
          <dt style={{ fontWeight: 700 }}>Commit time marker</dt>
          <dd style={{ margin: 0 }}>{deploymentCheck.commitTime}</dd>
        </div>
      </dl>
    </main>
  );
}
