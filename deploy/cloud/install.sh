#!/usr/bin/env bash
# Radio Tower on a cloud server — Oracle Cloud "Always Free", or any fresh
# Ubuntu/Debian machine with a public address. Runs as root, once, on first
# boot (deploy/cloud/first-boot.sh fetches and starts it), and is safe to run
# again: every step checks before it changes anything.
#
# What it sets up:
#   /opt/radio-tower      the code, from GitHub (TOWER_REPO / TOWER_BRANCH)
#   /srv/radio/music      the library — filled from the laptop by
#                         `node library/bot.mjs publish` (library/README.md)
#   radio-tower.service   the station on 127.0.0.1:8080, serving the whole
#                         website (SITE_DIR) tuned to itself
#   Caddy                 HTTPS on a free name: <ip-with-dashes>.sslip.io,
#                         or TOWER_HOST if you have your own
#   iptables              ports 80 and 443 open (Oracle's Ubuntu images
#                         reject everything but SSH — the classic trap)
#   a daily update        pulls new code from GitHub at ~04:20 and restarts
#                         only if something changed
#
# Log: /var/log/radio-tower-install.log. The address and the station key end
# up in /srv/radio/TOWER.txt (root-only) and in the log's last lines.
set -euo pipefail

REPO="${TOWER_REPO:-https://github.com/TurnOposite/World-wide-web.git}"
BRANCH="${TOWER_BRANCH:-main}"
APP=/opt/radio-tower
DATA=/srv/radio
KEY="${TOWER_KEY:-}"
export DEBIAN_FRONTEND=noninteractive

step() { printf '\n==> %s\n' "$*"; }

[ "$(id -u)" -eq 0 ] || { echo "run as root (sudo bash $0)"; exit 1; }

step "packages"
echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections
echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections
apt-get update -y
apt-get install -y ca-certificates curl git gnupg openssl debian-keyring debian-archive-keyring apt-transport-https iptables-persistent netfilter-persistent

step "memory"
# The free AMD micro server has 1 GB. npm and a library scan want headroom.
if [ "$(awk '/MemTotal/ {print $2}' /proc/meminfo)" -lt 2000000 ] && ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

step "node 22"
if ! node -v 2>/dev/null | grep -qE '^v(2[2-9]|[3-9][0-9])\.'; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
node -v

step "caddy (https)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' -o /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

step "user and folders"
id radiotower >/dev/null 2>&1 || useradd --system --home-dir "$DATA" --shell /usr/sbin/nologin radiotower
mkdir -p "$DATA/music/_inbox" "$DATA/cache"

step "code ($REPO @ $BRANCH)"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch --depth 1 origin "$BRANCH"
  git -C "$APP" reset --hard "origin/$BRANCH"
else
  git clone --depth 1 --branch "$BRANCH" "$REPO" "$APP"
fi
cd "$APP"
npm ci --omit=dev --no-audit --no-fund
# The website, tuned to this server ('' = same origin). Node built-ins only.
SITE_TOWER='' SITE_DIST="$APP/dist-tower" node scripts/site-build.mjs

step "address"
IP="$(curl -fsS --max-time 10 https://api.ipify.org || curl -fsS --max-time 10 https://ifconfig.me || true)"
HOST="${TOWER_HOST:-${IP//./-}.sslip.io}"
echo "public address: ${IP:-unknown} → https://$HOST/"

step "settings"
if [ -f /etc/radio-tower.env ] && [ -z "$KEY" ]; then
  KEY="$(sed -n 's/^STATION_KEY=//p' /etc/radio-tower.env)"
fi
[ -n "$KEY" ] || KEY="$(openssl rand -hex 16)"
umask 077
cat > /etc/radio-tower.env <<EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=8080
MUSIC_DIR=$DATA/music
CACHE_FILE=$DATA/cache/library.json
SITE_DIR=$APP/dist-tower
STATION_KEY=$KEY
ALLOW_UPLOADS=1
UPLOAD_MAX_MB=2048
AUTO_RESCAN_MINUTES=30
STATION_EPOCH=2026-01-01T00:00:00Z
EOF
umask 022
chown -R radiotower:radiotower "$DATA"

step "service"
cat > /etc/systemd/system/radio-tower.service <<EOF
[Unit]
Description=Radio Tower — one signal, everyone on the same second
After=network-online.target
Wants=network-online.target

[Service]
User=radiotower
Group=radiotower
EnvironmentFile=/etc/radio-tower.env
WorkingDirectory=$APP
ExecStart=/usr/bin/node $APP/server/index.js
Restart=always
RestartSec=3
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=$DATA
ProtectHome=true
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable radio-tower >/dev/null
systemctl restart radio-tower

step "https: $HOST"
cat > /etc/caddy/Caddyfile <<EOF
# Radio Tower — written by deploy/cloud/install.sh
$HOST {
	# Caddy's encode only compresses text-like responses by default; the
	# audio (already compressed) goes through untouched.
	encode gzip
	reverse_proxy 127.0.0.1:8080 {
		flush_interval -1
	}
	# Uploads from the library bot can be large.
	request_body {
		max_size 2GB
	}
}
EOF
systemctl enable caddy >/dev/null
systemctl restart caddy

step "firewall (80, 443)"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT 2>/dev/null \
    || iptables -I INPUT 1 -p tcp --dport "$p" -m conntrack --ctstate NEW -j ACCEPT
done
netfilter-persistent save

step "daily update"
install -m 755 "$APP/deploy/cloud/update.sh" /usr/local/bin/radio-tower-update
cat > /etc/systemd/system/radio-tower-update.service <<EOF
[Unit]
Description=Radio Tower — pull new code and restart if it changed
[Service]
Type=oneshot
ExecStart=/usr/local/bin/radio-tower-update
EOF
cat > /etc/systemd/system/radio-tower-update.timer <<EOF
[Unit]
Description=Radio Tower — daily code update
[Timer]
OnCalendar=*-*-* 04:20:00
RandomizedDelaySec=20m
Persistent=true
[Install]
WantedBy=timers.target
EOF
systemctl daemon-reload
systemctl enable --now radio-tower-update.timer >/dev/null

step "check"
ok=0
for _ in $(seq 1 30); do
  if curl -fsS --max-time 3 http://127.0.0.1:8080/api/health >/dev/null; then ok=1; break; fi
  sleep 2
done
[ "$ok" = 1 ] && echo "the station answers on 127.0.0.1:8080" || echo "WARNING: the station is not answering yet — journalctl -u radio-tower -n 50"

umask 077
cat > "$DATA/TOWER.txt" <<EOF
Radio Tower — installed $(date -u +%FT%TZ)
address:     https://$HOST/
station key: $KEY
(the key lets the library bot upload music and the booth reorder the queue)
EOF
umask 022

printf '\n==> ON AIR\n    https://%s/\n    station key: %s\n' "$HOST" "$KEY"
echo "    (HTTPS can take a minute or two the very first time while the certificate is issued.)"
