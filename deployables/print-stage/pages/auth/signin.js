import Link from "next/link";
import { signIn } from "next-auth/react";
import { useRouter } from "next/router";

import { env } from "../../lib/env";

const providerLabels = {
  keycloak: "Sign in with makerspace account",
  keycloakGoogle: "Continue with Google",
};

export default function SignInPage({ providers = [] }) {
  const router = useRouter();
  const callbackUrl = typeof router.query.callbackUrl === "string" ? router.query.callbackUrl : "/";

  function handleProviderSignIn(provider) {
    if (provider.id === "keycloakGoogle") {
      signIn("keycloak", { callbackUrl }, { kc_idp_hint: "google" });
      return;
    }

    signIn(provider.id, { callbackUrl });
  }

  return (
    <main className="authPage">
      <section className="panel authPanel">
        <p className="eyebrow">Print farm</p>
        <h1>Sign in</h1>
        <p>Use your makerspace account or Google SSO to access print and asset services.</p>
        <div className="authButtonStack">
          {providers.map((provider) => (
            <button
              key={provider.id}
              type="button"
              onClick={() => handleProviderSignIn(provider)}
            >
              {providerLabels[provider.id] || `Sign in with ${provider.name}`}
            </button>
          ))}
        </div>
        <div className="authLinks">
          <Link href="/auth/recover">Forgot password?</Link>
        </div>
      </section>
    </main>
  );
}

export async function getServerSideProps() {
  const providers = [];

  if (env.KEYCLOAK_ISSUER && env.KEYCLOAK_CLIENT_ID && env.KEYCLOAK_CLIENT_SECRET) {
    providers.push({ id: "keycloak", name: "Keycloak" });
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) {
    providers.push({ id: "keycloakGoogle", name: "Google" });
  }

  return {
    props: { providers },
  };
}
