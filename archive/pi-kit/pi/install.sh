#!/usr/bin/env bash
#
# Radio Tower — stage 2 installer.
#
# Run this ON THE PI, once, after Raspberry Pi OS has booted and you can SSH in.
# It turns a bare Raspberry Pi OS install into a running radio station.
#
#   sudo bash /boot/firmware/radiotower/pi/install.sh
#
# What it does, in order:
#   1. sanity-checks the machine (model, OS, network, disk)
#   2. installs Node.js 22 and the handful of packages we need
#   3. copies the app from the SD card's boot partition to /opt/radio-tower
#   4. finds your music (USB stick, or the copy on the boot partition)
#   5. writes /etc/radio-tower.env
#   6. installs and starts the systemd service
#   7. tells you the URL
#
# Idempotent. Safe to run again after you change something.
#
# Everything it does is also documented in pi/README.md, so if a step fails you
# can do that step by hand rather than guessing.

set -euo pipefail

# ------------------------------------------------------------------ settings --
PAYLOAD_DIR="${PAYLOAD_DIR:-/boot/firmware/radiotower}"
APP_DIR="${APP_DIR:-/opt/radio-tower}"
MUSIC_DIR="${MUSIC_DIR:-/mnt/music}"
SERVICE_USER="${SERVICE_USER:-radiotower}"
NODE_MAJOR="${NODE_MAJOR:-22}"
PORT="${PORT:-8080}"
# Overridable so a self-test can dry-run this whole script end to end against
# scratch paths instead of the real /etc, without touching a real machine.
ENV_FILE="${ENV_FILE:-/etc/radio-tower.env}"
SYSTEMD_UNIT_PATH="${SYSTEMD_UNIT_PATH:-/etc/systemd/system/radiotower.service}"
WIFI_SCRIPT_PATH="${WIFI_SCRIPT_PATH:-/usr/local/sbin/radiotower-network}"
WIFI_UNIT_PATH="${WIFI_UNIT_PATH:-/etc/systemd/system/radiotower-network.service}"
WIFI_CONFIG="${WIFI_CONFIG:-/boot/firmware/radiotower-wifi.txt}"
# The go-anywhere kit (pi/anywhere/). Same reason these are overridable.
SBIN_DIR="${SBIN_DIR:-/usr/local/sbin}"
SYSTEMD_DIR="${SYSTEMD_DIR:-/etc/systemd/system}"
NM_CONF_DIR="${NM_CONF_DIR:-/etc/NetworkManager/conf.d}"
NM_SHARED_DIR="${NM_SHARED_DIR:-/etc/NetworkManager/dnsmasq-shared.d}"
SYSTEMD_CONF_DIR="${SYSTEMD_CONF_DIR:-/etc/systemd}"
ONLINE_CONFIG="${ONLINE_CONFIG:-/boot/firmware/radiotower-online.txt}"

# ------------------------------------------------------------------- output ---
B=$'\033[1m'; Y=$'\033[1;33m'; G=$'\033[0;32m'; R=$'\033[1;31m'; D=$'\033[2m'; N=$'\033[0m'
step() { printf '\n%s==> %s%s\n' "$Y" "$*" "$N"; }
ok()   { printf '  %s✓%s %s\n' "$G" "$N" "$*"; }
note() { printf '  %s%s%s\n' "$D" "$*" "$N"; }
warn() { printf '  %s!%s %s\n' "$R" "$N" "$*" >&2; }
die()  { printf '\n%sSTOPPED:%s %s\n\n' "$R" "$N" "$*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "run me with sudo:  sudo bash $0"

printf '\n%s  Radio Tower — Raspberry Pi installer%s\n' "$B" "$N"
printf '%s  %s%s\n' "$D" "$(date -u '+%Y-%m-%dT%H:%M:%SZ')" "$N"

# ============================================================ 1. sanity checks =
step "Checking the machine"

MODEL="$(tr -d '\0' < /proc/device-tree/model 2>/dev/null || echo 'unknown')"
ok "model: $MODEL"
case "$MODEL" in
  *"Raspberry Pi 5"*|*"Raspberry Pi 4"*) ;;
  *"Raspberry Pi 3"*) note "Pi 3 — fine, but expect slower first scans." ;;
  *"Zero 2"*) warn "Pi Zero 2 W has no Ethernet port. Wi-Fi only unless you added a USB adapter." ;;
  *) warn "Unrecognised model. Continuing anyway." ;;
esac

ARCH="$(dpkg --print-architecture)"
ok "architecture: $ARCH"
[[ "$ARCH" == "arm64" ]] || warn "not arm64 — you flashed a 32-bit image. It will work, but 64-bit is faster."

if [[ -r /etc/os-release ]]; then . /etc/os-release; ok "OS: ${PRETTY_NAME:-unknown}"; fi

# Cheap, local, certain checks first — free space and "is the app even here?"
# — then the network probe, which is the only check that can take five seconds
# and the only one whose answer depends on something outside this SD card.
#
# The order matters for a reason beyond politeness: if you copied the folder
# to the wrong place, that is true whether or not the Ethernet cable is in,
# and being told "no internet" first sends you off to fix the wrong thing.
# It also makes tests/pi-install.test.js deterministic — the two tests that
# assert these payload messages used to depend on the test machine's own
# internet reachability and failed intermittently in sandboxes without it.
FREE_MB=$(df -Pm / | awk 'NR==2{print $4}')
ok "free space on /: ${FREE_MB}MB"
[[ "$FREE_MB" -gt 1200 ]] || die "need at least ~1.2GB free on /. Use a bigger SD card, or run: sudo raspi-config --expand-rootfs && sudo reboot"

[[ -d "$PAYLOAD_DIR" ]] || die "can't find the app at $PAYLOAD_DIR
     You copied the folder to the SD card, but not to the right place, or not at all.
     It must be the 'radiotower' folder on the small FAT32 partition Windows calls 'bootfs'.
     Check what is actually there:  ls /boot/firmware/"
[[ -f "$PAYLOAD_DIR/package.json" ]] || die "$PAYLOAD_DIR exists but has no package.json — the copy is incomplete. Copy the whole folder again."
ok "found the app at $PAYLOAD_DIR"

# Network. npm install needs the internet; there is no offline path.
#
# This used to be a ping check (ICMP to deb.nodesource.com, then 1.1.1.1).
# Found by actually running this script: some networks — including, it turns
# out, the sandbox this was tested in — block outbound ICMP while HTTP works
# completely fine, which made the check report "no internet" on a machine
# that had it. What this installer actually needs is HTTPS to two specific
# hosts, so test that directly: registry.npmjs.org first (every run needs it,
# for `npm install`), deb.nodesource.com second (only needed if Node has to be
# installed), with a ping as a last-resort fallback for the rare network that
# blocks HTTP CONNECT-style checks but still answers ICMP.
if curl -fsS --max-time 5 -o /dev/null https://registry.npmjs.org/ 2>/dev/null \
   || curl -fsS --max-time 5 -o /dev/null https://deb.nodesource.com/ 2>/dev/null \
   || ping -c1 -W3 1.1.1.1 >/dev/null 2>&1; then
  IP="$(hostname -I | awk '{print $1}')"
  ok "network up — this Pi is ${IP:-<no address>}"
else
  die "no internet. This installer downloads Node.js and npm packages.
     Plug the Ethernet cable into your router and try again.
     Check with:  ip -brief address   and   curl -I https://registry.npmjs.org
     See pi/NETWORK.md if the cable is in and it still fails."
fi

# ============================================================== 2. packages ====
step "Installing system packages"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq rsync curl ca-certificates avahi-daemon >/dev/null
ok "rsync, curl, avahi-daemon"
note "avahi-daemon is what makes http://$(hostname).local work from your laptop"

NEED_NODE=1
if command -v node >/dev/null 2>&1; then
  CUR="$(node -p 'process.versions.node.split(".")[0]' 2>/dev/null || echo 0)"
  if [[ "$CUR" -ge 22 ]]; then NEED_NODE=0; ok "node $(node -v) already present"; else
    note "node $(node -v) is too old (Node 20 went end-of-life 30 April 2026) — upgrading"
  fi
fi

if [[ $NEED_NODE -eq 1 ]]; then
  note "installing Node.js ${NODE_MAJOR}.x from NodeSource (a few minutes on a Pi)"
  if curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash - >/dev/null 2>&1 \
     && apt-get install -y -qq nodejs >/dev/null 2>&1; then
    ok "node $(node -v)"
  else
    warn "NodeSource failed — falling back to Debian's own nodejs package"
    apt-get install -y -qq nodejs npm >/dev/null
    command -v node >/dev/null || die "could not install Node.js at all. Install it by hand, then re-run me."
    warn "installed $(node -v) from Debian. If that is below 22, see pi/TROUBLESHOOTING.md § Node."
  fi
fi

# ============================================================ 3. service user ==
step "Creating the service user"
if id "$SERVICE_USER" >/dev/null 2>&1; then
  ok "$SERVICE_USER already exists"
else
  useradd --system --create-home --shell /usr/sbin/nologin "$SERVICE_USER"
  ok "created $SERVICE_USER (no login shell — it only serves audio)"
fi

# ============================================================== 4. app files ===
step "Installing the app to $APP_DIR"
mkdir -p "$APP_DIR" "$APP_DIR/.cache"
rsync -a --delete \
  --exclude node_modules --exclude .cache --exclude .git \
  --exclude music --exclude '*.log' --exclude '_to_delete' \
  --exclude 'collections/_*' \
  "$PAYLOAD_DIR/" "$APP_DIR/"
ok "copied $(find "$APP_DIR" -type f | wc -l) files"

note "installing npm dependencies (production only — express + music-metadata)"
( cd "$APP_DIR" && npm install --omit=dev --no-audit --no-fund >/dev/null 2>&1 ) \
  || die "npm install failed. Run it by hand to see why:
     cd $APP_DIR && sudo npm install --omit=dev"
ok "dependencies installed"

chown -R "$SERVICE_USER":"$SERVICE_USER" "$APP_DIR"

# ================================================================= 5. music ====
step "Finding your music"
mkdir -p "$MUSIC_DIR"

count_audio() { find "$1" -type f \( -iname '*.mp3' -o -iname '*.m4a' -o -iname '*.flac' \
                -o -iname '*.ogg' -o -iname '*.opus' -o -iname '*.wav' -o -iname '*.aac' \) 2>/dev/null | wc -l; }

FOUND=0

# (a) an already-mounted USB stick with audio on it
for M in /media/*/* /mnt/*; do
  [[ -d "$M" ]] || continue
  [[ "$M" == "$MUSIC_DIR" ]] && continue
  C=$(count_audio "$M")
  if [[ "$C" -gt 0 ]]; then
    ok "found $C audio files on $M"
    note "using it directly — MUSIC_DIR will point at $M"
    MUSIC_DIR="$M"; FOUND=$C
    break
  fi
done

# (b) music that travelled on the boot partition
if [[ $FOUND -eq 0 && -d "$PAYLOAD_DIR/music" ]]; then
  C=$(count_audio "$PAYLOAD_DIR/music")
  if [[ "$C" -gt 0 ]]; then
    note "copying $C audio files off the boot partition into $MUSIC_DIR"
    rsync -a --info=progress2 "$PAYLOAD_DIR/music/" "$MUSIC_DIR/"
    ok "copied $C files to $MUSIC_DIR"
    note "you can delete the music folder from the SD card's bootfs partition now — it is only 512MB"
    FOUND=$C
  fi
fi

if [[ $FOUND -eq 0 ]]; then
  warn "no audio files found anywhere yet"
  note "the station will boot and report 'Dead air' until you add some"
  note "add music later with any of:"
  note "  • plug in a USB stick with MP3s, then: sudo bash $0"
  note "  • scp from your laptop:  scp *.mp3 $(logname 2>/dev/null || echo pi)@$(hostname).local:/tmp/ "
  note "    then: sudo mv /tmp/*.mp3 $MUSIC_DIR/"
fi

chmod a+rx "$MUSIC_DIR" 2>/dev/null || true
find "$MUSIC_DIR" -type f -exec chmod a+r {} \; 2>/dev/null || true

# =========================================================== 6. environment ====
step "Writing $ENV_FILE"
if [[ -f "$ENV_FILE" ]]; then
  ok "already exists — leaving your settings alone"
  note "delete it and re-run me if you want it regenerated"
else
  sed -e "s|^MUSIC_DIR=.*|MUSIC_DIR=$MUSIC_DIR|" \
      -e "s|^PORT=.*|PORT=$PORT|" \
      "$APP_DIR/deploy/radio-tower.env.example" > "$ENV_FILE"
  chmod 0644 "$ENV_FILE"
  ok "written (MUSIC_DIR=$MUSIC_DIR, PORT=$PORT)"
  note "STATION_EPOCH is in there. Once listeners exist, never change it."
fi

# =============================================================== 7. systemd ====
step "Installing the service"
sed -e "s|^User=.*|User=$SERVICE_USER|" \
    -e "s|^Group=.*|Group=$SERVICE_USER|" \
    -e "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" \
    -e "s|^ReadWritePaths=.*|ReadWritePaths=$APP_DIR/.cache|" \
    -e "s|^EnvironmentFile=.*|EnvironmentFile=-$ENV_FILE|" \
    "$APP_DIR/deploy/radiotower.service" > "$SYSTEMD_UNIT_PATH"

systemctl daemon-reload
systemctl enable radiotower >/dev/null 2>&1
systemctl restart radiotower
ok "radiotower.service enabled — it will start on every boot from now on"

# ------------------------------------------------- the Wi-Fi recovery path ---
#
# Installed unconditionally, including on a tower that is on Ethernet and has
# no use for it today. The whole point is that it is already there on the day
# the network changes — installing it then would need the SSH access that the
# network change is what took away.
if [[ -f "$APP_DIR/pi/wifi/radiotower-network.sh" ]]; then
  install -m 0755 "$APP_DIR/pi/wifi/radiotower-network.sh" "$WIFI_SCRIPT_PATH"
  install -m 0644 "$APP_DIR/pi/wifi/radiotower-network.service" "$WIFI_UNIT_PATH"
  systemctl daemon-reload
  systemctl enable radiotower-network >/dev/null 2>&1
  ok "radiotower-network.service enabled — reads $WIFI_CONFIG on every boot"

  if [[ ! -f "$WIFI_CONFIG" && -d "$(dirname "$WIFI_CONFIG")" ]]; then
    install -m 0644 "$APP_DIR/pi/wifi/radiotower-wifi.txt.example" "${WIFI_CONFIG%.txt}.txt.example"
    note "to move this tower to another Wi-Fi network later: put the SD card in a"
    note "computer, copy radiotower-wifi.txt.example to radiotower-wifi.txt, edit it,"
    note "and boot. No SSH needed. Full instructions in pi/NEW-NETWORK.md"
  fi
fi

# ------------------------------------------------------ the go-anywhere kit ---
#
# pi/anywhere/: carry the tower anywhere and it comes back online by itself.
# Setup hotspot + phone portal for a router it has never seen, a Cloudflare
# Tunnel to your own domain from a token in a text file on the SD card, and a
# watchdog that restarts whatever wedges. Installed unconditionally, for the
# same reason as the Wi-Fi recovery path above: the day you need it is the
# day you can no longer log in to install it.
if [[ -d "$APP_DIR/pi/anywhere" ]]; then
  step "Installing the go-anywhere kit (setup hotspot, your domain, watchdog)"
  K="$APP_DIR/pi/anywhere"

  if ! command -v cloudflared >/dev/null 2>&1; then
    case "$ARCH" in
      arm64) CF=cloudflared-linux-arm64.deb ;; armhf) CF=cloudflared-linux-armhf.deb ;;
      amd64) CF=cloudflared-linux-amd64.deb ;; *) CF="" ;;
    esac
    if [[ -n "$CF" ]] && curl -fsSL -o /tmp/cloudflared.deb "https://github.com/cloudflare/cloudflared/releases/latest/download/${CF}" \
       && dpkg -i /tmp/cloudflared.deb >/dev/null 2>&1; then
      ok "cloudflared $(cloudflared --version 2>/dev/null | awk '{print $3}')"
    else
      warn "could not install cloudflared — the station works locally; re-run me with internet to go public"
    fi
    rm -f /tmp/cloudflared.deb
  else
    ok "cloudflared already present"
  fi
  apt-get install -y -qq iw >/dev/null 2>&1 || true   # the watchdog counts hotspot clients with it

  install -m 0755 "$K/radiotower-online.sh"   "$SBIN_DIR/radiotower-online"
  install -m 0755 "$K/radiotower-tunnel.sh"   "$SBIN_DIR/radiotower-tunnel"
  install -m 0755 "$K/radiotower-watchdog.sh" "$SBIN_DIR/radiotower-watchdog"
  for u in radiotower-online.service radiotower-tunnel.service radiotower-portal.service \
           radiotower-watchdog.service radiotower-watchdog.timer; do
    install -m 0644 "$K/systemd/$u" "$SYSTEMD_DIR/$u"
  done
  mkdir -p "$NM_CONF_DIR" "$NM_SHARED_DIR" "$SYSTEMD_CONF_DIR/system.conf.d" "$SYSTEMD_CONF_DIR/journald.conf.d"
  install -m 0644 "$K/conf/wifi-powersave.conf"     "$NM_CONF_DIR/radiotower-powersave.conf"
  install -m 0644 "$K/conf/captive-portal.conf"     "$NM_SHARED_DIR/radiotower-captive.conf"
  install -m 0644 "$K/conf/hardware-watchdog.conf"  "$SYSTEMD_CONF_DIR/system.conf.d/radiotower-watchdog.conf"
  install -m 0644 "$K/conf/journald-size.conf"      "$SYSTEMD_CONF_DIR/journald.conf.d/radiotower.conf"
  ok "setup hotspot + phone portal, tunnel, watchdog, Wi-Fi power-save off, hardware watchdog, log cap"

  if [[ ! -f "$ONLINE_CONFIG" && -d "$(dirname "$ONLINE_CONFIG")" ]]; then
    install -m 0644 "$K/radiotower-online.txt.example" "${ONLINE_CONFIG%.txt}.txt.example"
  fi

  systemctl daemon-reload
  systemctl enable radiotower-online.service radiotower-tunnel.service radiotower-watchdog.timer >/dev/null 2>&1
  "$SBIN_DIR/radiotower-online" >/dev/null 2>&1 || true
  systemctl start radiotower-watchdog.timer >/dev/null 2>&1 || true
  ok "enabled — reads $ONLINE_CONFIG on every boot"
  note "your domain: put TUNNEL_TOKEN = ... in radiotower-online.txt on the SD card (pi/anywhere/DOMAIN.md)"
  note "the hardware watchdog arms on the next reboot"
fi

# ================================================================ 8. verify ====
step "Waiting for the station to come on air"
HEALTHY=0
for i in $(seq 1 45); do
  if curl -fsS "http://127.0.0.1:${PORT}/api/health" >/dev/null 2>&1; then HEALTHY=1; break; fi
  sleep 2
done

if [[ $HEALTHY -eq 0 ]]; then
  warn "it did not come up. The last 30 log lines:"
  journalctl -u radiotower -n 30 --no-pager || true
  die "see pi/TROUBLESHOOTING.md — start with the log lines above."
fi

ok "health check passed"
curl -fsS "http://127.0.0.1:${PORT}/api/health" | head -c 500; echo

IP="$(hostname -I | awk '{print $1}')"
HN="$(hostname)"

cat <<EOF

${G}${B}  The tower is on air.${N}

  From any device on the same network:

      http://${HN}.local:${PORT}        ${D}(nicest — works if your laptop does mDNS)${N}
      http://${IP}:${PORT}              ${D}(always works)${N}

  Useful commands:

      sudo systemctl status radiotower     ${D}is it running?${N}
      sudo journalctl -u radiotower -f     ${D}watch the logs live${N}
      sudo systemctl restart radiotower    ${D}restart it${N}
      curl -X POST http://127.0.0.1:${PORT}/api/rescan   ${D}pick up new music now${N}

  Music directory: ${MUSIC_DIR}  ${D}(${FOUND} tracks found)${N}

  ${B}Next:${N} to put it on your own domain, from anywhere, follow
      pi/anywhere/DOMAIN.md  ${D}(one token pasted into radiotower-online.txt on the SD card)${N}
  ${D}Read pi/README.md § "Going public" first — there is a Cloudflare terms
  question that is yours to decide, not the installer's.${N}

EOF
