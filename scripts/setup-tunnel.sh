#!/usr/bin/env bash
#
# Radio Tower — publish the station on the public internet via Cloudflare Tunnel.
#
# Why a tunnel rather than port forwarding:
#   - no inbound ports opened on your router, so the Pi is not directly exposed
#   - works behind CGNAT and on a dynamic IP
#   - free TLS, and Cloudflare absorbs traffic spikes instead of your uplink
#
# Two modes:
#   sudo bash scripts/setup-tunnel.sh quick
#       Zero config. Gives you a random *.trycloudflare.com URL. Great for
#       "listen to this right now", but the URL changes on every restart.
#
#   sudo bash scripts/setup-tunnel.sh named tower.example.com
#       Permanent named tunnel on a domain you have in Cloudflare. Requires an
#       interactive browser login the first time.

set -euo pipefail

MODE="${1:-quick}"
HOSTNAME_ARG="${2:-}"
PORT="${PORT:-8080}"
TUNNEL_NAME="${TUNNEL_NAME:-radio-tower}"

log()  { printf '\033[1;33m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;31m!!\033[0m %s\n' "$*" >&2; }
die()  { warn "$*"; exit 1; }

[[ $EUID -eq 0 ]] || die "run me with sudo"

# --- install cloudflared ------------------------------------------------------
if ! command -v cloudflared >/dev/null 2>&1; then
  log "installing cloudflared"
  ARCH="$(dpkg --print-architecture)"   # arm64 on Pi 4/5 64-bit, armhf on 32-bit
  case "$ARCH" in
    arm64) PKG=cloudflared-linux-arm64.deb ;;
    armhf) PKG=cloudflared-linux-armhf.deb ;;
    amd64) PKG=cloudflared-linux-amd64.deb ;;
    *) die "unsupported architecture: $ARCH" ;;
  esac
  curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/${PKG}"
  dpkg -i /tmp/cloudflared.deb
  rm -f /tmp/cloudflared.deb
fi
log "cloudflared $(cloudflared --version 2>/dev/null | head -1)"

# --- make sure the station is actually up -------------------------------------
curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null \
  || die "the station is not answering on port ${PORT} — start it first (sudo systemctl start radiotower)"

case "$MODE" in

  quick)
    log "starting a quick tunnel (ephemeral URL, foreground)"
    echo
    echo "  Watch for a line like:  https://something-random.trycloudflare.com"
    echo "  That is your public station. Ctrl-C to take it down."
    echo
    exec cloudflared tunnel --url "http://localhost:${PORT}"
    ;;

  named)
    [[ -n "$HOSTNAME_ARG" ]] || die "usage: setup-tunnel.sh named tower.example.com"

    if [[ ! -f /root/.cloudflared/cert.pem ]]; then
      log "you need to authorise this machine with Cloudflare once"
      echo "  A URL will be printed — open it on any device and pick your domain."
      cloudflared tunnel login
    fi

    if ! cloudflared tunnel list 2>/dev/null | grep -q "\b${TUNNEL_NAME}\b"; then
      log "creating tunnel '${TUNNEL_NAME}'"
      cloudflared tunnel create "$TUNNEL_NAME"
    else
      log "tunnel '${TUNNEL_NAME}' already exists"
    fi

    TUNNEL_ID="$(cloudflared tunnel list --output json | python3 -c \
      "import sys,json;print(next(t['id'] for t in json.load(sys.stdin) if t['name']=='${TUNNEL_NAME}'))")"
    log "tunnel id: $TUNNEL_ID"

    log "pointing ${HOSTNAME_ARG} at the tunnel"
    cloudflared tunnel route dns "$TUNNEL_NAME" "$HOSTNAME_ARG"

    log "writing /etc/cloudflared/config.yml"
    mkdir -p /etc/cloudflared
    SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
    sed -e "s|REPLACE_WITH_TUNNEL_ID|${TUNNEL_ID}|g" \
        -e "s|REPLACE_WITH_HOSTNAME|${HOSTNAME_ARG}|g" \
        -e "s|http://localhost:8080|http://localhost:${PORT}|g" \
        "$SRC_DIR/deploy/cloudflared-config.yml" > /etc/cloudflared/config.yml

    # The credentials file lands in ~/.cloudflared on create; move it where the
    # service expects it.
    if [[ -f "/root/.cloudflared/${TUNNEL_ID}.json" ]]; then
      cp "/root/.cloudflared/${TUNNEL_ID}.json" "/etc/cloudflared/${TUNNEL_ID}.json"
      chmod 0600 "/etc/cloudflared/${TUNNEL_ID}.json"
    fi

    log "installing the cloudflared service"
    cloudflared service install 2>/dev/null || true
    systemctl enable --now cloudflared
    sleep 4
    systemctl is-active --quiet cloudflared && log "cloudflared is running" || warn "cloudflared is not running — journalctl -u cloudflared -n 50"

    cat <<EOF

  Radio Tower is public.

    https://${HOSTNAME_ARG}

  DNS can take a minute to propagate the first time.
  Logs: sudo journalctl -u cloudflared -f

EOF
    ;;

  *)
    die "unknown mode '$MODE' — use 'quick' or 'named'"
    ;;
esac
