import { getServerSession } from "next-auth/next";

import { authOptions } from "../../../lib/authOptions";
import {
  genericPasswordEmailMessage,
  sendPasswordEmailIfRegistered,
} from "../../../lib/passwordEmail";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed." });
  }

  const session = await getServerSession(req, res, authOptions);
  const email = session?.user?.email;

  if (!email) {
    return res.status(401).json({ error: "Sign in before requesting a password change email." });
  }

  try {
    await sendPasswordEmailIfRegistered(email, { trigger: "password_change" });
  } catch (error) {
    console.error("Password change email request failed", error);
  }

  return res.status(200).json({
    ok: true,
    message: genericPasswordEmailMessage,
  });
}
