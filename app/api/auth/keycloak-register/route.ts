import { NextResponse } from "next/server";

import { env, getBaseUrl } from "@/src/lib/server/env";

export async function GET() {
  if (!env.KEYCLOAK_ISSUER || !env.KEYCLOAK_CLIENT_ID) {
    return NextResponse.redirect(new URL("/api/auth/signin", getBaseUrl()));
  }

  const redirectUri = new URL("/api/auth/callback/keycloak", getBaseUrl()).toString();
  const registrationUrl = new URL(
    `${env.KEYCLOAK_ISSUER.replace(/\/+$/, "")}/protocol/openid-connect/registrations`,
  );

  registrationUrl.searchParams.set("client_id", env.KEYCLOAK_CLIENT_ID);
  registrationUrl.searchParams.set("response_type", "code");
  registrationUrl.searchParams.set("scope", "openid email profile");
  registrationUrl.searchParams.set("redirect_uri", redirectUri);

  return NextResponse.redirect(registrationUrl);
}
