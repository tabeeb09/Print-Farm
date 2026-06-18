# OpenBao Setup Notes

This repository expects OpenBao KV v2 to be mounted at `kv/` and JWT auth to be enabled at `auth/jwt`.

## Preferred MVP flow

1. GitHub Actions requests an OIDC token.
2. The deployment workflow passes the short-lived JWT to `scripts/fetch-openbao-secrets.mjs`.
3. The script logs into OpenBao with JWT auth and the `github-actions-deploy` role.
4. OpenBao returns a short-lived client token scoped by policy.
5. The script reads KV v2 paths and writes `.env.runtime` plus per-service files under `secrets/`.

## Example bootstrap commands

```bash
bao secrets enable -path=kv kv-v2
bao auth enable jwt
bao policy write website-prod infra/openbao/policies/website-prod.hcl
bao policy write github-actions-deploy infra/openbao/policies/github-actions-deploy.hcl
bao policy write secret-admin infra/openbao/policies/secret-admin.hcl
```

## Example JWT auth role for GitHub Actions

Adjust the claims to match your GitHub org/repo/branch policy.

```bash
bao write auth/jwt/config \
  oidc_discovery_url="https://token.actions.githubusercontent.com" \
  bound_issuer="https://token.actions.githubusercontent.com"

bao write auth/jwt/role/github-actions-deploy \
  role_type="jwt" \
  user_claim="sub" \
  bound_audiences="https://github.com/OWNER" \
  bound_claims='{"repository":"OWNER/REPO","ref":"refs/heads/main"}' \
  token_policies="github-actions-deploy" \
  ttl="15m"
```

## Keycloak machine-token fallback

If you cannot use GitHub OIDC directly, mint a client-credentials JWT in Keycloak and map its issuer/audience/claims into an OpenBao JWT role with the same policy.

## Manual steps

- Mount KV v2 and create the `website/prod`, `rustfs/prod`, `oauth2-proxy/prod`, and `keycloak/prod` paths.
- Load the policy files from `infra/openbao/policies/`.
- Keep the root token for bootstrap and break-glass recovery only.
- Wire OpenBao audit or webhook events to `secret-refresh-relay`, or use scheduled polling as the MVP fallback.
