import { getServerSession } from "next-auth";
import { authOptions } from "@/app/auth";
import { redirect, notFound } from "next/navigation";

function parseAllowedEmails(envValue?: string) {
  return (envValue || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function requireAllowed() {
  const session = await getServerSession(authOptions);

  if (!session || !session.user || !session.user.email) {
    redirect("/api/auth/signin");
  }

  const email = session.user.email.toLowerCase();

  const allowed = parseAllowedEmails(process.env.ALLOWED_EMAILS);

  const isAllowed = allowed.includes(email);

  if (!isAllowed) {
    notFound();
  }

  return session;
}
