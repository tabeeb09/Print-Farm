import Link from "next/link";
import { useState } from "react";

const genericMessage =
  "If that email is registered, a password reset email will be sent shortly.";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setPending(true);
    setMessage("");
    setError("");

    try {
      const response = await fetch("/api/auth/recover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(payload.error || "Unable to start account recovery.");
      }

      setMessage(payload.message || genericMessage);
      setEmail("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to start account recovery.");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="authPage">
      <section className="panel authPanel">
        <p className="eyebrow">Account recovery</p>
        <h1>Reset your password</h1>
        <p>Enter the email address registered to your makerspace account.</p>
        {message ? <div className="assetMessage">{message}</div> : null}
        {error ? <div className="assetError">{error}</div> : null}
        <form className="assetForm" onSubmit={submit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <button type="submit" disabled={pending}>
            {pending ? "Checking..." : "Send reset email"}
          </button>
        </form>
        <div className="authLinks">
          <Link href="/auth/signin">Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
