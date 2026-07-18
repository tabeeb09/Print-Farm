import Link from "next/link";
import { useRouter } from "next/router";
import { useState } from "react";

export default function ResetPasswordPage() {
  const router = useRouter();
  const token = typeof router.query.token === "string" ? router.query.token : "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmation }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Unable to reset password.");
      }

      setMessage(payload.message || "Password updated. You can now sign in.");
      setPassword("");
      setConfirmation("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to reset password.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="authPage">
      <section className="panel authPanel">
        <p className="eyebrow">Account recovery</p>
        <h1>Choose a new password</h1>
        <p>Password reset links expire after 30 minutes and can only be used once.</p>
        {!token ? <div className="assetError">This reset link is missing its token.</div> : null}
        {message ? <div className="assetMessage">{message}</div> : null}
        {error ? <div className="assetError">{error}</div> : null}
        {!message ? (
          <form className="assetForm" onSubmit={submit}>
            <label>
              New password
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={12}
                required
                autoComplete="new-password"
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                minLength={12}
                required
                autoComplete="new-password"
              />
            </label>
            <button type="submit" disabled={pending || !token}>
              {pending ? "Updating..." : "Update password"}
            </button>
          </form>
        ) : null}
        <div className="authLinks">
          <Link href="/auth/signin">Back to sign in</Link>
          <Link href="/auth/recover">Request a new link</Link>
        </div>
      </section>
    </main>
  );
}
