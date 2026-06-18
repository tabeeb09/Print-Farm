'use client';
import Link from 'next/link';
import { signIn } from 'next-auth/react';

export default function SignInButton() {
  return (
   <div className="flex items-center justify-center h-screen">
    <span> Sign in to access this content</span>
    <button onClick={() => signIn('keycloak', { callbackUrl: '/' })}>
      Sign in with Keycloak
    </button>
    <Link href="/api/auth/keycloak-register">
      Sign up with Keycloak
    </Link>
    <button onClick={() => signIn('google', { callbackUrl: '/' })}>
      Sign in with Google
    </button>
    </div>
  );
}
