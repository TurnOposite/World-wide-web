#!/usr/bin/env bash
#
# Radio Tower — the watchdog. Keeps the station live without anyone logging in.
#
# Run once a minute by radiotower-watchdog.timer. Each run looks at three
# things, fixes what it can, and writes down what it saw:
#
#   1. THE STATION   /api/health must answer. Three misses in a row →
#                    restart radiotower.service. (systemd's Restart=always
#                    covers a crash; this covers a process that is alive but
#                    wedged, which Restart= cannot see.)
#
#   2. THE NETWORK   Three minutes with no route to the internet while on
#                    Wi-Fi → re-run radiotower-network, which rejoins a known
#                    network or, failing that, brings up the setup hotspot.
#                    While the setup hotspot is up and nobody is connected to
#                    it, look for known networks again every few minutes —
#                    the router may simply have been rebooting.
#
#   3. THE TUNNEL    In domain mode, cloudflared's /ready must say connected.
#                    Three misses while the internet is fine → restart it.
#
# What it saw goes to /run/radiotower/status.json (read by the setup portal)
# and, only when the state CHANGES, to radiotower-status.txt on the SD card's
# boot partition — so if the tower ever seems dead, pull the card and read
# what it last knew. (Only on change: an SD card written to every minute is an
# SD card that dies young.)
#
#   radiotower-watchdog              one pass
#   radiotower-watchdog --dry-run    one pass, print the actions instead of doing them

set -uo pipefail

STATE_DIR="${RT_STATE_DIR:-/run/radiotower}"
BOOT_STATUS="${RT_BOOT_STATUS:-/boot/firmware/radiotower-status.txt}"
ONLINE_ENV="${RT_ONLINE_ENV:-/etc/radiotower/online.env}"
CURL="${RT_CURL:-curl}"
NMCLI="${RT_NMCLI:-nmcli}"
IW="${RT_IW:-iw}"
SYSTEMCTL="${RT_SYSTEMCTL:-systemctl}"
NETWORK_CMD="${RT_NETWORK_CMD:-/usr/local/sbin/radiotower-network}"
WIFI_IFACE="${RT_WIFI_IFACE:-wlan0}"
PORT="${PORT:-8080}"
NOW="${RT_NOW:-$(date +%s)}"

STRIKES="${RT_STRIKES:-3}"                 # consecutive bad checks before acting
HOTSPOT_RETRY_SECONDS="${RT_HOTSPOT_RETRY:-300}"

DRY_RUN=0
[[ "${1:-}" == "--dry-run" ]] && DRY_RUN=1

act() {
  if [[ $DRY_RUN -eq 1 ]]; then printf 'PLAN: %s\n' "$*"; return 0; fi
  "$@" >/dev/null 2>&1 || true
}
log() { printf 'radiotower-watchdog: %s\n' "$*"; }

mkdir -p "$STATE_DIR" 2>/dev/null || true
STATE_FILE="$STATE_DIR/watchdog.state"

# Counters survive between runs in /run (tmpfs: gone after a reboot, which is
# exactly right — a reboot is a fresh start).
station_fails=0; offline=0; tunnel_fails=0; last_retry=0; last_state=""; notified=""
# shellcheck disable=SC1090
[[ -r "$STATE_FILE" ]] && source "$STATE_FILE"

RT_MODE=local; RT_DOMAIN=""; RT_NOTIFY=""
# shellcheck disable=SC1090
[[ -r "$ONLINE_ENV" ]] && source "$ONLINE_ENV"

# ------------------------------------------------------------- 1. station --
station="down"
if "$CURL" -fsS -m 5 -o /dev/null "http://127.0.0.1:${PORT}/api/health" 2>/dev/null; then
  station="up"; station_fails=0
else
  station_fails=$((station_fails + 1))
  log "station did not answer (${station_fails}/${STRIKES})"
  if [[ $station_fails -ge $STRIKES ]]; then
    log "restarting radiotower.service"
    act "$SYSTEMCTL" restart radiotower.service
    station_fails=0
  fi
fi

# ------------------------------------------------------------- 2. network --
active="$("$NMCLI" -t -f NAME,DEVICE connection show --active 2>/dev/null || true)"
hotspot=0
grep -q '^rt-hotspot:' <<<"$active" && hotspot=1
uplink="$(grep -v '^rt-hotspot:' <<<"$active" | grep -v ':lo$' | head -1 | cut -d: -f1)"
uplink="${uplink#rt-}"

internet="no"
if [[ $hotspot -eq 0 ]] && "$CURL" -fsS -m 6 -o /dev/null https://1.1.1.1/cdn-cgi/trace 2>/dev/null; then
  internet="yes"; offline=0
fi

if [[ $hotspot -eq 1 ]]; then
  offline=0
  clients="$("$IW" dev "$WIFI_IFACE" station dump 2>/dev/null | grep -c '^Station' || true)"
  clients="${clients:-0}"
  # Never pull the hotspot out from under someone using the setup page.
  if [[ "$clients" -eq 0 && $((NOW - last_retry)) -ge $HOTSPOT_RETRY_SECONDS ]]; then
    log "setup hotspot is up with nobody on it — looking for known networks again"
    act "$NETWORK_CMD" --retry
    last_retry=$NOW
  fi
elif [[ "$internet" == "no" ]]; then
  offline=$((offline + 1))
  log "no internet (${offline}/${STRIKES})"
  if [[ $offline -ge $STRIKES ]]; then
    log "re-running radiotower-network"
    act "$NETWORK_CMD"
    offline=0
  fi
fi

# -------------------------------------------------------------- 3. tunnel --
tunnel="off"
if [[ "$RT_MODE" == "domain" ]]; then
  if "$CURL" -fsS -m 3 -o /dev/null "http://127.0.0.1:20241/ready" 2>/dev/null; then
    tunnel="connected"; tunnel_fails=0
  else
    tunnel="down"
    if [[ "$internet" == "yes" ]]; then
      tunnel_fails=$((tunnel_fails + 1))
      log "tunnel not connected (${tunnel_fails}/${STRIKES})"
      if [[ $tunnel_fails -ge $STRIKES ]]; then
        log "restarting radiotower-tunnel.service"
        act "$SYSTEMCTL" restart radiotower-tunnel.service
        tunnel_fails=0
      fi
    fi
  fi
fi

# -------------------------------------------------------------- 4. report --
if [[ $hotspot -eq 1 ]]; then state="setup hotspot — join it from a phone to pick a Wi-Fi"
elif [[ "$station" != "up" ]]; then state="station not answering"
elif [[ "$tunnel" == "connected" ]]; then state="live on https://${RT_DOMAIN:-your domain}"
elif [[ "$internet" == "yes" && "$RT_MODE" == "domain" ]]; then state="on the local network; tunnel reconnecting"
elif [[ "$internet" == "yes" ]]; then state="on the local network (no tunnel token)"
else state="no internet — local network only"
fi

addr="$(hostname -I 2>/dev/null | awk '{print $1}')"
json_str() { local s="${1//\\/\\\\}"; s="${s//\"/\\\"}"; printf '"%s"' "$s"; }
{
  printf '{"at":%s,"state":%s,"station":%s,"network":%s,"internet":%s,' \
    "$NOW" "$(json_str "$state")" "$(json_str "$station")" "$(json_str "${uplink:-none}")" "$(json_str "$internet")"
  printf '"hotspot":%s,"tunnel":%s,"domain":%s,"address":%s}\n' \
    "$([[ $hotspot -eq 1 ]] && echo true || echo false)" "$(json_str "$tunnel")" "$(json_str "$RT_DOMAIN")" "$(json_str "${addr:-}")"
} > "$STATE_DIR/status.json.tmp" 2>/dev/null && mv -f "$STATE_DIR/status.json.tmp" "$STATE_DIR/status.json"

if [[ "$state" != "$last_state" ]]; then
  log "state: $state"
  if [[ $DRY_RUN -eq 1 ]]; then
    printf 'PLAN: write %s\n' "$BOOT_STATUS"
  elif [[ -d "$(dirname "$BOOT_STATUS")" ]]; then
    {
      printf 'Radio Tower — last known state (written by the watchdog when it changes)\r\n\r\n'
      printf 'When:     %s\r\n' "$(date -d "@$NOW" '+%Y-%m-%d %H:%M %Z' 2>/dev/null || date)"
      printf 'State:    %s\r\n' "$state"
      printf 'Network:  %s\r\n' "${uplink:-none}"
      printf 'Address:  %s\r\n' "${addr:-none}"
      printf 'Station:  %s\r\n' "$station"
      printf 'Tunnel:   %s\r\n' "$tunnel"
      printf '\r\nWhat to do: pi/anywhere/README.md, section "Reading the status file".\r\n'
    } > "$BOOT_STATUS" 2>/dev/null || true
  fi
  # Tell the owner once per arrival somewhere new, not once a minute.
  if [[ "$tunnel" == "connected" && -n "$RT_NOTIFY" && "$notified" != "${uplink}@${addr}" ]]; then
    url="$RT_NOTIFY"; [[ "$url" == https://* ]] || url="https://ntfy.sh/$RT_NOTIFY"
    act "$CURL" -fsS -m 10 -H "Title: Radio Tower is live" -d "On air at https://${RT_DOMAIN} via ${uplink:-the network} (${addr})" "$url"
    notified="${uplink}@${addr}"
  fi
  last_state="$state"
fi

{
  printf 'station_fails=%d\noffline=%d\ntunnel_fails=%d\nlast_retry=%d\n' "$station_fails" "$offline" "$tunnel_fails" "$last_retry"
  printf 'last_state=%q\nnotified=%q\n' "$last_state" "$notified"
} > "$STATE_FILE" 2>/dev/null || true

exit 0
