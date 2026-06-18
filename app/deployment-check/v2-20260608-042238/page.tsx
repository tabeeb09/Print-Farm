const version = 2;
const versionLabel = "v2-20260608-042238";
const commitTime = "2026-06-08T04:22:38+01:00";

export default function DeploymentCheckV2Page() {
  return (
    <main style={{ padding: "4rem", fontFamily: "serif" }}>
      <p>Deployment check</p>
      <h1>Website version {version}</h1>
      <p>{versionLabel}</p>
      <p>Commit time marker: {commitTime}</p>
      <p>This page exists to verify GitHub Actions image updates.</p>
    </main>
  );
}
