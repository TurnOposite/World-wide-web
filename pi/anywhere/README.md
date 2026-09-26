# Take the tower anywhere

**What this folder is for:** plug the Pi in anywhere and the station comes
back online by itself, on your own domain. That includes a router nobody has
ever told it about. You never need SSH, a monitor or the router's admin page.

Everything here gets installed by `pi/install.sh`. It all reads two text
files on the SD card's boot partition, the small FAT32 drive Windows calls
`bootfs`:

| File on the card | What it holds | Example |
|---|---|---|
| `radiotower-wifi.txt` | Wi-Fi networks you know in advance, best first | [`../wifi/radiotower-wifi.txt.example`](../wifi/radiotower-wifi.txt.example) |
| `radiotower-online.txt` | your domain, the Cloudflare tunnel token, the setup-hotspot password | [`radiotower-online.txt.example`](radiotower-online.txt.example) |

The easy way to write both files is `prepare-card.ps1`, covered below.

---

## What happens when you plug it in

```
power on
  │
  ├─ radiotower-online     reads radiotower-online.txt → /etc/radiotower/online.env
  ├─ radiotower-network    Ethernet cable in? ── yes ──► on the network
  │                        a Wi-Fi from radiotower-wifi.txt in range? ── yes ──► on the network
  │                        neither ──► scan what's around, then broadcast
  │                                    "Radio Tower Setup" + the setup page on http://10.42.0.1
  ├─ radiotower (station)  playing, always — even on the setup hotspot, at http://10.42.0.1:8080
  ├─ radiotower-tunnel     on the network + token set ──► live at https://your-domain
  └─ radiotower-watchdog   every minute: station answering? internet? tunnel connected?
                           fixes what wedged, writes radiotower-status.txt back to the card
```

## The three ways it gets online somewhere new

**1. Ethernet.** Plug a cable into the router. That's all. No configuration
exists for this because none is needed.

**2. A Wi-Fi you know about in advance.** Put it in `radiotower-wifi.txt`
(`prepare-card.ps1` asks). A phone hotspot is a good second line: you can
always reach the tower by turning tethering on.

**3. A Wi-Fi you've never seen.** This is the new part. Power the tower on.
After about a minute it has checked for Ethernet and every known network,
found none, and started broadcasting its own Wi-Fi:

1. On your phone, join **Radio Tower Setup** (password `radiotower`, or
   whatever you put in `radiotower-online.txt`).
2. A "Connect the tower to Wi-Fi" page opens by itself. If it doesn't, open
   `http://10.42.0.1` in the browser.
3. Pick the router from the list, or type its name, then type its password.
   Tap **Save and connect**.
4. Your phone drops off the setup Wi-Fi. That is the tower leaving it to join
   the network you picked. Put your phone back on the normal Wi-Fi. Within
   a minute the station is live on your domain.

If **Radio Tower Setup** comes back within two minutes, the tower couldn't
join the network. That's almost always a mistyped password. Rejoin, and the
page tells you what went wrong. The network you picked is saved at the top of
`radiotower-wifi.txt` on the card, so next time the tower joins it without
asking.

With no router at all, the setup Wi-Fi is still a working radio. Anyone who
joins it can open `http://10.42.0.1:8080` and listen.

## Your own domain

Here's why the tunnel works anywhere: the tower makes an **outbound**
connection to Cloudflare, and Cloudflare serves your domain from that
connection. Nothing comes in through the router. That means no port
forwarding, no router login and no fixed IP, and it works behind hotel Wi-Fi,
CGNAT or a phone tether.

It needs one token, set up once. **→ [`DOMAIN.md`](DOMAIN.md)** walks through
it from "I have a domain" to "the tower is live on it".

> A standing question that is yours to decide, not this kit's: Cloudflare's
> terms reserve the right to limit free-plan traffic that is mostly audio or
> large files. That is exactly what a radio station serves. The details are
> in `docs/ROADMAP.md` → "Needs a ruling from Ortis".

## Keeping it live

| What goes wrong | What handles it |
|---|---|
| The station process crashes | systemd restarts it within 5 s (`Restart=always`) |
| The station is running but stops answering | the watchdog restarts it after 3 missed checks |
| The router reboots, or the Wi-Fi drops | NetworkManager reconnects on its own. After 3 minutes with no internet, the watchdog re-runs `radiotower-network` |
| The tower is on the setup hotspot and the known router comes back | every 5 min, **if nobody is using the setup page**, the watchdog looks for known networks again |
| The tunnel disconnects | cloudflared reconnects on its own. After 3 minutes of "internet fine, tunnel down", the watchdog restarts it |
| The whole Pi freezes (kernel hang, SD stall) | the Pi's hardware watchdog reboots it (`conf/hardware-watchdog.conf`) |
| The Pi's Wi-Fi goes quiet after hours | Wi-Fi power-saving is turned off (`conf/wifi-powersave.conf`), a classic cause on Pis |
| Logs fill the SD card over months | the journal is capped at 64 MB |

## Reading the status file

If the tower ever seems dead, take the card out and open
**`radiotower-status.txt`** on `bootfs`. The watchdog rewrites it whenever the
state changes. It only writes on changes, because an SD card written every
minute wears out fast.

```
State:    live on https://radio.example.com
Network:  Living Room 5G
Address:  192.168.1.42
Station:  up
Tunnel:   connected
```

| State says | Meaning | Do this |
|---|---|---|
| `live on https://…` | all good | nothing |
| `setup hotspot — join it from a phone…` | no known network in range | way 3 above |
| `on the local network (no tunnel token)` | online, but not public | add the token, see DOMAIN.md |
| `on the local network; tunnel reconnecting` | token set, tunnel not connected | usually fixes itself. If it lasts, the token was rotated or the route was deleted in Cloudflare |
| `no internet — local network only` | joined a network with no internet (or a captive login page) | try another network, or a phone tether |
| `station not answering` | the app itself is broken | `journalctl -u radiotower -n 50` over SSH, or reinstall |

The file doesn't exist yet? Then the watchdog has never run, which means this
kit isn't installed on that card. Run `pi/install.sh` once.

## Preparing a card from Windows

RUN THIS IN: Windows PowerShell on the laptop, with the SD card in the reader.

```powershell
cd "C:\Users\barri\Documents\Ortis\Radio Tower\pi\anywhere"
powershell -ExecutionPolicy Bypass -File .\prepare-card.ps1
```

It finds the `bootfs` drive, copies the project to `bootfs:\radiotower\`
(leaving out the music, which travels on the USB stick), and asks for Wi-Fi
networks, your domain and the token. Press Enter to skip any question.

## First install on a Pi that doesn't have this kit yet

A Pi installed before this folder existed needs `pi/install.sh` run once.
After that, everything above works without SSH.

RUN THIS IN: the Pi, over SSH (or at its keyboard).

```bash
sudo bash /boot/firmware/radiotower/pi/install.sh
```

## Commands on the Pi, for when you can SSH in

RUN THESE IN: the Pi, over SSH.

```bash
sudo radiotower-online --status        # domain, token (masked), setup hotspot name
sudo radiotower-network --status       # which Wi-Fi config it read, what's connected
sudo radiotower-watchdog --dry-run     # what the watchdog would do right now
cat /run/radiotower/status.json        # the watchdog's last pass
journalctl -u radiotower-tunnel -n 30  # tunnel log
```

## What is proven and what isn't

**Proven by `tests/pi-anywhere.test.js`, on any machine with bash and Node:**
parsing of the online file (CRLF, pasted install commands, bad tokens, the
"a deleted line keeps the old value" rule), the setup page end to end
(listing networks, validating input, writing the Wi-Fi file atomically,
launching the join, answering captive-portal probes), the watchdog's decisions
with stubbed probes, the tunnel command it builds, and that `install.sh`
installs and enables every piece.

**Not proven here, because it needs the real Pi and a real radio:** that
`nmcli` brings the hotspot up on this Pi, that iOS and Android pop the setup
page open by themselves, and the first real tunnel connection. Try way 3 once
at home, while you can still reach the tower another way, before you rely on
it somewhere new. The same rule applied to `pi/wifi/`.
