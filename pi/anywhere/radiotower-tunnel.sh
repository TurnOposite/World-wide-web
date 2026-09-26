#!/usr/bin/env bash
#
# Radio Tower — keep the station reachable from the public internet.
#
# Run by radiotower-tunnel.service (Restart=always), so this script's only job
# is to exec the right cloudflared for the settings radiotower-online wrote:
#
#   RT_MODE=domain   a named, remotely-managed Cloudflare Tunnel. The public
#                    hostname (radio.example.com → http://localhost:8080) is
#                    configured once in the Cloudflare dashboard, not here, so
#                    the Pi needs nothing but the token. Outbound-only: it
#                    works behind any router, CGNAT, hotel Wi-Fi or phone
#                    tether, with no port forwarding and no router login —
#                    which is the whole reason it can "just work" anywhere.
#
#   RT_MODE=local    no token. Exit 0 and stay down; the station is still on
#                    the local network at http://radiotower.local:8080.
#
# Why not just `cloudflared service install <token>`: that bakes the token
# into a unit file cloudflared owns. Keeping it in /etc/radiotower/online.env
# means changing domains is "edit one text file on the SD card", same as Wi-Fi.
#
#   radiotower-tunnel --dry-run     print the command it would exec

set -euo pipefail

ENV_FILE="${RT_ONLINE_ENV:-/etc/radiotower/online.env}"
CLOUDFLARED="${RT_CLOUDFLARED:-cloudflared}"
PORT="${PORT:-8080}"
DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

RT_MODE=local; TUNNEL_TOKEN=""; RT_DOMAIN=""
# shellcheck disable=SC1090
[[ -r "$ENV_FILE" ]] && source "$ENV_FILE"

if [[ "$RT_MODE" != "domain" || -z "$TUNNEL_TOKEN" ]]; then
  echo "radiotower-tunnel: no tunnel token configured — staying on the local network only."
  echo "radiotower-tunnel: put TUNNEL_TOKEN = ... in radiotower-online.txt on the SD card (see pi/anywhere/DOMAIN.md)."
  exit 0
fi

# Hand the token over the quietest way this cloudflared supports. A token on
# the command line is visible to every local user in `ps`; the environment
# and a file are not. Older builds only know --token, so fall back to that.
HELP="$("$CLOUDFLARED" tunnel run --help 2>&1 || true)"
ARGS=(tunnel --no-autoupdate --metrics 127.0.0.1:20241 run)
if grep -q -- '--token-file' <<<"$HELP"; then
  TOKEN_FILE="${RT_TOKEN_FILE:-/run/radiotower/tunnel.token}"
  if [[ $DRY_RUN -eq 0 ]]; then
    mkdir -p "$(dirname "$TOKEN_FILE")"
    (umask 077; printf '%s' "$TUNNEL_TOKEN" > "$TOKEN_FILE")
  fi
  ARGS+=(--token-file "$TOKEN_FILE")
  unset TUNNEL_TOKEN
elif grep -q 'TUNNEL_TOKEN' <<<"$HELP"; then
  export TUNNEL_TOKEN
else
  ARGS+=(--token "$TUNNEL_TOKEN")
fi

echo "radiotower-tunnel: publishing http://localhost:${PORT} as ${RT_DOMAIN:-the hostname set in Cloudflare}"
if [[ $DRY_RUN -eq 1 ]]; then
  printf 'PLAN: %s' "$CLOUDFLARED"
  for a in "${ARGS[@]}"; do [[ "$a" == eyJ* ]] && a='<token>'; printf ' %s' "$a"; done
  printf '\n'
  exit 0
fi
exec "$CLOUDFLARED" "${ARGS[@]}"
