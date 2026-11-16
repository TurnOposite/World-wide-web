---
name: tower-deploy
description: Publish Radio Tower — GitHub, then Vercel (the site), then the Oracle Cloud server (the tower). Use when asked to push, fire, publish or deploy, to check what is live, to read the tower's nightly update, to reinstall the server, or to diagnose a tower that is unreachable, silent, restarting, or stuck on an old commit.
---

# Getting a change on the air

Rewritten 2026-11-16. The Raspberry Pi was retired on 2026-11-10; its installer,
tunnel scripts and the old version of this skill's subject are in
`archive/pi-kit/` and are not run. `docs/LIVE.md` is the authority on where
things are hosted; this skill is how to move a change through them.

## The three places

| | Address | Takes `main` |
|---|---|---|
| **GitHub** | `TurnOposite/World-wide-web`, `main` | on push; `.github/workflows/ci.yml` runs the whole self-test |
| **Vercel** (the site) | `https://globe-trotter-ochre.vercel.app` | once that self-test is green. `/config.json` → `commit` is what it serves |
| **The tower** (Oracle, Marseille) | `https://129-151-227-129.sslip.io` | every night ~04:20 UTC (`deploy/cloud/update.sh`), only a commit CI passed, with rollback; at once with `fire`; or from GitHub when `fire.yml`'s deploy key is set up (`docs/FIRE-FROM-CLOUD.md`) |

The addresses fire uses are in `deploy/fire.json`. If the tower moves, change
that file and `site/config.json` (`tower.url`, `tower.allowed`) together.

## The rule before anything leaves the laptop

**Ask Ortis before every push** (his rule since 2026-11-10). He says « push »
or « fire »; then publish and verify. `bash scripts/build-test.sh` green first.

A change to how a day is dealt (`server/lib/programme.js` `buildDay`, the
rules' shape) changes what is playing the moment the tower takes the code:
ship it so it starts at a 05:00 Paris boundary, and tell him the day.

## Publish

In **PowerShell on the laptop**, in `radio-tower-live\`:

```powershell
node scripts/fire.mjs --dry-run
```

```powershell
node scripts/fire.mjs --yes
```

`fire` checks the map, fetches GitHub (never forces), runs the unit tests,
pushes `HEAD:main`, waits for CI, waits for Vercel to serve the commit, then
SSHes to the tower and runs its updater, and checks the tower answers on the
new commit. About 7 minutes. `--no-tower` stops after Vercel (the tower takes
it tonight); `--skip-tests` when the full self-test has just run. `fire.cmd`
is the same by double-click and asks you to type FIRE.

From the cloud, with no laptop: push to `main`. Vercel follows CI. The tower
follows either that night, or within minutes if the deploy key of
`docs/FIRE-FROM-CLOUD.md` is in place.

The laptop has no global git identity and Git is the portable one in
`Documents\Ortis\Git` (fire finds its bash). Commit with
`git -c user.name=… -c user.email=…` unless Ortis has set one.

## Verify live

```bash
npm run status
```

One screen: GitHub `main` and its self-test, the commit Vercel serves, the
tower's commit and health, listeners, the telegraph line, the next 05:00, and
the commits since you last looked. All three commits should be the same one.
By hand:

```bash
curl -s https://globe-trotter-ochre.vercel.app/config.json
```

```bash
curl -s https://129-151-227-129.sslip.io/api/health
```

Then open the changed page, desktop and phone, and tell Ortis in two lines
what changed and where to see it. For a UI change, `node
scripts/compare-phone.mjs` before and after gives every route at three sizes
on one page.

## The tower's shell

**PowerShell on the laptop** (the key's path is passed to ssh; never open or
copy the key):

```powershell
ssh -i $env:USERPROFILE\.ssh\radio-tower ubuntu@129.151.227.129
```

Then, **bash on the tower**:

```bash
sudo /usr/local/bin/radio-tower-update      # take main now (same CI check, same rollback)
journalctl -u radio-tower-update -n 20      # what the last nights did
journalctl -u radio-tower -n 50             # the station's own log
systemctl status radio-tower caddy
cat /srv/radio/deployed-commit              # what the updater believes is on air
```

Layout on the server: code `/opt/radio-tower` (a git checkout, root's), the
built site `/opt/radio-tower/dist-tower`, music `/srv/radio/music`, the scan
cache, the telegraph log and the push subscriptions in `/srv/radio/cache/`,
settings `/etc/radio-tower.env` (root-only; holds the station key — never
print it). The service runs as `radiotower` with `ProtectSystem=strict`: it
can write under `/srv/radio` and nowhere else.

### Settings that are not in the repository

`/etc/radio-tower.env` is written once by `deploy/cloud/install.sh`; the
nightly update never touches it. Lines added by hand since (then `sudo
systemctl restart radio-tower`):

| Line | What it turns on |
|---|---|
| `TELEGRAPH_NOTIFY_URL=https://ntfy.sh/<long random topic>` | a notification to Ortis's phone when someone writes on the line (`docs/NOTIFICATIONS.md`) |
| `TELEGRAPH_LOG_KEEP_DAYS=<n>` | how many days the private chat log goes back (0 or unset: only the size cap) |
| `TELEGRAPH_PUSH=0` | switches the listeners' opt-in notifications off |

A secret goes in that file on the server, never in the repository, a doc, a
log or a chat.

## A new server

`deploy/cloud/README.md`: a fresh Ubuntu machine, `first-boot.sh` fetches and
runs `install.sh` (Node 22, Caddy with HTTPS on `<ip>.sslip.io`, the firewall
ports Oracle's images keep shut, the service, the nightly timer). About an
hour, mostly waiting. Then `node library\bot.mjs publish` from the laptop
sends the music back. The way off Oracle altogether is `docs/EXIT-ORACLE.md`.

## Diagnosing

**The tower is on an old commit.** `journalctl -u radio-tower-update -n 20`.
« its self-test is failure/pending on GitHub »: CI has not passed that commit —
look at the Actions page, not the server. « did not come up last time — waiting
for a newer commit »: the commit was tried, did not answer, and was rolled
back (`/srv/radio/rejected-commit`); fix it with a new commit. « could not
build »: npm or the network; it retries the next night.

**The site is on an old commit.** Vercel only deploys once CI is green
(Deployment Checks). A red self-test holds the site back by design.

**The site plays 28 tracks in a loop.** It could not reach the tower within
6 s and fell back to the in-browser station on the Wix tracks. Check
`/api/health` on the tower; if the server is stopped (Oracle reclaims an idle
Always Free machine), start it from the Oracle console.

**Station up, nothing plays.** `/api/health` → `tracks: 0` means the scan
found nothing: `MUSIC_DIR` in `/etc/radio-tower.env`, then `npm run scan` in
`/opt/radio-tower`.

**Service restarts in a loop.** `journalctl -u radio-tower -n 50`. Usually a
path outside `/srv/radio` it tried to write, or a broken `/etc/radio-tower.env`.

**HTTPS fails on a new address.** Caddy needs ports 80 and 443 reachable to
get its certificate: the Oracle security list *and* the machine's iptables
(`install.sh` opens the second; the first is the console).

**Everyone is out of sync.** The server's clock: `timedatectl`. The whole
programme is a function of wall-clock time.

## What not to do

- Never change `STATION_EPOCH` on the live tower: it re-deals everything.
- Never force-push `main`. `fire` refuses; so should you.
- Never edit code in `/opt/radio-tower` by hand: the updater resets it to the
  commit it deploys. Change the repository.
- Never touch `/srv/radio/music` from the shell: the music is published from
  the laptop by the library bot, and changes to it need Ortis's word.
