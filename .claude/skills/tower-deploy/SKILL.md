---
name: tower-deploy
description: Deploy Radio Tower onto a Raspberry Pi and publish it on the public internet with a Cloudflare Tunnel. Use when installing on the Pi, setting up the systemd service, exposing the station publicly, pointing a domain at it, or diagnosing a station that is unreachable, silent, or restarting.
---

# Getting the tower on the air

**Blank SD card, no prior Pi experience?** Point Ortis at `pi/README.md`
instead — Raspberry Pi Imager does the OS, one SSH command
(`sudo bash /boot/firmware/radiotower/pi/install.sh`) does the station. What
follows here assumes the repo is already on a running Pi.

Two steps, two scripts. Run them on the Pi, from the project directory.

```bash
sudo bash scripts/setup-pi.sh                       # install + systemd + verify
sudo bash scripts/setup-tunnel.sh quick             # temporary public URL
sudo bash scripts/setup-tunnel.sh named tower.example.com   # permanent
```

Both are idempotent. Re-run them after pulling changes.

## What `setup-pi.sh` does

`setup-pi.sh` is a thin wrapper that hands off to `pi/install.sh` (the same
installer the from-scratch flow uses), pointed at this checkout as the
payload. Its steps:

1. Installs Node 22 via NodeSource if the Pi has nothing recent enough.
2. Creates the dedicated `radiotower` service user if missing (no login
   shell — matches the systemd unit's hardening).
3. `rsync`s the project to `/opt/radio-tower`, excluding `node_modules`,
   `.cache`, `.git`, and `music/`.
4. `npm install --omit=dev` — production dependencies only.
5. Writes `/etc/radio-tower.env` from the template, if it does not already exist.
   **An existing file is never overwritten**, so your settings survive re-runs.
6. Installs and starts the `radiotower` systemd unit.
7. Polls `/api/health` for a minute and prints the LAN URL.

Override the defaults with environment variables:

```bash
sudo MUSIC_DIR=/media/pi/BIGDRIVE APP_DIR=/srv/tower bash scripts/setup-pi.sh
```

## Where the music goes

`MUSIC_DIR` in `/etc/radio-tower.env`, default `/mnt/music`. The service only ever
reads it. For a USB drive, mount it by UUID so it survives a reboot:

```bash
lsblk -f                                  # find the UUID
sudo mkdir -p /mnt/music
echo 'UUID=xxxx-xxxx /mnt/music exfat defaults,nofail,ro,uid=1000 0 0' | sudo tee -a /etc/fstab
sudo mount -a
```

`nofail` matters: without it, a Pi that boots with the drive unplugged drops to
an emergency shell instead of coming up.

New files join the rotation on the next auto-rescan (30 minutes by default), or
immediately:

```bash
curl -X POST http://127.0.0.1:8080/api/rescan
```

Check what the tower sees before you trust it:

```bash
cd /opt/radio-tower && npm run scan -- --list
```

Files with unreadable duration are skipped and named in the output — that is
where a "why isn't this song playing" question gets answered.

## Going public

**Quick mode** gives a random `*.trycloudflare.com` URL, no account, no domain,
foreground process. Perfect for "listen to this right now". The URL dies when you
Ctrl-C, and a new one is issued next time.

**Named mode** needs a domain already in Cloudflare. It logs in once
interactively, creates a tunnel called `radio-tower`, points your hostname at it
via DNS, writes `/etc/cloudflared/config.yml`, and installs `cloudflared` as a
service. Survives reboots.

A tunnel is the right choice here rather than port forwarding: nothing inbound is
opened on the router, it works behind CGNAT and on a dynamic IP, TLS is free, and
Cloudflare absorbs a traffic spike instead of the Pi's uplink.

## Operating it

```bash
sudo systemctl status radiotower
sudo systemctl restart radiotower
sudo journalctl -u radiotower -f          # station logs
sudo journalctl -u cloudflared -f         # tunnel logs
node scripts/healthcheck.js               # one-screen status
node scripts/healthcheck.js --json        # for monitoring
```

## Diagnosing

**Service restarts in a loop.** `journalctl -u radiotower -n 50`. Usually
`MUSIC_DIR` does not exist or is not readable by the service user, or the
`.cache` directory is not writable — the unit uses `ProtectSystem=strict`, so
only paths listed in `ReadWritePaths` can be written.

**Station is up, nothing plays.** `curl localhost:8080/api/health`. If `tracks` is
0, the scan found nothing: check `MUSIC_DIR`, check the file extensions are in
`config.audioExtensions`, and run `npm run scan` to see the skip reasons.

**Reachable on the LAN, not through the tunnel.** `systemctl status cloudflared`.
If the tunnel is up, confirm `config.yml`'s `service:` port matches `PORT` in
`/etc/radio-tower.env`. DNS for a fresh named tunnel can take a minute.

**Audio stutters for remote listeners but not local ones.** Upstream bandwidth.
A 320kbps library and ten listeners is 3.2Mbps of upload. Either re-encode the
library lower or cap concurrent listeners. Cloudflare does not cache these
responses — they are ranged and per-listener.

**Everyone is out of sync with each other.** Check the Pi's clock first:
`timedatectl`. A Pi with no RTC that lost NTP will drift, and since the whole
schedule is derived from wall-clock time, the station itself moves. `sudo
systemctl restart systemd-timesyncd`.

**A song plays twice in a row after adding files.** Expected. Adding tracks
changes `cycleSeconds`, which shifts every future position; the player detects
the `revision` change and rejoins. One audible jump, then normal.

## Before you deploy a change

```bash
bash scripts/build-test.sh
```

Green, or do not deploy. Then on the Pi, re-run `setup-pi.sh` and watch
`journalctl -u radiotower -f` for the first minute — a scan failure on a large
library shows up there and nowhere else.
