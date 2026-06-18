# App VPS Bootstrap

This repo now assumes:

- `OpenBao` runs on a separate corporate secrets VPS.
- `Keycloak` runs on that same separate auth/policy VPS.
- This app VPS fetches runtime secrets from OpenBao using `AppRole`.
- The website image is built by GitHub Actions and pulled from GHCR.

## Runtime files on the app VPS

- `/etc/website/base.env`
  - non-secret deploy configuration
  - hostnames, image name, OpenBao URL, Keycloak issuer, bucket names
- `/etc/website/openbao-bootstrap.env`
  - one-time AppRole bootstrap credentials
  - `BAO_ADDR`, `OPENBAO_ROLE_ID`, `OPENBAO_SECRET_ID`
- `/etc/website/runtime.env`
  - last fetched secrets from OpenBao
- `/etc/website/deploy.env`
  - merged env file used by `docker compose`

## GHCR image

The GitHub Actions workflow `.github/workflows/build-and-push.yml` publishes:

```text
ghcr.io/tabeeb09/website:latest
ghcr.io/tabeeb09/website:sha-<commit>
```

For the simplest VPS flow, make the GHCR package public in GitHub:

```text
GitHub repo -> Packages -> website -> Package settings -> Change visibility -> Public
```

With a public package, the VPS does not need `docker login` for GHCR.

Only the custom Next.js website container is published under your GHCR namespace:

```text
website -> ghcr.io/tabeeb09/website:latest
```

The other containers remain pinned to their upstream public images:

```text
caddy        -> caddy:2.9-alpine
rustfs       -> rustfs/rustfs:latest
oauth2-proxy -> quay.io/oauth2-proxy/oauth2-proxy:v7.8.1
```

To test anonymous pulling from any web-connected Docker host:

```bash
docker pull ghcr.io/tabeeb09/website:latest
```

Or from this repo after Docker is installed:

```bash
./scripts/test-ghcr-pull.sh
```

## Blank VPS flow

Minimal manual flow:

```bash
sudo apt-get update
sudo apt-get install -y git
git clone https://github.com/tabeeb09/oi.loftrop.com.git /srv/website/app
cd /srv/website/app
sudo bash scripts/setup-app-vps.sh
```

The setup script installs missing dependencies through `provision-app-vps.sh`, asks for non-secret deployment URLs if the base env still contains placeholders, prompts for OpenBao AppRole credentials, fetches secrets from OpenBao, pulls container images, and starts the stack.

Detailed flow:

1. GitHub Actions runs `scripts/provision-app-vps.sh`
2. The script installs Docker, clones the repo to `/srv/website/app`, and copies `deploy/app-vps.base.env.example` to `/etc/website/base.env`
3. Edit `/etc/website/base.env` with the real non-secret project settings
4. SSH to the VPS over your admin path and run:

```bash
cd /srv/website/app
sudo PROJECT_ROOT=/srv/website/app PROJECT_NAME=website ./scripts/bootstrap-app-vps.sh
```

5. The script prompts for:
   - `BAO_ADDR`
   - `OPENBAO_ROLE_ID`
   - `OPENBAO_SECRET_ID`
6. The script stores them in `/etc/website/openbao-bootstrap.env`
7. The script fetches secrets from OpenBao, generates `/etc/website/deploy.env`, and completes bootstrap
8. Then deploy:

```bash
cd /srv/website/app
sudo PROJECT_ROOT=/srv/website/app PROJECT_NAME=website ./scripts/deploy-app-vps.sh
```

That deploy command runs:

```text
docker compose pull
docker compose up -d
```

The VPS does not build the website image.

## Existing VPS flow

GitHub Actions can run:

1. repo update on VPS
2. `scripts/bootstrap-app-vps.sh`
   - uses existing AppRole credentials
   - fails cleanly if they are missing or invalid
3. `scripts/deploy-app-vps.sh`

If AppRole credentials become invalid, bootstrap fails and the operator must re-run it interactively over SSH or VPN to paste new credentials.
