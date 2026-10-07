#!/usr/bin/env bash
# Radio Tower — daily code update on the cloud tower (installed as
# /usr/local/bin/radio-tower-update by deploy/cloud/install.sh, run by
# radio-tower-update.timer). Pulls the branch the tower was installed from;
# restarts only when the code actually changed, so a quiet day is a no-op.
# The music and the settings are never touched.
set -euo pipefail
APP=/opt/radio-tower
cd "$APP"
before="$(git rev-parse HEAD)"
branch="$(git rev-parse --abbrev-ref HEAD)"
git fetch --depth 1 origin "$branch"
git reset --hard "origin/$branch"
after="$(git rev-parse HEAD)"
if [ "$before" = "$after" ]; then
  echo "radio-tower: already up to date ($after)"
  exit 0
fi
npm ci --omit=dev --no-audit --no-fund
SITE_TOWER='' SITE_DIST="$APP/dist-tower" node scripts/site-build.mjs
systemctl restart radio-tower
echo "radio-tower: updated $before → $after"
