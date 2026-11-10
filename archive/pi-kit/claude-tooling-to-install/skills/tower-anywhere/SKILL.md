---
name: tower-anywhere
description: How Radio Tower comes online by itself anywhere — the pi/anywhere/ kit (setup hotspot and phone portal for unknown Wi-Fi, Cloudflare Tunnel to Ortis's own domain from a token on the SD card, watchdog, status file) and how to prove changes to it. Use when working in pi/anywhere/ or pi/wifi/, preparing an SD card, reading radiotower-status.txt, or diagnosing a tower that is not reachable at a new place.
---

# The tower, anywhere

**Goal:** plug in anywhere → live on the owner's domain, with no SSH, no
monitor and no router login. The README in `pi/anywhere/` is the full story.
This is the working summary.

## Two files on the SD card's `bootfs` drive drive everything

| File | Parsed by | Becomes |
|---|---|---|
| `radiotower-wifi.txt` (`name \| password` per line, `HOTSPOT = …`) | `pi/wifi/radiotower-network.sh` | NetworkManager profiles `rt-<ssid>` |
| `radiotower-online.txt` (`DOMAIN`, `TUNNEL_TOKEN`, `SETUP_HOTSPOT`, `NOTIFY`) | `pi/anywhere/radiotower-online.sh` | `/etc/radiotower/online.env` (0600) |

Both tolerate CRLF (Notepad). In the online file, a line that is **absent**
keeps the old value and a line that is **present but empty** clears it. That
is what lets the owner delete the token from FAT32 after the first boot.

## Boot order

`radiotower-online` → `radiotower-network` (Ethernet? known Wi-Fi? else scan
→ hotspot `rt-hotspot` + `radiotower-portal` on :80) → `radiotower` (station
:8080, always) → `radiotower-tunnel` (only with a token) →
`radiotower-watchdog.timer` (every 60 s).

## Invariants: break one and the kit stops working somewhere

1. **Scan before the hotspot.** One radio: in AP mode it can't see other
   networks, and the portal needs the list. There's a test for the order.
2. **The portal only runs while a hotspot is up.** Its unit has no
   `[Install]` section, and `radiotower-network` stops it once on a real
   network. On a LAN it would let anyone reconfigure the tower.
3. **The watchdog never drops the hotspot while a phone is on it** (`iw …
   station dump` count > 0).
4. **The SD-card status file is written on state change only**, to save wear.
5. **The tunnel never gives up** (`StartLimitIntervalSec=0`) and exits 0 with
   no token, so the unit sits quietly down.
6. **The token never appears in output or `ps`**: `--token-file` when
   cloudflared supports it, masked everywhere else.
7. Every script keeps `--dry-run` and its `RT_*` overrides. That's the only way
   any of this is testable off a Pi.

## Proving a change

```bash
node --test tests/pi-anywhere.test.js tests/pi-wifi.test.js
bash scripts/build-test.sh --no-browser
```

Then say, in the worklog, which part can only be proven on the real Pi (the
hotspot actually coming up, a phone's captive-portal popup, the first real
tunnel connection).

## Status file → action

| `State:` | Action |
|---|---|
| `live on https://…` | none |
| `setup hotspot…` | join "Radio Tower Setup" from a phone and pick the router |
| `on the local network (no tunnel token)` | DOMAIN.md steps 2–4 |
| `…tunnel reconnecting` | wait. If it persists, the token was rotated or the route deleted |
| `no internet — local network only` | captive login network, or no uplink. Try a phone tether |
| `station not answering` | `journalctl -u radiotower -n 50` |
