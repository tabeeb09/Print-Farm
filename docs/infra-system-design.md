# Infrastructure System Design

## Overview

This repository now supports a reusable self-hosted template built around:

- `website`: Next.js application with a minimal CMS at `/cms/media`
- `caddy`: public HTTPS ingress
- `rustfs`: S3-compatible object storage for public media
- `openbao`: source of truth for runtime secrets
- `keycloak`: OIDC identity and role provider
- `oauth2-proxy`: front door for weak-auth admin services such as the RustFS console
- `secret-refresh-relay`: small webhook bridge from OpenBao events to GitHub Actions

The implementation stays MVP-oriented: simple forms, simple tables, server-side auth checks, and a small number of scripts.

## Responsibility Boundaries

- `app.example.com`: public Next.js website and authenticated CMS
- `media.example.com`: public RustFS S3 endpoint for anonymous read access
- `rustfs-admin.example.com`: RustFS console behind OAuth2 Proxy
- `oauth2.example.com`: OAuth2 Proxy callback and auth endpoints
- `auth.example.com`: Keycloak
- `secrets.example.com`: OpenBao, protected operational endpoint

Only Caddy publishes `80` and `443`. Internal services stay on Docker networks and are routed through Caddy.

## Media Flow

1. Editors sign in to the website through NextAuth/Auth.js.
2. The CMS page calls Next.js server routes under `/api/cms/media/*`.
3. Those routes check the server-side session and Keycloak roles.
4. Listing and delete operations use the AWS SDK directly against RustFS.
5. Uploads use short-lived presigned PUT URLs so large files never proxy through Next.js.
6. Public media stays available directly from `media.example.com/<bucket>/<key>`.

## Keycloak Roles

Expected roles:

- `owner`
- `infra_admin`
- `media_admin`
- `editor`
- `viewer`

Default role rules in this repo:

- read access: `viewer`, `editor`, `media_admin`, `owner`
- write access: `media_admin`, `owner`

Role extraction defaults to `realm_access.roles` and can be overridden with `KEYCLOAK_ROLE_CLAIM_PATH`. If your realm stores client roles instead, use `resource_access.<client_id>.roles`.

## Auth.js / NextAuth Integration

The app can expose multiple SSO entry points, including Google and Keycloak. However, Keycloak remains the central role authority:

- every successful sign-in is matched to exactly one Keycloak user by email
- if no Keycloak user exists for that email, the app creates one
- if more than one Keycloak user exists for that email, sign-in is rejected
- CMS roles are resolved from the Keycloak user record rather than from the upstream social provider

This preserves a dedicated organisation-wide role assignment mechanism even when users authenticate through different identity sources.

Trusted roles are attached in the NextAuth JWT and session callbacks on the server. CMS API routes never trust role data coming from browser requests.

## OpenBao Secret Ownership

OpenBao is the runtime source of truth for:

- website auth secrets
- RustFS credentials
- Keycloak client credentials
- OAuth2 Proxy secrets
- deploy-time runtime configuration

Suggested KV v2 paths:

- `kv/website/prod`
- `kv/rustfs/prod`
- `kv/keycloak/prod`
- `kv/oauth2-proxy/prod`
- `kv/github/prod`

The script at `scripts/fetch-openbao-secrets.mjs` authenticates with JWT auth, reads those paths, and writes `.env.runtime` plus per-service env files under `secrets/`.

## Secret Refresh Design

Preferred path:

1. OpenBao audit or webhook event is sent to `secret-refresh-relay`.
2. The relay verifies `SECRET_REFRESH_WEBHOOK_SECRET`.
3. The relay triggers `repository_dispatch` with event type `secrets_changed`.
4. GitHub Actions obtains an OIDC token.
5. The VPS runs `npm run fetch:openbao-secrets`.
6. Docker Compose restarts the affected services, or runs `docker compose up -d` safely.

Fallbacks if your OpenBao installation cannot emit a webhook:

- scheduled polling of KV metadata versions
- manual `workflow_dispatch`
- log tailer sidecar that emits a relay call

## OAuth2 Proxy Placement

OAuth2 Proxy fronts services that should not be directly public:

- RustFS admin console
- future weak-auth tools such as Grafana or internal dashboards

It should not protect `media.example.com`, because browsers must be able to fetch assets directly.

## Docker Compose Layout

For local Windows development, the repository now uses two Compose entry points:

- `docker-compose.yaml`: bootstrap services only
- `docker-compose.full.yaml`: the full deployment-oriented stack

Bootstrap services:

- `rustfs`
- `keycloak`
- `keycloak-db`
- `openbao`

Full stack services:

- `website`
- `caddy`
- `rustfs`
- `openbao`
- `keycloak`
- `keycloak-db`
- `oauth2-proxy`
- `secret-refresh-relay`

Persistent volumes are used for:

- Caddy data and config
- RustFS data
- OpenBao file storage
- Keycloak PostgreSQL data

## Local Bootstrap

Use the bootstrap stack first so you can obtain the values you need before running the website or proxy layers.

1. Copy [.env.local.bootstrap.example](C:/website/oi.loftrop.com-main/.env.local.bootstrap.example) into a real local env file or export the same values in PowerShell.
2. Run `docker compose --env-file .env.local.bootstrap.example up -d`.
3. Open:
   - RustFS API: `http://localhost:9000`
   - RustFS admin console: `http://localhost:9001`
   - Keycloak admin: `http://localhost:8080`
   - OpenBao dev server: `http://localhost:8200`
4. In RustFS, create the `public-media` bucket and keep note of:
   - `S3_ACCESS_KEY_ID`
   - `S3_SECRET_ACCESS_KEY`
   - `S3_BUCKET`
   - `S3_ENDPOINT=http://localhost:9000`
   - `S3_PUBLIC_ENDPOINT=http://localhost:9000`
   - The bootstrap defaults in this repo are `rustfsadmin` / `rustfsadmin`
5. In Keycloak, create the `website` and `oauth2-proxy` clients and then fill:
   - `KEYCLOAK_ISSUER=http://localhost:8080/realms/<your-realm>`
   - `KEYCLOAK_CLIENT_ID`
   - `KEYCLOAK_CLIENT_SECRET`
   - `KEYCLOAK_ADMIN_REALM=master`
   - `KEYCLOAK_ADMIN_CLIENT_ID=admin-cli` for local dev, or a dedicated service-account client for shared environments
   - `KEYCLOAK_ADMIN_USERNAME`
   - `KEYCLOAK_ADMIN_PASSWORD` for local dev, or `KEYCLOAK_ADMIN_CLIENT_SECRET` for a service account
   - `OAUTH2_PROXY_CLIENT_ID`
   - `OAUTH2_PROXY_CLIENT_SECRET`
6. Generate `OAUTH2_PROXY_COOKIE_SECRET` locally.
7. Fill those values into your real app env file.
8. Start the Next app with `npm run dev`.

Only move to `docker-compose.full.yaml` after the website works locally.

## Full Stack / VPS Deployment

1. Provision DNS records for `app`, `media`, `rustfs-admin`, `oauth2`, `auth`, and `secrets`.
2. Install Docker and Docker Compose.
3. Clone the repo into `DEPLOY_PATH`.
4. Provide a short-lived JWT source for OpenBao on the host or via GitHub Actions.
5. Run `npm run fetch:openbao-secrets -- --dry-run` to validate configuration.
6. Run `npm run fetch:openbao-secrets`.
7. Run `docker compose -f docker-compose.full.yaml up -d`.

## Manual Setup Still Required

### RustFS

- Create the `public-media` bucket.
- Make the bucket public-read for object GET access only.
- Confirm the admin console is reachable only through OAuth2 Proxy.

### Keycloak

- Create clients for `website` and `oauth2-proxy`.
- Disable duplicate emails in the realm.
- Create or configure a dedicated admin/service-account credential so the app can sync external SSO users into Keycloak and resolve roles by email.
- If you also broker Google or other external IdPs through Keycloak, keep the same “one Keycloak user per email” rule.
- Configure callback URLs:
  - `https://app.example.com/api/auth/callback/keycloak`
  - `https://oauth2.example.com/oauth2/callback`
- Add role mappers so roles appear in the configured claim path.
- Assign `owner` and `media_admin` to CMS operators.

### OpenBao

- Enable KV v2 and JWT auth.
- Write the provided policies.
- Create the JWT role used by GitHub Actions or the VPS token source.
- Configure audit/webhook forwarding or choose the polling fallback.

### GitHub Actions

- Add `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_PATH`, and `DEPLOY_SSH_KEY` secrets.
- Ensure the repository can request OIDC tokens.
- Confirm the GHCR package permission model matches the workflow.

### Caddy / DNS

- Replace example hostnames with real domains.
- Confirm TLS issuance and reverse proxy routing on the VPS.

## Verification Commands

```bash
docker compose --env-file .env.local.bootstrap.example config
docker compose --env-file .env.local.bootstrap.example up -d
npm run fetch:openbao-secrets -- --dry-run
npm run build
docker compose -f docker-compose.full.yaml --env-file .env.example config
```

Manual checks:

- the website responds through Caddy
- `/cms/media` redirects unauthenticated users to sign-in
- users without `viewer`/`editor`/`media_admin`/`owner` cannot list media
- users without `media_admin`/`owner` cannot upload or delete
- presigned upload URLs are created and uploads land in RustFS
- `repository_dispatch` can trigger the secret refresh workflow

## Known MVP Limitations

- `sync` currently re-reads remote object metadata; it does not mirror a local folder tree.
- The relay expects a webhook-like payload and may need adaptation to match your OpenBao audit format.
- The Caddyfile uses example hostnames and should be templated or replaced during deployment.
