import type { Session } from "next-auth";

type AuditResult = "success" | "failure" | "denied";

type AuditEvent = {
  action: string;
  result: AuditResult;
  actorEmail?: string | null;
  actorName?: string | null;
  actorRoles?: string[];
  resource?: string;
  target?: string;
  message?: string;
  metadata?: Record<string, unknown>;
};

export function auditLog(event: AuditEvent) {
  const payload = {
    timestamp: new Date().toISOString(),
    component: "website",
    eventType: "audit",
    ...event,
  };

  console.log(JSON.stringify(payload));
}

export function sessionActor(session: Session | null | undefined) {
  return {
    actorEmail: session?.user?.email ?? null,
    actorName: session?.user?.name ?? null,
    actorRoles: session?.user?.roles ?? [],
  };
}
