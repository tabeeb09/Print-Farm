#!/usr/bin/env bash
set -euxo pipefail

systemctl reset-failed ssh ssh.socket sshd sshd.socket || true
systemctl enable --now ssh || true
systemctl restart ssh || true
systemctl status ssh --no-pager -l | sed -n '1,40p' || true
ss -ltnp '( sport = :22 )' || true

if [[ -x /opt/github-runner/svc.sh ]]; then
  cd /opt/github-runner
  ./svc.sh status || true
  ./svc.sh stop || true
  ./svc.sh start || true
  sleep 3
  ./svc.sh status || true
else
  echo "No GitHub runner install found at /opt/github-runner."
fi

systemctl --no-pager --type=service --state=running | grep -E 'actions|runner|ssh' || true
echo LIVE_RUNNER_SSH_FIX_DONE
