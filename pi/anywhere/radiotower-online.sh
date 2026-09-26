#!/usr/bin/env bash
#
# Radio Tower — read radiotower-online.txt from the boot partition and turn
# it into the settings the tunnel, the setup hotspot and the watchdog use.
#
# THE PROBLEM THIS SOLVES
#
# "Take the Pi anywhere, plug it in, and the site is live on my domain." The
# domain part needs a Cloudflare Tunnel token on the Pi. The tower must never
# need SSH for that — the same reason pi/wifi/ exists — so the token lives in
# a plain text file on the FAT32 boot partition, where Windows can write it.
#
# On every boot this script copies what it finds there into
# /etc/radiotower/online.env (root-only, 0600), which is what the tunnel
# service actually reads. The boot-partition copy can then be deleted by the
# owner without the tower forgetting it (same honest warning as the Wi-Fi
# file: FAT32 has no permissions).
#
# FORMAT (one setting per line, "#" starts a comment, CRLF from Notepad is fine)
#
#     DOMAIN        = radio.example.com
#     TUNNEL_TOKEN  = eyJhIjoi...           (Cloudflare → Networking → Tunnels)
#     SETUP_HOTSPOT = Radio Tower Setup | atleast8chars
#     NOTIFY        = my-secret-ntfy-topic  (optional push when it comes online)
#
# USAGE
#
#   sudo radiotower-online              apply the file
#   sudo radiotower-online --status     print what is configured (token masked)
#   sudo radiotower-online --dry-run    print what would be written, write nothing

set -euo pipefail

CONFIG_FILE="${RT_ONLINE_CONFIG:-/boot/firmware/radiotower-online.txt}"
ENV_FILE="${RT_ONLINE_ENV:-/etc/radiotower/online.env}"
SYSTEMCTL="${RT_SYSTEMCTL:-systemctl}"

DEFAULT_SETUP_SSID="Radio Tower Setup"
DEFAULT_SETUP_PASS="radiotower"

DRY_RUN=0; STATUS_ONLY=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --status)  STATUS_ONLY=1 ;;
    -h|--help) sed -n '2,32p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'unknown option: %s (try --help)\n' "$arg" >&2; exit 2 ;;
  esac
done

G=$'\033[0;32m'; R=$'\033[1;31m'; Y=$'\033[1;33m'; D=$'\033[2m'; N=$'\033[0m'
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$R" "$N" "$*" >&2; }
note() { printf '  %s%s%s\n' "$D" "$*" "$N"; }
step() { printf '\n%s==> %s%s\n' "$Y" "$*" "$N"; }

trim() { local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }
mask() { local s="$1"; [[ ${#s} -le 10 ]] && { printf '(set)'; return; }; printf '%s…%s (%d chars)' "${s:0:6}" "${s: -4}" "${#s}"; }

DOMAIN=""; TUNNEL_TOKEN=""; SETUP_SSID=""; SETUP_PASS=""; NOTIFY=""
MALFORMED=0

parse_config() {
  local raw line key val lineno=0
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    lineno=$((lineno + 1))
    line="${raw%$'\r'}"
    line="$(trim "$line")"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
    if [[ "$line" != *"="* ]]; then
      warn "line $lineno ignored — expected NAME = value: $line"
      MALFORMED=$((MALFORMED + 1)); continue
    fi
    key="$(trim "${line%%=*}")"; key="${key^^}"
    val="$(trim "${line#*=}")"
    case "$key" in
      DOMAIN)
        # People paste URLs. Keep only the host.
        val="${val#http://}"; val="${val#https://}"; val="${val%%/*}"
        DOMAIN="$val" ;;
      TUNNEL_TOKEN|TOKEN)
        # A token is one unbroken base64 string. Someone pasting the whole
        # "sudo cloudflared service install eyJ..." line should still work.
        val="${val##* }"
        TUNNEL_TOKEN="$val" ;;
      SETUP_HOTSPOT|HOTSPOT)
        if [[ "$val" == *"|"* ]]; then
          SETUP_SSID="$(trim "${val%%|*}")"; SETUP_PASS="$(trim "${val#*|}")"
        else
          SETUP_SSID="$val"
        fi ;;
      NOTIFY) NOTIFY="$val" ;;
      *) warn "line $lineno ignored — unknown setting \"$key\""; MALFORMED=$((MALFORMED + 1)) ;;
    esac
  done < "$CONFIG_FILE"
}

step "Reading $CONFIG_FILE"
# What the tower already knows is the starting point. A line in the file
# overrides it; a line that is ABSENT keeps it. That is what lets the owner
# delete the token from the FAT32 card after first boot without the tower
# going dark — while "TUNNEL_TOKEN =" with nothing after it still clears it.
if [[ -r "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  DOMAIN="${RT_DOMAIN:-}"; TUNNEL_TOKEN="${TUNNEL_TOKEN:-}"
  SETUP_SSID="${RT_SETUP_SSID:-}"; SETUP_PASS="${RT_SETUP_PASS:-}"; NOTIFY="${RT_NOTIFY:-}"
fi
if [[ -f "$CONFIG_FILE" ]]; then
  parse_config
else
  note "no online config on the boot partition — keeping what the tower already knows"
  if [[ -f "$ENV_FILE" ]]; then
    ok "existing settings in $ENV_FILE stay in force"
    exit 0
  fi
  note "(first boot with no file: local network only, setup hotspot uses the defaults)"
fi

# ----------------------------------------------------------- validation ----
if [[ -n "$TUNNEL_TOKEN" && ! "$TUNNEL_TOKEN" =~ ^eyJ[A-Za-z0-9_=-]+$ ]]; then
  warn "TUNNEL_TOKEN does not look like a Cloudflare tunnel token (they start with eyJ) — ignoring it"
  note "copy it again from Cloudflare → Networking → Tunnels → your tunnel → the install command"
  TUNNEL_TOKEN=""
fi
if [[ -n "$DOMAIN" && ! "$DOMAIN" =~ ^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$ ]]; then
  warn "DOMAIN \"$DOMAIN\" is not a hostname — ignoring it"
  DOMAIN=""
fi
if [[ -z "$SETUP_SSID" ]]; then SETUP_SSID="$DEFAULT_SETUP_SSID"; fi
if [[ -z "$SETUP_PASS" ]]; then SETUP_PASS="$DEFAULT_SETUP_PASS"; fi
if [[ ${#SETUP_PASS} -lt 8 || ${#SETUP_PASS} -gt 63 ]]; then
  warn "setup hotspot password must be 8–63 characters (WPA2) — using the default instead"
  SETUP_PASS="$DEFAULT_SETUP_PASS"
fi
if [[ -n "$NOTIFY" && ! "$NOTIFY" =~ ^(https://[A-Za-z0-9./_-]+|[A-Za-z0-9_-]{6,64})$ ]]; then
  warn "NOTIFY must be an ntfy topic name (letters, digits, - and _) or an https:// URL — ignoring it"
  NOTIFY=""
fi

MODE="local"
[[ -n "$TUNNEL_TOKEN" ]] && MODE="domain"

step "What the tower will do"
case "$MODE" in
  domain) ok "go public on ${DOMAIN:-your Cloudflare domain} through a named Cloudflare Tunnel $(mask "$TUNNEL_TOKEN")" ;;
  local)  ok "no tunnel token — the station stays on the local network (see pi/anywhere/DOMAIN.md)" ;;
esac
ok "setup hotspot when no known Wi-Fi is in range: \"$SETUP_SSID\""
[[ -n "$NOTIFY" ]] && ok "push notification when it comes online: ntfy ${NOTIFY}"
[[ $MALFORMED -gt 0 ]] && warn "$MALFORMED line(s) skipped — see above"

if [[ $STATUS_ONLY -eq 1 ]]; then exit 0; fi

# printf %q quotes anything a shell or systemd EnvironmentFile would trip on
# (spaces in an SSID, $ in a password).
render_env() {
  printf '# Written by radiotower-online from %s — edit that file, not this one.\n' "$CONFIG_FILE"
  printf 'RT_MODE=%s\n' "$MODE"
  printf 'RT_DOMAIN=%q\n' "$DOMAIN"
  printf 'TUNNEL_TOKEN=%q\n' "$TUNNEL_TOKEN"
  printf 'RT_SETUP_SSID=%q\n' "$SETUP_SSID"
  printf 'RT_SETUP_PASS=%q\n' "$SETUP_PASS"
  printf 'RT_NOTIFY=%q\n' "$NOTIFY"
}

if [[ $DRY_RUN -eq 1 ]]; then
  step "Would write $ENV_FILE"
  render_env | sed -E 's/^(TUNNEL_TOKEN=).+$/\1<masked>/; s/^(RT_SETUP_PASS=).+$/\1<masked>/; s/^/  PLAN: /'
  exit 0
fi

mkdir -p "$(dirname "$ENV_FILE")"
umask 077
tmp="$(mktemp "${ENV_FILE}.XXXXXX")"
render_env > "$tmp"
chmod 0600 "$tmp"
mv -f "$tmp" "$ENV_FILE"
ok "wrote $ENV_FILE (readable by root only)"

# The tunnel reads these settings when it starts, so a changed token means a
# restart; no token means it should not be running at all. Never fatal on a
# box where the unit does not exist yet.
if [[ "$MODE" == "domain" ]]; then
  "$SYSTEMCTL" restart --no-block radiotower-tunnel.service >/dev/null 2>&1 || true
else
  "$SYSTEMCTL" stop --no-block radiotower-tunnel.service >/dev/null 2>&1 || true
fi
exit 0
