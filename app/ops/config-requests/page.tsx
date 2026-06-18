import { listConfigRequests } from "@/src/lib/server/config-requests";

export const dynamic = "force-dynamic";

export default async function OpsConfigRequestsPage() {
  let requests;
  let error: string | null = null;

  try {
    requests = await listConfigRequests();
  } catch (caught) {
    requests = [];
    error = (caught as Error).message;
  }

  return (
    <main style={{ maxWidth: "72rem", margin: "0 auto", padding: "2rem 1rem" }}>
      <h1>Config Request Status</h1>
      <p>This page shows required config names and statuses only. Secret values are not exposed.</p>
      {error ? <p>Unable to read config requests: {error}</p> : null}
      <table>
        <thead>
          <tr>
            <th align="left">Service</th>
            <th align="left">Key</th>
            <th align="left">Status</th>
            <th align="left">Target path</th>
          </tr>
        </thead>
        <tbody>
          {requests.map((request) => (
            <tr key={request.id}>
              <td>{request.serviceTitle || request.service}</td>
              <td>{request.key}</td>
              <td>{request.status}</td>
              <td>{request.targetPath}</td>
            </tr>
          ))}
          {!requests.length ? (
            <tr>
              <td colSpan={4}>No config requests have been published.</td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </main>
  );
}
