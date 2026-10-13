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

The music stays in `Radio Tower\music\`; the bot runs from this copy
(`radio-tower-live\library\`). The copy in `Radio Tower\library\` is the
7 October version — it cannot open a zip on Windows; leave it be.

1. Put songs in a playlist folder under `Radio Tower\music\` — or double-click
   **`radio-tower-live\library\watch.cmd`**: it files songs that land in
   Downloads, opens Bandcamp album zips as they arrive (into
   `Crates\Bandcamp\<album>\`), and sends both to the tower a minute later.
2. Or by hand, in **Windows PowerShell**, in the `radio-tower-live` folder:

```powershell
node library\bot.mjs publish --lib "..\Radio Tower\music"
```

It sends only what the server does not have yet, then tells the station to
look again. A new song joins the rotation at the end of the current loop, so
nobody's song changes under them.

The address and the key it uses are in `Radio Tower\library\tower.json`
(kept off GitHub; the bot finds it beside the music folder).

### Album zips already in Downloads

`watch.cmd` only opens zips that arrive while it runs. For the ones already
there (the Bandcamp batch of 12 October), first see what would happen —
**Windows PowerShell**, in the `radio-tower-live` folder:

```powershell
node library\bot.mjs albums --lib "..\Radio Tower\music" --since 2026-10-12 --dry-run
```

then the same line without `--dry-run`, and with `--publish` to send them.
The zips stay in Downloads; `music\_albums.json` remembers what was opened.
A pack of short sounds and a second download of the same album are skipped.

## Channels

For now one channel: the whole library, shuffled (Ortis, 2026-10-08). To bring
back a channel per playlist folder, add this line inside the `channels` list
of `Radio Tower\music\channels.json`, then `publish`:

```json
{ "auto": "crates", "order": "shuffle", "minTracks": 3 }
```

Mashup and Long mixes: `server/lib/channels.js`, `DEFAULT_CHANNEL_SPEC`.

## Canopy

A look of the radio page: every sound on air as a dot in a slowly turning
cube, coloured by kind (2026-10-12). <kbd>V</kbd> → **Canopy**, then pick
**Big, behind** (centred behind the whole page; the panels turn to glass) or
**Small, in front** (bottom right, above the page). <kbd>F</kbd> for full
screen. The booth can broadcast it as everyone's look.

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

## Updates

Every night at ~04:20 UTC the server pulls `main` — and goes on air with it
only if GitHub's self-test passed on that commit. A commit that does not come
up is rolled back and set aside until a newer one arrives
(`deploy/cloud/update.sh`). What the last night did:
`journalctl -u radio-tower-update -n 20`.

**Once, after the 13 October changes are on GitHub:** the updater installed on
the server predates all this and cannot update itself yet. On the server
(**bash**, after the `ssh` line above), pull now with the old one, then
install the new one:

```bash
sudo /usr/local/bin/radio-tower-update
sudo install -m 755 /opt/radio-tower/deploy/cloud/update.sh /usr/local/bin/radio-tower-update
```

From then on it re-installs itself. To update without waiting for CI:
`sudo TOWER_SKIP_CI=1 /usr/local/bin/radio-tower-update`.

## The website's deploys

Vercel deploys every push to production whatever CI says — on 10 October a
commit whose self-test failed went live. **Vercel → project → Settings →
Build and Deployment → Deployment Checks → Add Checks → GitHub → `test`**
holds each production deployment until the self-test passes (Vercel's docs
speak of custom domains: check it also holds the `…vercel.app` address). A
push of only `control.json`, which CI skips, then waits for the next code
push — harmless in tower mode, where the booth talks to the tower.

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
