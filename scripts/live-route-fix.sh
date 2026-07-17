#!/usr/bin/env bash
set -euo pipefail

cd /srv/website/app
git config --global --add safe.directory /srv/website/app

APP_HOST="oi.loftrop.com" \
WEBSITE_ALIAS_HOSTS="www.loftrop.com, loftrop.com" \
MEDIA_HOST="media.loftrop.com" \
RUSTFS_ADMIN_HOST="rustfs-admin.loftrop.com" \
OAUTH2_PROXY_HOST="oauth2.loftrop.com" \
bash scripts/configure-single-vps-routing.sh

systemctl restart ssh || systemctl restart sshd || true
echo LIVE_ROUTE_FIX_DONE
