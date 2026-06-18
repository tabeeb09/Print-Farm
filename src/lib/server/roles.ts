import { env } from "@/src/lib/server/env";

type RoleSource = Record<string, unknown> | null | undefined;

function readPath(source: RoleSource, dottedPath: string) {
  return dottedPath.split(".").reduce<unknown>((value, key) => {
    if (!value || typeof value !== "object") {
      return undefined;
    }

    return (value as Record<string, unknown>)[key];
  }, source);
}

export function extractRoles(source: RoleSource) {
  const configuredRoles = readPath(source, env.KEYCLOAK_ROLE_CLAIM_PATH);

  if (Array.isArray(configuredRoles)) {
    return configuredRoles.filter((role): role is string => typeof role === "string");
  }

  const realmRoles = readPath(source, "realm_access.roles");
  const clientRoles = env.KEYCLOAK_CLIENT_ID
    ? readPath(source, `resource_access.${env.KEYCLOAK_CLIENT_ID}.roles`)
    : undefined;

  return [realmRoles, clientRoles]
    .flatMap((value) => (Array.isArray(value) ? value : []))
    .filter((role): role is string => typeof role === "string");
}
