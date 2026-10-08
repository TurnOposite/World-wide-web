# Where the radio runs now

Current since **2026-10-08**. If another document disagrees about hosting,
this one wins (`docs/README.md`).

| | |
|---|---|
| **The website** | <https://globe-trotter-ochre.vercel.app/> — Vercel (Hobby, free), rebuilt from `main` on every push |
| **The station** | <https://129-151-227-129.sslip.io/> — an Oracle Cloud *Always Free* server in Marseille that streams the music and also serves the whole site itself |
| **The music** | on the server, `/srv/radio/music` — sent from the laptop's `Radio Tower\music` by the library bot |
| **The code** | GitHub `TurnOposite/World-wide-web`, `main`. The server pulls it every night at ~04:20 UTC and restarts only if it changed |

The website is set to *tower mode* (`site/config.json`): it plays what the
server says is on air. If the server does not answer, the site falls back to
the 28 tracks on Wix and keeps playing rather than going silent.

## Add music

1. Put songs in a playlist folder under `Radio Tower\music\` (or let the bot
   file your downloads: `library\watch.cmd`).
2. In **Windows PowerShell**, in the `Radio Tower` folder:

```powershell
node library\bot.mjs publish --lib music
```

It sends only what the server does not have yet, then tells the station to
look again. A new song joins the rotation at the end of the current loop, so
nobody's song changes under them. `watch.cmd` does both steps by itself.

The address and the key it uses are in `library\tower.json` (kept off GitHub).

## Channels

For now one channel: the whole library, shuffled (Ortis, 2026-10-08). To bring
back a channel per playlist folder, add this line inside the `channels` list
of `Radio Tower\music\channels.json`, then `publish`:

```json
{ "auto": "crates", "order": "shuffle", "minTracks": 3 }
```

Mashup and Long mixes: `server/lib/channels.js`, `DEFAULT_CHANNEL_SPEC`.

## The DJ booth

<https://globe-trotter-ochre.vercel.app/booth> (or `/booth` on the server's
address). In tower mode it asks for the **station key** — the `key` in
`library\tower.json`. The key stays in that browser tab's memory only.

## Getting into the server

From the laptop (the key file was made for this server):

```powershell
ssh -i $env:USERPROFILE\.ssh\radio-tower ubuntu@129.151.227.129
```

| Want | On the server |
|---|---|
| Is it running? | `systemctl status radio-tower caddy` |
| Its log | `journalctl -u radio-tower -n 50` |
| The station key | `sudo cat /srv/radio/TOWER.txt` |
| Update now, not tonight | `sudo /usr/local/bin/radio-tower-update` |
| Disk | `df -h /` — 150 GB, the library uses a few |

Oracle's web console (cloud.oracle.com, region France South – Marseille,
Compute → Instances → `radio-tower`) can also open a console connection if SSH
ever fails.

## What could go wrong

- **Oracle reclaims idle Always Free servers.** If CPU, network and memory all
  stay under 20 % for seven days, Oracle may stop the server. A radio with few
  listeners is exactly that profile. The fix that costs nothing: upgrade the
  account to **Pay As You Go** (☰ → Billing → Upgrade) — Always Free shapes
  stay free — and set a €1 budget alert at the same time. Only you can do this
  (it is a billing change). Until then, if the site falls back to the Wix
  tracks, check the instance in the console and press Start.
- **The address is the server's IP.** If the instance is ever recreated it
  gets a new IP and a new `…sslip.io` name: update `site/config.json`
  (`tower.url` and `tower.allowed`) and `library\tower.json`.
- **Rate limits.** One address can make 300 requests at once and 5 a second
  after that (`RATE_BURST`, `RATE_PER_SECOND` in `/etc/radio-tower.env`).
  Twenty wrong station keys from one address lock it out for a while.
