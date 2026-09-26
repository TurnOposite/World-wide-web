# Deploying to a Raspberry Pi

**Starting from a blank SD card with no prior Pi experience?** Use
[`pi/README.md`](../pi/README.md) instead — this page assumes the repo is
already on a Pi that's up and running (git clone, rsync, whatever got it
there) and you just want it installed and running.

Two scripts. Run them on the Pi, from the project directory. Both are idempotent —
re-run after pulling changes. `setup-pi.sh` is a thin wrapper around the same
`pi/install.sh` the from-scratch guide uses, so the two paths can't drift
apart the way they once did (see `docs/DECISIONS.md` 2026-08-18).

```bash
sudo bash scripts/setup-pi.sh
sudo bash scripts/setup-tunnel.sh quick
```

---

## 0. What you need

- A Raspberry Pi running Raspberry Pi OS (Bookworm or later). A Zero 2 W is
  enough; a 3B+ or 4 is comfortable.
- Your music on the Pi — an SD card partition, a USB drive, or a network mount.
- For a permanent public address: a domain already added to a free Cloudflare
  account. Not needed for the quick mode.

---

## 1. Get the project onto the Pi

```bash
git clone <your-repo> radio-tower && cd radio-tower
# or copy the folder over with scp/rsync
```

---

## 2. Mount your music

`MUSIC_DIR` defaults to `/mnt/music`. For a USB drive, mount by UUID so it
survives a reboot:

```bash
lsblk -f                        # find the UUID and filesystem type
sudo mkdir -p /mnt/music
sudo blkid                      # confirm
echo 'UUID=XXXX-XXXX /mnt/music exfat defaults,nofail,ro,uid=1000 0 0' | sudo tee -a /etc/fstab
sudo mount -a
ls /mnt/music                   # sanity check
```

Two flags matter:

- **`nofail`** — without it, a Pi that boots with the drive unplugged drops to an
  emergency shell instead of coming up. On a headless device that is a trip to
  find a monitor.
- **`ro`** — the station only ever reads. Mounting read-only removes a whole
  class of accident.

---

## 3. Install

```bash
sudo bash scripts/setup-pi.sh
```

It installs Node 22 if the Pi has nothing recent enough, creates the service
user, rsyncs the project to `/opt/radio-tower`, installs production dependencies,
writes `/etc/radio-tower.env` from the template (never overwriting an existing
one), installs the `radiotower` systemd unit, and then polls `/api/health` until
the station answers.

Override the defaults:

```bash
sudo MUSIC_DIR=/media/pi/BIGDRIVE APP_DIR=/srv/tower SERVICE_USER=ortis \
  bash scripts/setup-pi.sh
```

Before trusting it, check what the tower actually sees:

```bash
cd /opt/radio-tower && npm run scan
```

That prints the track count, total cycle length, and — importantly — every file
it had to skip and why.

---

## 4. Configure

Edit `/etc/radio-tower.env`, then `sudo systemctl restart radiotower`.

```bash
MUSIC_DIR=/mnt/music
PORT=8080
STATION_NAME=Radio Tower
STATION_TAGLINE=One signal. Everyone on the same second.
STATION_EPOCH=2026-01-01T00:00:00Z
AUTO_RESCAN_MINUTES=30
GAP_SECONDS=0
```

**`STATION_EPOCH` is load-bearing.** The entire schedule is derived from it, so
changing it re-deals the programme. Set it once before anyone is listening, then
leave it alone forever.

---

## 5. Go public

### Quick — an instant throwaway URL

```bash
sudo bash scripts/setup-tunnel.sh quick
```

Prints something like `https://calm-forest-1234.trycloudflare.com`. No account,
no domain, no DNS. The process runs in the foreground; Ctrl-C takes it down and
the next run gets a different address. Ideal for "listen to this right now".

### Named — a permanent address on your domain

```bash
sudo bash scripts/setup-tunnel.sh named tower.example.com
```

The first run opens a Cloudflare login (it prints a URL you open on any device
and pick your domain). Then it creates a tunnel called `radio-tower`, adds the
DNS record, writes `/etc/cloudflared/config.yml`, and installs `cloudflared` as a
service so it comes back after a reboot.

DNS can take a minute the first time.

### Why a tunnel rather than port forwarding

Nothing inbound is opened on the router. It works behind CGNAT and on a dynamic
IP, which describes most home connections. TLS is free and automatic. And a
traffic spike lands on Cloudflare instead of your upstream link.

---

## 6. Operating

```bash
sudo systemctl status radiotower
sudo systemctl restart radiotower
sudo journalctl -u radiotower -f
sudo journalctl -u cloudflared -f

node /opt/radio-tower/scripts/healthcheck.js
node /opt/radio-tower/scripts/healthcheck.js --json      # for monitoring
```

### Adding music later

Drop files into `MUSIC_DIR`. They join within `AUTO_RESCAN_MINUTES`, or now:

```bash
curl -X POST http://127.0.0.1:8080/api/rescan
```

Adding tracks changes the cycle length, which shifts every future position.
Listeners hear one jump and then carry on — the player detects the change and
rejoins. This is expected, not a bug.

---

## 7. When something is wrong

**Service restarts in a loop.**
`sudo journalctl -u radiotower -n 50`. Almost always: `MUSIC_DIR` doesn't exist
or isn't readable by the service user, or `.cache` isn't writable. The unit uses
`ProtectSystem=strict`, so only paths in `ReadWritePaths` can be written — if you
moved `APP_DIR`, the installer rewrote that line, but a hand-edited unit may not
have it.

**Station is up but silent.**
`curl localhost:8080/api/health`. `tracks: 0` means the scan found nothing. Check
`MUSIC_DIR`, check the extensions are in `config.audioExtensions`, and run
`npm run scan` for per-file skip reasons.

**Works on the LAN, not through the tunnel.**
`systemctl status cloudflared`. If it's running, check that the `service:` port
in `/etc/cloudflared/config.yml` matches `PORT` in `/etc/radio-tower.env`.

**Remote listeners stutter, local ones don't.**
Upstream bandwidth. A 320kbps library × 10 listeners is 3.2Mbps of upload, which
many home connections don't have. Either re-encode the library lower (128–192kbps
is plenty for a radio station) or accept a listener cap. These responses are
ranged and per-listener, so Cloudflare does not cache them.

**Everyone is out of sync with each other.**
Check the Pi's clock: `timedatectl`. A Pi has no real-time clock; if NTP is not
working it drifts, and since the whole schedule is derived from wall-clock time,
the *station itself* moves. `sudo systemctl restart systemd-timesyncd`.

**The drive unmounted mid-broadcast.**
Currently produces per-track 410s. Remount and `systemctl restart radiotower`.
Handling this gracefully is roadmap item #4.

---

## 8. Before every deploy

```bash
bash scripts/build-test.sh
```

Green, or don't deploy. Then re-run `setup-pi.sh` and watch
`journalctl -u radiotower -f` for the first minute — a scan problem on a large
library shows up there and nowhere else.
