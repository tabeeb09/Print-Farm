import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    error?: "RefreshAccessTokenError";
    user: {
      email?: string | null;
      name?: string | null;
      image?: string | null;
      roles: string[];
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    email?: string | null;
    keycloakUserId?: string;
    provider?: string;
    roles?: string[];
    roleSyncFailed?: boolean;
    lastRoleSyncAt?: number;
    error?: "RefreshAccessTokenError";
  }
}
