'use client';
import { useSession } from 'next-auth/react';
import SignInButton from './SignInButton';
import SignOutButton from './SignOutButton';

export default function AuthNav() {
  const { data: session, status } = useSession();
  if (status === 'loading') return <div>Loading...</div>;

  return (
    <div>
      {session ? (
        <SignOutButton />
      ) : (
        <SignInButton />
      )}
    </div>
  );
}