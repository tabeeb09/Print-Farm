import {
  findUniqueUserByEmail,
  getOwnerAlertRecipientEmails,
  resetUserPasswordById,
} from "./keycloakAdmin";
import {
  DailyEmailLimitError,
  reservePasswordResetEmail,
  reserveQuotaAlertEmail,
} from "./emailQuota";
import { env } from "./env";
import {
  sendDailyQuotaAlertEmail,
  sendResendEmail,
} from "./resendEmail";
import {
  consumePasswordResetToken,
  createPasswordResetToken,
  PasswordResetTokenError,
} from "./passwordResetTokens";

export const genericPasswordEmailMessage =
  "If that email is registered, a password reset email will be sent shortly.";

async function notifyOwnersAboutEmailLimit(status, trigger) {
  const alertReservation = await reserveQuotaAlertEmail({
    trigger,
    blockedAtCount: status.count,
    limit: status.limit,
  });

  if (!alertReservation.reserved) {
    return;
  }

  const recipients = await getOwnerAlertRecipientEmails(env.EMAIL_DAILY_ALERT_RECIPIENT_LIMIT);
  if (!recipients.length) {
    console.error("Password email limit reached, but no owner alert recipients were available.");
    return;
  }

  await sendDailyQuotaAlertEmail({
    to: recipients,
    status: alertReservation.status,
  });
}

function getAppBaseUrl() {
  return (env.APP_BASE_URL || env.NEXTAUTH_URL || "https://print.loftrop.com").replace(/\/+$/, "");
}

function buildResetUrl(token, redirectUri) {
  const base = getAppBaseUrl();
  const url = new URL("/auth/reset", base);
  url.searchParams.set("token", token);

  if (redirectUri) {
    url.searchParams.set("redirect", redirectUri);
  }

  return url.toString();
}

function getPasswordEmailSubject(trigger) {
  return trigger === "password_change"
    ? "Change your print farm password"
    : "Reset your print farm password";
}

function getPasswordEmailBody({ resetUrl, ttlMinutes, trigger }) {
  const action = trigger === "password_change" ? "change" : "reset";
  const text = [
    `Use this link to ${action} your print farm password:`,
    "",
    resetUrl,
    "",
    `This link expires in ${ttlMinutes} minutes and can only be used once.`,
    "If you did not request this, you can ignore this email.",
  ].join("\n");
  const html = [
    `<p>Use this link to ${action} your print farm password:</p>`,
    `<p><a href="${resetUrl}">${resetUrl}</a></p>`,
    `<p>This link expires in <strong>${ttlMinutes} minutes</strong> and can only be used once.</p>`,
    "<p>If you did not request this, you can ignore this email.</p>",
  ].join("");

  return { text, html };
}

export async function sendPasswordEmailIfRegistered(email, { trigger = "password_recovery", redirectUri } = {}) {
  try {
    const user = await findUniqueUserByEmail(email);

    if (!user || user.enabled === false) {
      return { sent: false };
    }

    const reservation = await reservePasswordResetEmail({
      recipientEmail: user.email || email,
      trigger,
    });
    const resetToken = await createPasswordResetToken({
      userId: user.id,
      email: user.email || email,
      trigger,
    });
    const resetUrl = buildResetUrl(resetToken.token, redirectUri);
    const emailBody = getPasswordEmailBody({
      resetUrl,
      ttlMinutes: resetToken.ttlMinutes,
      trigger,
    });

    await sendResendEmail({
      to: user.email || email,
      subject: getPasswordEmailSubject(trigger),
      ...emailBody,
    });

    if (reservation.remainingUser === 0) {
      try {
        await notifyOwnersAboutEmailLimit(reservation, trigger);
      } catch (alertError) {
        console.error("Password email quota alert failed", alertError);
      }
    }

    return {
      sent: true,
      beforeSend: reservation,
      expiresAt: resetToken.expiresAt,
    };
  } catch (error) {
    if (error instanceof DailyEmailLimitError) {
      try {
        await notifyOwnersAboutEmailLimit(error.status, trigger);
      } catch (alertError) {
        console.error("Password email quota alert failed", alertError);
      }

      return { sent: false, limited: true };
    }

    throw error;
  }
}

export function assertAcceptablePassword(password, confirmation) {
  const candidate = String(password || "");

  if (candidate.length < 12) {
    throw new Error("Password must be at least 12 characters long.");
  }

  if (confirmation !== undefined && candidate !== String(confirmation || "")) {
    throw new Error("Password confirmation does not match.");
  }

  return candidate;
}

export async function resetPasswordWithToken({ token, password, confirmation }) {
  const nextPassword = assertAcceptablePassword(password, confirmation);
  const consumed = await consumePasswordResetToken(token);

  try {
    await resetUserPasswordById(consumed.userId, nextPassword);
  } catch (error) {
    if (error instanceof PasswordResetTokenError) {
      throw error;
    }

    throw new Error("Password could not be updated. Request a new reset link and try again.");
  }

  return { reset: true };
}
