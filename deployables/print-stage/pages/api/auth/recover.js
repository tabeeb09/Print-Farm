import { sendPasswordResetIfRegistered } from "../../../lib/keycloakAdmin";

const genericMessage =
  "If that email is registered, a password reset email will be sent shortly.";

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
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
    await sendPasswordResetIfRegistered(email);
  } catch (error) {
    // Keep public responses generic so account existence cannot be inferred.
    console.error("Password recovery request failed", error);
  }

  return res.status(200).json({ ok: true, message: genericMessage });
}
