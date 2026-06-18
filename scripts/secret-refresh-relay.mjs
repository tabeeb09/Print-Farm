import http from "node:http";

const port = Number(process.env.SECRET_REFRESH_RELAY_PORT || 8787);
const sharedSecret = process.env.SECRET_REFRESH_WEBHOOK_SECRET;
const repository = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_PAT_FOR_DISPATCH;
const eventType = process.env.GITHUB_DISPATCH_EVENT_TYPE || "secrets_changed";

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

async function dispatchRefresh(payload) {
  const response = await fetch(`https://api.github.com/repos/${repository}/dispatches`, {
    method: "POST",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: eventType,
      client_payload: payload,
    }),
  });

  if (!response.ok) {
    throw new Error(`GitHub dispatch failed with status ${response.status}.`);
  }
}

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST") {
    return sendJson(response, 405, { error: "Method not allowed" });
  }

  if (!sharedSecret || !repository || !token) {
    return sendJson(response, 500, { error: "Relay is missing required configuration" });
  }

  if (request.headers["x-webhook-secret"] !== sharedSecret) {
    return sendJson(response, 401, { error: "Invalid webhook secret" });
  }

  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }

  const rawBody = Buffer.concat(chunks).toString("utf8");
  const payload = rawBody ? JSON.parse(rawBody) : {};
  const secretPath = payload.path || payload.secret_path || payload.data?.path;
  const operation = payload.operation || payload.data?.operation || "update";

  if (!secretPath || !String(secretPath).startsWith(process.env.BAO_KV_MOUNT || "kv")) {
    return sendJson(response, 202, { ok: true, ignored: true });
  }

  await dispatchRefresh({
    source: "openbao",
    path: secretPath,
    operation,
    timestamp: new Date().toISOString(),
  });

  return sendJson(response, 202, { ok: true });
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Secret refresh relay listening on ${port}`);
});
