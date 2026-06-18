"use client";

import { signOut, useSession } from "next-auth/react";

export default function Header() {
  const { data: session, status } = useSession();

  return (
    <header className="app-header">
      <a href="/" className="site-title">
        Print Farm
      </a>
      <nav className="header-actions" aria-label="Header links">
        <a href="https://github.com/tabeeb09/Print-Farm">Repository</a>
        <a href="/docs">Project docs</a>
        {status === "loading" ? null : session ? (
          <button type="button" onClick={() => signOut()}>
            Sign out
          </button>
        ) : (
          <a href="/api/auth/signin">Sign in</a>
        )}
      </nav>
    </header>
  );
}
