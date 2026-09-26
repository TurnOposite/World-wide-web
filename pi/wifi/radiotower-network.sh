#!/usr/bin/env bash
#
# Radio Tower — move the station onto a new Wi-Fi network without SSHing in.
#
# THE PROBLEM THIS SOLVES
#
# A Pi that only knows one Wi-Fi network is a brick the moment that network
# stops existing. You cannot SSH in to tell it about the new one, because
# telling it about the new one is exactly what you need SSH for. Plugging in a
# monitor and a keyboard works, but "find an HDMI cable and a USB keyboard"
# is not a recovery plan you want standing between you and your own radio
# station after a house move.
#
# So: the Pi reads its Wi-Fi networks from a plain text file on the *boot*
# partition, on every boot. That partition is FAT32, which means Windows,
# macOS and Linux can all mount it by putting the SD card in a card reader.
# Pull the card, open `radiotower-wifi.txt` in Notepad, type the new network's
# name and password, put the card back, power on. That is the whole procedure.
#
# It runs on every boot, not just the first, so the same card can move between
# houses as many times as you like.
#
# USAGE
#
#   sudo radiotower-network            apply the config file and connect
#   sudo radiotower-network --status   show what it would do, and what's live
#   sudo radiotower-network --dry-run  print the nmcli plan, change nothing
#   radiotower-network --after-portal   run by the setup portal after someone
#                                       picked a network on their phone
#   radiotower-network --retry          run by the watchdog: drop the hotspot
#                                       and look for known networks again
#
# WHEN NOTHING WORKS (pi/anywhere/)
#
# If no network the tower knows is in range — and it is not on Ethernet — it
# does not just sit there unreachable. It scans what IS in range, brings up
# its own "Radio Tower Setup" Wi-Fi and starts the setup portal
# (pi/anywhere/portal.mjs): join it from a phone, pick the router, type the
# password, and the tower joins it and remembers it. That is what makes the
# tower connect to *any* router, including one nobody told it about.
#
# Run by radiotower-network.service on boot. Also safe to run by hand over SSH
# when you are already connected and want to add a network for later.

set -euo pipefail

# Overridable so the test suite can drive this against scratch paths and a
# stub nmcli, rather than needing a Pi with a radio in it.
CONFIG_FILE="${RT_WIFI_CONFIG:-/boot/firmware/radiotower-wifi.txt}"
NMCLI="${RT_NMCLI:-nmcli}"
WIFI_IFACE="${RT_WIFI_IFACE:-wlan0}"
CONNECT_TIMEOUT="${RT_CONNECT_TIMEOUT:-45}"
PROFILE_PREFIX="rt-"
HOTSPOT_PROFILE="rt-hotspot"
ONLINE_ENV="${RT_ONLINE_ENV:-/etc/radiotower/online.env}"
SCAN_FILE="${RT_SCAN_FILE:-/run/radiotower/scan.txt}"
JOIN_RESULT="${RT_JOIN_RESULT:-/run/radiotower/last-join.txt}"
SYSTEMCTL="${RT_SYSTEMCTL:-systemctl}"
# Test hook: in --dry-run, pretend no network came up, to exercise the fallback.
ASSUME_OFFLINE="${RT_ASSUME_OFFLINE:-0}"

DRY_RUN=0
STATUS_ONLY=0
AFTER_PORTAL=0
LEAVE_HOTSPOT=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --after-portal) AFTER_PORTAL=1; LEAVE_HOTSPOT=1 ;;
    --retry) LEAVE_HOTSPOT=1 ;;
    --status)  STATUS_ONLY=1; DRY_RUN=1 ;;
    -h|--help) sed -n '2,42p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) printf 'unknown option: %s (try --help)\n' "$arg" >&2; exit 2 ;;
  esac
done

G=$'\033[0;32m'; R=$'\033[1;31m'; Y=$'\033[1;33m'; D=$'\033[2m'; N=$'\033[0m'
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
warn() { printf '  %s!%s %s\n' "$R" "$N" "$*" >&2; }
note() { printf '  %s%s%s\n' "$D" "$*" "$N"; }
step() { printf '\n%s==> %s%s\n' "$Y" "$*" "$N"; }

# `nmcli` calls go through this so --dry-run can print instead of doing. Every
# state-changing call in this script must use it; a bare `nmcli` would ignore
# --dry-run and is a bug.
#
# It swallows the real nmcli's chatter itself rather than leaving each call
# site to append `>/dev/null` — a redirect at the call site would also
# discard the PLAN line, which silently turned --dry-run into a no-op that
# printed nothing. Found by the tests, which asserted against a plan that was
# being written straight to /dev/null.
nm() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  PLAN: %s' "$NMCLI"
    printf ' %s' "$@"
    printf '\n'
    return 0
  fi
  "$NMCLI" "$@" >/dev/null
}

# ------------------------------------------------------------------ parsing --
#
# Format, one network per line, best first:
#
#     My New Router | the password
#
# `|` rather than a space or a colon because SSIDs routinely contain spaces
# and passwords routinely contain colons, and a separator that appears in
# real values is a support burden. Everything before the first `|` is the
# SSID; everything after it is the password, verbatim except for the spaces
# touching the separator. A password containing `|` is the one case this
# cannot express — use the `nmcli` command in pi/NEW-NETWORK.md for that.
#
# An open network is a line with nothing after the `|`.
#
# `HOTSPOT = name | password` is not a network to join but one to *create*
# when none of the others can be reached. See below.

SSIDS=(); PASSWORDS=()
HOTSPOT_SSID=""; HOTSPOT_PASS=""
MALFORMED=0

trim() { local s="$1"; s="${s#"${s%%[![:space:]]*}"}"; s="${s%"${s##*[![:space:]]}"}"; printf '%s' "$s"; }

parse_config() {
  local line raw ssid pass lineno=0
  while IFS= read -r raw || [[ -n "$raw" ]]; do
    lineno=$((lineno + 1))
    line="${raw%$'\r'}"                       # written on Windows, read on Linux
    line="$(trim "$line")"
    [[ -z "$line" || "${line:0:1}" == "#" ]] && continue

    if [[ "$line" != *"|"* ]]; then
      warn "line $lineno ignored — no \"|\" between the network name and the password: $line"
      MALFORMED=$((MALFORMED + 1))
      continue
    fi

    ssid="$(trim "${line%%|*}")"
    pass="$(trim "${line#*|}")"

    if [[ "${ssid^^}" == HOTSPOT* ]]; then
      # HOTSPOT = name | password
      HOTSPOT_SSID="$(trim "${ssid#*=}")"
      HOTSPOT_PASS="$pass"
      [[ -n "$HOTSPOT_SSID" ]] || { warn "line $lineno: HOTSPOT has no network name — ignored"; HOTSPOT_SSID=""; }
      continue
    fi

    if [[ -z "$ssid" ]]; then
      warn "line $lineno ignored — nothing before the \"|\", so there is no network name"
      MALFORMED=$((MALFORMED + 1))
      continue
    fi

    SSIDS+=("$ssid"); PASSWORDS+=("$pass")
  done < "$CONFIG_FILE"
}

# ------------------------------------------------------------------- action --

# Side effects that are not nmcli (systemctl, writing /run files) go through
# this, so --dry-run stays a pure plan.
do_() {
  if [[ $DRY_RUN -eq 1 ]]; then
    printf '  PLAN: %s\n' "$*"
    return 0
  fi
  "$@" >/dev/null 2>&1 || true
}

record_join() {
  [[ $AFTER_PORTAL -eq 1 ]] || return 0
  if [[ $DRY_RUN -eq 1 ]]; then printf '  PLAN: record "%s"\n' "$1"; return 0; fi
  mkdir -p "$(dirname "$JOIN_RESULT")" 2>/dev/null || true
  printf '%s — %s\n' "$(date '+%H:%M')" "$1" > "$JOIN_RESULT" 2>/dev/null || true
}

step "Reading $CONFIG_FILE"

HAVE_CONFIG=1
if [[ ! -f "$CONFIG_FILE" ]]; then
  HAVE_CONFIG=0
  note "no Wi-Fi config on the boot partition — leaving the saved networks exactly as they are"
  note "(that is the normal, correct state for a tower on Ethernet)"
else
  parse_config
  if [[ ${#SSIDS[@]} -eq 0 && -z "$HOTSPOT_SSID" ]]; then
    warn "$CONFIG_FILE has no usable lines — leaving the network alone"
    note "expected lines like:  My Router | mypassword"
    HAVE_CONFIG=0
  else
    ok "${#SSIDS[@]} network(s) listed${HOTSPOT_SSID:+, plus a hotspot fallback}"
    [[ $MALFORMED -gt 0 ]] && warn "$MALFORMED line(s) were skipped — see above"
  fi
fi

if [[ $LEAVE_HOTSPOT -eq 1 ]]; then
  # The radio is busy being the setup hotspot; it has to stop being an
  # access point before it can join anything.
  step "Leaving the hotspot to look for a real network"
  nm connection down "$HOTSPOT_PROFILE" 2>/dev/null || true
fi

if [[ $HAVE_CONFIG -eq 1 ]]; then
  # Wi-Fi off at the radio level survives reboots and silently defeats
  # everything below it, so clear it before anything else.
  nm radio wifi on 2>/dev/null || true

  step "Teaching the tower these networks"

  # Priority descending from the top of the file, so the first line listed is
  # the one NetworkManager prefers when several are in range.
  priority=${#SSIDS[@]}
  for i in "${!SSIDS[@]}"; do
    ssid="${SSIDS[$i]}"; pass="${PASSWORDS[$i]}"
    profile="${PROFILE_PREFIX}${ssid}"

    if [[ $DRY_RUN -eq 0 ]] && "$NMCLI" -t -f NAME connection show 2>/dev/null | grep -Fxq "$profile"; then
      nm connection modify "$profile" \
        wifi.ssid "$ssid" \
        connection.autoconnect yes \
        connection.autoconnect-priority "$priority"
    else
      nm connection add type wifi con-name "$profile" ifname "$WIFI_IFACE" ssid "$ssid" \
        connection.autoconnect yes \
        connection.autoconnect-priority "$priority"
    fi

    if [[ -n "$pass" ]]; then
      nm connection modify "$profile" \
        wifi-sec.key-mgmt wpa-psk \
        wifi-sec.psk "$pass"
    else
      # An explicitly open network. Clearing key-mgmt matters when a profile is
      # being reused for a network that used to have a password.
      nm connection modify "$profile" wifi-sec.key-mgmt ""
    fi

    ok "$ssid ${D}(priority $priority)${N}"
    priority=$((priority - 1))
  done
fi

if [[ $STATUS_ONLY -eq 1 ]]; then
  step "What is live right now"
  "$NMCLI" -t -f DEVICE,TYPE,STATE,CONNECTION device status 2>/dev/null || warn "nmcli not available here"
  exit 0
fi

step "Connecting"

# NetworkManager picks by priority on its own once the profiles exist; asking
# it to bring up a specific one would fight that. Give it a window, then look.
# "connected" here means a real uplink (Wi-Fi or Ethernet), not our own
# hotspot, which NetworkManager also reports as connected.
connected=0
if [[ $AFTER_PORTAL -eq 1 && $DRY_RUN -eq 0 && ${#SSIDS[@]} -gt 0 ]]; then
  "$NMCLI" connection up "${PROFILE_PREFIX}${SSIDS[0]}" >/dev/null 2>&1 || true
fi
for _ in $(seq 1 "$CONNECT_TIMEOUT"); do
  if [[ $DRY_RUN -eq 1 ]]; then
    [[ "$ASSUME_OFFLINE" == "1" ]] || connected=1
    break
  fi
  state="$("$NMCLI" -t -f STATE general 2>/dev/null || echo unknown)"
  active="$("$NMCLI" -t -f NAME connection show --active 2>/dev/null || true)"
  if [[ "$state" == "connected"* ]] && ! grep -Fxq "$HOTSPOT_PROFILE" <<<"$active"; then connected=1; break; fi
  sleep 1
done

if [[ $connected -eq 1 ]]; then
  if [[ $DRY_RUN -eq 0 ]]; then
    active="$("$NMCLI" -t -f NAME connection show --active 2>/dev/null | head -1)"
    addr="$(hostname -I 2>/dev/null | awk '{print $1}')"
    ok "on the network via ${active:-unknown} — this Pi is ${addr:-<no address>}"
    note "the station is at http://${addr:-radiotower.local}:8080"
    record_join "joined ${active#"$PROFILE_PREFIX"}"
    # Only a hotspot needs the portal; on a real network it would be a page
    # anyone on the LAN could use to reconfigure the tower. Stop it.
    do_ "$SYSTEMCTL" stop radiotower-portal.service
  elif [[ $HAVE_CONFIG -eq 1 ]]; then
    ok "would wait up to ${CONNECT_TIMEOUT}s for NetworkManager to pick one"
  fi
  exit 0
fi

[[ ${#SSIDS[@]} -gt 0 ]] && record_join "could not join ${SSIDS[0]} — usually a mistyped password, or it is out of range"

# ------------------------------------------------------- hotspot fallback ----
#
# Nothing reachable. The tower becomes its own network rather than a brick:
#
#   - a HOTSPOT line in radiotower-wifi.txt wins: broadcast the station under
#     that name (a radio you can carry into a room with no infrastructure);
#   - otherwise the SETUP hotspot from radiotower-online.txt (default
#     "Radio Tower Setup" / radiotower), which exists to be joined from a
#     phone and pointed at whatever router is actually here.
#
# Either way the setup portal runs on port 80, so a phone that joins gets the
# "connect the tower to Wi-Fi" page, and the station itself is at :8080.

RT_SETUP_SSID="Radio Tower Setup"; RT_SETUP_PASS="radiotower"
# shellcheck disable=SC1090
[[ -r "$ONLINE_ENV" ]] && source "$ONLINE_ENV"

if [[ -n "$HOTSPOT_SSID" ]]; then
  AP_SSID="$HOTSPOT_SSID"; AP_PASS="$HOTSPOT_PASS"; AP_KIND="the tower's own Wi-Fi"
else
  AP_SSID="$RT_SETUP_SSID"; AP_PASS="$RT_SETUP_PASS"; AP_KIND="the setup Wi-Fi"
fi

if [[ -n "$AP_PASS" && ${#AP_PASS} -lt 8 ]]; then
  warn "hotspot password is shorter than 8 characters, which WPA rejects — not starting it"
  exit 1
fi

step "No known network reachable — bringing up $AP_KIND"

# Scan BEFORE becoming an access point: with one radio, a Pi in AP mode can
# no longer see the networks around it, and the portal needs that list.
if [[ $DRY_RUN -eq 1 ]]; then
  printf '  PLAN: scan nearby networks into %s\n' "$SCAN_FILE"
else
  mkdir -p "$(dirname "$SCAN_FILE")" 2>/dev/null || true
  "$NMCLI" -t -f SSID,SIGNAL,SECURITY device wifi list --rescan yes > "$SCAN_FILE.tmp" 2>/dev/null \
    && mv -f "$SCAN_FILE.tmp" "$SCAN_FILE" || rm -f "$SCAN_FILE.tmp"
fi

nm radio wifi on 2>/dev/null || true
nm device wifi hotspot ifname "$WIFI_IFACE" con-name "$HOTSPOT_PROFILE" ssid "$AP_SSID" ${AP_PASS:+password "$AP_PASS"}
do_ "$SYSTEMCTL" start radiotower-portal.service
ok "broadcasting \"$AP_SSID\""
note "join it from a phone: the setup page opens by itself (or go to http://10.42.0.1)"
note "the station itself is playing at http://10.42.0.1:8080 — no internet needed"
