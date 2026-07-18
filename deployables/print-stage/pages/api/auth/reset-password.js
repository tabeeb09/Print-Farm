import {
  resetPasswordWithToken,
} from "../../../lib/passwordEmail";
import { PasswordResetTokenError } from "../../../lib/passwordResetTokens";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  try {
    await resetPasswordWithToken({
      token: req.body?.token,
      password: req.body?.password,
      confirmation: req.body?.confirmation,
    });

    return res.status(200).json({
      ok: true,
      message: "Password updated. You can now sign in with the new password.",
    });
  } catch (error) {
    if (error instanceof PasswordResetTokenError) {
      return res.status(400).json({ error: "This password reset link is invalid or expired." });
    }

    const message = error instanceof Error ? error.message : "Unable to reset password.";
    return res.status(400).json({ error: message });
  }
}
