import {
  getOwnerAlertRecipientEmails,
  sendPasswordResetIfRegistered,
} from "../../../lib/keycloakAdmin";
import {
  DailyEmailLimitError,
  reservePasswordResetEmail,
  reserveQuotaAlertEmail,
} from "../../../lib/emailQuota";
import { env } from "../../../lib/env";
import { sendDailyQuotaAlertEmail } from "../../../lib/resendEmail";

const genericMessage =
  "If that email is registered, a password reset email will be sent shortly.";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

async function notifyOwnersAboutEmailLimit(status) {
  const alertReservation = await reserveQuotaAlertEmail({
    trigger: "password_recovery",
    blockedAtCount: status.count,
    limit: status.limit,
  });

  if (!alertReservation.reserved) {
    return;
  }

  const recipients = await getOwnerAlertRecipientEmails(env.EMAIL_DAILY_ALERT_RECIPIENT_LIMIT);
  if (!recipients.length) {
    console.error("Password recovery email limit reached, but no owner alert recipients were available.");
    return;
  }

  await sendDailyQuotaAlertEmail({
    to: recipients,
    status: alertReservation.status,
  });
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const email = normalizeEmail(req.body?.email);

  if (!email || !email.includes("@")) {
    return res.status(400).json({ error: "A valid email address is required." });
  }

  try {
    const result = await sendPasswordResetIfRegistered(email, undefined, {
      beforeSend: ({ email: recipientEmail }) => reservePasswordResetEmail({ recipientEmail }),
    });

    if (result.sent && result.beforeSend?.remainingUser === 0) {
      try {
        await notifyOwnersAboutEmailLimit(result.beforeSend);
      } catch (alertError) {
        console.error("Password recovery quota alert failed", alertError);
      }
    }
  } catch (error) {
    if (error instanceof DailyEmailLimitError) {
      try {
        await notifyOwnersAboutEmailLimit(error.status);
      } catch (alertError) {
        console.error("Password recovery quota alert failed", alertError);
      }

      return res.status(200).json({ ok: true, message: genericMessage });
    }

    // Keep public responses generic so account existence cannot be inferred.
    console.error("Password recovery request failed", error);
  }

  return res.status(200).json({ ok: true, message: genericMessage });
}
