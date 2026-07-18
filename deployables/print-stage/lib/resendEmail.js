import { env } from "./env.js";

function getResendApiKey() {
  if (env.RESEND_API_KEY) return env.RESEND_API_KEY;
  if (env.KEYCLOAK_SMTP_HOST === "smtp.resend.com" && env.KEYCLOAK_SMTP_PASSWORD) {
    return env.KEYCLOAK_SMTP_PASSWORD;
  }
  return "";
}

function getFromEmail() {
  return env.RESEND_FROM_EMAIL || env.KEYCLOAK_SMTP_FROM || "";
}

export function hasResendEmailConfig() {
  return Boolean(getResendApiKey() && getFromEmail());
}

export async function sendResendEmail({ to, subject, text, html }) {
  const apiKey = getResendApiKey();
  const from = getFromEmail();
  const recipients = Array.from(new Set((Array.isArray(to) ? to : [to]).filter(Boolean)));

  if (!apiKey || !from || !recipients.length) {
    return {
      sent: false,
      reason: !apiKey ? "missing_api_key" : !from ? "missing_from" : "missing_recipients",
    };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject,
      text,
      html,
    }),
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Resend email failed (${response.status}): ${payload.message || response.statusText}`);
  }

  return { sent: true, id: payload.id || null };
}

export async function sendDailyQuotaAlertEmail({ to, status }) {
  return sendResendEmail({
    to,
    subject: `Print farm email limit reached for ${status.day}`,
    text: [
      `The print farm password email limit has been reached for ${status.day}.`,
      "",
      `Configured daily hard limit: ${status.limit}`,
      `Recorded outbound email events: ${status.count}`,
      "",
      "Further password recovery/change emails are blocked until the next UTC day.",
      "",
      "Recommended next actions:",
      "- Add payment/upgrade the Resend account if the higher daily volume is expected.",
      "- Or implement/self-host a mail relay if managed transactional email is no longer appropriate.",
    ].join("\n"),
    html: [
      `<p>The print farm password email limit has been reached for <strong>${status.day}</strong>.</p>`,
      `<p><strong>Configured daily hard limit:</strong> ${status.limit}<br/>`,
      `<strong>Recorded outbound email events:</strong> ${status.count}</p>`,
      "<p>Further password recovery/change emails are blocked until the next UTC day.</p>",
      "<p>Recommended next actions:</p>",
      "<ul>",
      "<li>Add payment/upgrade the Resend account if the higher daily volume is expected.</li>",
      "<li>Or implement/self-host a mail relay if managed transactional email is no longer appropriate.</li>",
      "</ul>",
    ].join(""),
  });
}
