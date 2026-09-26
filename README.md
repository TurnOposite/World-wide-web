# Radio Tower

A Raspberry Pi that hosts a website playing music. **One synced stream** — everyone
who opens the URL hears the same track at the same second. No account, no app, no
login. Press one button.

```
  ● ON AIR

  Static Bloom
  Test Signal
  Tower Demo · 2026
  ▬▬▬▬▬▬▬▬▬▬▬▬░░░░░░░░░░░░░░░░░░  0:02        -0:07

  [ ❚❚ Mute ]   🔊 ▬▬▬▬▬●▬   ( Resync )
```

## Quick start

```bash
npm install
MUSIC_DIR=/path/to/your/mp3s npm start
# open http://localhost:8080
```

That is the whole setup. Point it at a folder of MP3s and it starts broadcasting.

## On a Raspberry Pi

**Starting from a blank SD card?** [`pi/README.md`](pi/README.md) is the
from-scratch walkthrough — Raspberry Pi Imager, then one SSH command.

Already have the repo on a Pi that's up and running?

```bash
sudo bash scripts/setup-pi.sh                 # Node, systemd, /opt/radio-tower
sudo bash scripts/setup-tunnel.sh quick       # a public URL, right now
```

`quick` gives a throwaway `*.trycloudflare.com` address. For something permanent
on your own domain:

```bash
sudo bash scripts/setup-tunnel.sh named tower.example.com
```

Either way nothing inbound is opened on your router — the Pi dials out to
Cloudflare. Full walkthrough in [`docs/DEPLOY.md`](docs/DEPLOY.md).

## How the sync works

The programme is a **pure function of wall-clock time**. Nothing stores what is
playing; the server computes it from the library, a fixed epoch, and the current
instant. Ask at 14:32:07 and you are told "track X, 41.2 seconds in" — you seek
there and you are in sync with everyone else.

Which means: restarting the server does not interrupt the broadcast, two servers
with the same library play identically with no coordination, and joining late is
not a special case — it is the only case.

The player corrects for a wrong device clock (it measures skew against the
server) and for buffering drift (it re-seeks if it falls more than two seconds
behind). Details in [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Commands

```bash
npm start                # run the station
npm run dev              # …with --watch
npm test                 # 51 unit + integration tests
npm run scan             # what does your library look like to the tower?
npm run scan -- --list   # …and print every track
npm run healthcheck      # one-screen status of a running station
npm run selftest         # the full self-test, including a real browser
```

## The self-test

```bash
bash scripts/build-test.sh
```

Boots a real server against generated audio, exercises every endpoint with curl,
proves the schedule is deterministic across thousands of sampled instants, checks
range streaming byte-for-byte, and drives the player in headless Chromium to
confirm audio actually plays in sync and rolls over between tracks on its own.

Exit code 0 means the tower is sound. Run it before and after every change.

## Layout

```
BRIEF.md          the standing guide — read this first
CLAUDE.md         project instructions for any Claude session
server/           Express app; lib/schedule.js is the heart of it
public/           the player — plain HTML/CSS/JS, no build step
pi/               the from-scratch Pi installer kit — start here for real hardware
scripts/          self-test, tunnel setup, scan, healthcheck, setup-pi.sh (wraps pi/install.sh)
deploy/           systemd unit, env template, cloudflared config
tests/            node:test suite
docs/             architecture, deployment, decision log, roadmap, worklog
.claude/          the agents, skills and commands that build this project
```

## Configuration

Everything is an environment variable; see
[`deploy/radio-tower.env.example`](deploy/radio-tower.env.example).

| Variable | Default | |
|---|---|---|
| `MUSIC_DIR` | `./music` | where your audio lives |
| `PORT` | `8080` | |
| `STATION_NAME` | `Radio Tower` | shown in the player |
| `STATION_EPOCH` | `2026-01-01T00:00:00Z` | the station's t=0 — **set once, never change** |
| `AUTO_RESCAN_MINUTES` | `30` | pick up newly added files |
| `GAP_SECONDS` | `0` | silence between tracks |

## Adding music

Drop files into `MUSIC_DIR`. They join the rotation on the next auto-rescan, or
immediately with:

```bash
curl -X POST http://localhost:8080/api/rescan
```

Supported: mp3, m4a, aac, ogg, opus, flac, wav, webm. Files whose duration can't
be read are skipped and named in `npm run scan` output.

## Working on it with Claude

The project carries its own tooling in `.claude/`, so it travels with the folder:

- `/tower-status` — where things stand right now
- `/tower-work` — one complete improvement cycle, baseline to worklog
- `tower-builder` — builds a feature and proves it with the self-test
- `tower-auditor` — read-only review before a deploy
- `tower-scout` — researches an open question and writes up options

To also register them as an installable plugin:

```
/plugin marketplace add .
/plugin install radio-tower-ops@radio-tower
```

## Not doing

No accounts. No tracking. No cookies. No Spotify — its embed only gives
logged-out visitors 30-second previews, which defeats the point; reasoning in
[`docs/DECISIONS.md`](docs/DECISIONS.md). No requests or skips — they need stored
playback state, which is the one thing this design does not have.
