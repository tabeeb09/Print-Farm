import { getStateFilePath, readJsonFile, writeJsonFile } from "./jsonStore.js";

const AUDIT_PATH = getStateFilePath("AUDIT_LOG_PATH", "audit-log.json");
const MAX_EVENTS = 5000;
const SECRET_KEY_PATTERN = /(password|secret|token|accessCode|access_code|key|credential|photo|image|dataUrl|data_url|attachment)/i;

function safeActor(actor) {
  return {
    sub: actor?.sub || null,
    email: actor?.email || null,
    name: actor?.name || null,
    roles: Array.isArray(actor?.roles) ? actor.roles : [],
  };
}

function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [
      key,
      SECRET_KEY_PATTERN.test(key) ? "[redacted]" : redact(entry),
    ]),
  );
}

export async function listAuditEvents({ limit = 250 } = {}) {
  const state = await readJsonFile(AUDIT_PATH, { events: [] });
  return {
    events: (state.events || []).slice(0, Math.max(1, Math.min(Number(limit) || 250, 1000))),
  };
}

export async function recordAuditEvent(actor, event) {
  try {
    const state = await readJsonFile(AUDIT_PATH, { events: [] });
    const nextEvent = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      actor: safeActor(actor),
      action: String(event?.action || "unknown"),
      targetType: event?.targetType || null,
      targetId: event?.targetId || null,
      metadata: redact(event?.metadata || {}),
    };
    const next = { events: [nextEvent, ...(state.events || [])].slice(0, MAX_EVENTS) };
    await writeJsonFile(AUDIT_PATH, next);
    return nextEvent;
  } catch {
    return null;
  }
}
