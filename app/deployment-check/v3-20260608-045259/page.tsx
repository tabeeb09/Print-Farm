const version = 3;
const versionLabel = "v3-20260608-045259";
const commitTime = "2026-06-08T04:52:59+01:00";

export default function DeploymentCheckV3Page() {
  return (
    <main style={{ padding: "4rem", fontFamily: "serif" }}>
      <p>Deployment check</p>
      <h1>Website version {version}</h1>
      <p>{versionLabel}</p>
      <p>Commit time marker: {commitTime}</p>
      <p>This page verifies a fresh commit deployed through the website update path.</p>
    </main>
  );
}
