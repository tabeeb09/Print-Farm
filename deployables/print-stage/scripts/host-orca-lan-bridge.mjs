import http from "node:http";
import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const PORT = Number.parseInt(process.env.ORCA_LAN_BRIDGE_PORT || "47831", 10);
const HOST = process.env.ORCA_LAN_BRIDGE_HOST || "127.0.0.1";
const TOKEN = process.env.ORCA_LAN_BRIDGE_TOKEN || "";
const CONTAINER_OUTBOX = process.env.ORCA_LAN_BRIDGE_CONTAINER_OUTBOX || "/outbox";
const HOST_OUTBOX = path.resolve(process.env.ORCA_LAN_BRIDGE_OUTBOX_HOST_DIR || "worker-outbox");
const WRAPPER = process.env.ORCA_LAN_WRAPPER || "";
const WRAPPER_ARGS = process.env.ORCA_LAN_WRAPPER_ARGS || process.env.ORCA_LAN_ARGS || "";
const DRY_RUN = process.env.ORCA_LAN_DRY_RUN === "1";

function json(response, statusCode, payload) {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(payload));
}

function textError(response, statusCode, message) {
  response.writeHead(statusCode, { "Content-Type": "text/plain; charset=utf-8" });
  response.end(message);
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function parseExtraArgs(raw) {
  if (!raw.trim()) return [];
  if (raw.trim().startsWith("[")) return JSON.parse(raw).map((item) => String(item));
  return raw.trim().split(/\s+/).filter(Boolean);
}

function safeHostPath(containerPath) {
  const normalizedContainerPath = containerPath.replaceAll("\\", "/");
  const normalizedPrefix = CONTAINER_OUTBOX.replaceAll("\\", "/").replace(/\/+$/, "");
  if (
    normalizedContainerPath !== normalizedPrefix &&
    !normalizedContainerPath.startsWith(`${normalizedPrefix}/`)
  ) {
    throw new Error(`File path must be under ${CONTAINER_OUTBOX}`);
  }

  const relative = normalizedContainerPath.slice(normalizedPrefix.length).replace(/^\/+/, "");
  const target = path.resolve(HOST_OUTBOX, relative);
  const relativeToOutbox = path.relative(HOST_OUTBOX, target);
  if (relativeToOutbox.startsWith("..") || path.isAbsolute(relativeToOutbox)) {
    throw new Error("Resolved file path escaped the host outbox");
  }
  return target;
}

function projectNameFor(job, hostPath) {
  const explicit = typeof job?.projectName === "string" ? job.projectName.trim() : "";
  if (explicit) return explicit;
  const original = typeof job?.originalFilename === "string" ? job.originalFilename : "";
  return path.basename(original || hostPath, path.extname(original || hostPath));
}

function run(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: "inherit", shell: false });
    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function handlePrint(payload) {
  const hostPath = safeHostPath(requireString(payload?.file?.containerPath, "file.containerPath"));
  const printer = payload?.printer || {};
  const printerHost = requireString(printer.host, "printer.host");
  const printerSerial = requireString(printer.serial, "printer.serial");
  const accessCode = requireString(printer.accessCode, "printer.accessCode");

  await fs.access(hostPath);

  if (DRY_RUN && !WRAPPER) {
    console.log(`[bridge] dry-run handoff ${hostPath} -> ${printer.label || printerHost}`);
    return { ok: true, dryRun: true };
  }

  if (!WRAPPER) {
    throw new Error("ORCA_LAN_WRAPPER is not configured on the host bridge");
  }

  const args = [
    "--job", hostPath,
    "--ip", printerHost,
    "--serial", printerSerial,
    "--access-code", accessCode,
    "--project-name", projectNameFor(payload?.job, hostPath),
    "--plate-index", String(payload?.job?.plateIndex || "1"),
  ];

  if (printer.sslFtp) args.push("--ssl-ftp");
  if (printer.sslMqtt) args.push("--ssl-mqtt");
  if (DRY_RUN) args.push("--dry-run");
  args.push(...parseExtraArgs(WRAPPER_ARGS));

  await run(WRAPPER, args, path.dirname(hostPath));
  return { ok: true };
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === "GET" && request.url === "/health") {
      json(response, 200, { ok: true, outbox: HOST_OUTBOX, wrapperConfigured: Boolean(WRAPPER) });
      return;
    }

    if (request.method !== "POST" || request.url !== "/print") {
      textError(response, 404, "not found");
      return;
    }

    if (TOKEN) {
      const auth = request.headers.authorization || "";
      if (auth !== `Bearer ${TOKEN}`) {
        textError(response, 401, "unauthorized");
        return;
      }
    }

    const payload = await readJsonBody(request);
    const result = await handlePrint(payload);
    json(response, 200, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[bridge] ${message}`);
    json(response, 500, { ok: false, error: message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[bridge] listening on http://${HOST}:${PORT}`);
  console.log(`[bridge] mapping ${CONTAINER_OUTBOX} -> ${HOST_OUTBOX}`);
  if (!WRAPPER) console.log("[bridge] ORCA_LAN_WRAPPER is not configured yet");
});
