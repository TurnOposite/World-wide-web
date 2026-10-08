# Radio Tower

A Raspberry Pi that hosts a website playing music. One synced stream — everyone
who opens it hears the same track at the same second, no account required.

## Coming back after a break?

**→ [`docs/PICK-UP-AGAIN.md`](./docs/PICK-UP-AGAIN.md)** is one page and assumes
you remember nothing: how to check the code still works, how to get the Pi onto
a Wi-Fi network it has never seen (no SSH, no monitor — see
[`pi/NEW-NETWORK.md`](./pi/NEW-NETWORK.md)), and what is actually left to do.
Written 2026-08-28 when the project went on hold. Read it before the rest.

**New since 2026-09-23:** the tower can be plugged in *anywhere* and come
back online on your own domain by itself (setup hotspot + phone page for a
Wi-Fi it has never seen, a Cloudflare Tunnel token on the SD card, a
watchdog) — **[`pi/anywhere/README.md`](./pi/anywhere/README.md)**. And the
site has three new rooms — **Library** (essays on a bookshelf, the thesis,
the network-map room), **Photos**, **Crates** — fed by
[`collections/collection.json`](./collections/collection.json).

**Live since 2026-10-08:** the site on Vercel in tower mode, the music on the
Oracle server at `https://129-151-227-129.sslip.io` —
**[`docs/LIVE.md`](./docs/LIVE.md)** (one shuffled channel for now; rate
limits on the public API).

**New since 2026-10-07 — channels, the library bot, the cloud tower.** The
station plays several synced channels from one library (Mashup, Long mixes,
one per playlist folder — `server/lib/channels.js`). `library/bot.mjs` keeps
`music/` in the shape of Ortis's Spotify playlists and sends new songs to the
tower (**[`library/README.md`](./library/README.md)**). The tower now lives on
an Oracle Cloud Always Free server — **[`deploy/cloud/README.md`](./deploy/cloud/README.md)**.

**New since 2026-09-26 — the cloud edition.** The station also runs as a
static website with no server: every browser computes the programme with the
same `Station` class, the DJ's reorders live in `site/station/control.json`
in the GitHub repo, and the site adds an Atlas, the Écrits and the Portfolio
around the radio. **[`docs/CLOUD.md`](./docs/CLOUD.md)** is the plan and the
architecture; **[`docs/GO-LIVE.md`](./docs/GO-LIVE.md)** is the one page for
putting it on GitHub Pages. The Pi version is unchanged and still supported.

## Read this first

**→ [`BRIEF.md`](./BRIEF.md) is the standing guide for this project.** It holds the
original request verbatim, the decisions already locked in, the single idea the
architecture rests on, and the rules every contributor follows. Open it before
you write code. Every agent in `.claude/agents/` is told to do the same.

Then skim, in order:

1. [`docs/ARCHITECTURE.md`](./docs/ARCHITECTURE.md) — how the station clock works
2. [`docs/DECISIONS.md`](./docs/DECISIONS.md) — why things are the way they are
3. [`docs/ROADMAP.md`](./docs/ROADMAP.md) — what to build next
4. [`docs/WORKLOG.md`](./docs/WORKLOG.md) — what previous runs already did
5. [`docs/PLANNING.md`](./docs/PLANNING.md) — where this is heading, and whether
   that's still the right way

How the four docs divide up: **DECISIONS** is why the code looks like this,
**WORKLOG** is what each run did, **PLANNING** is the standing-back verdict on
direction, **ROADMAP** is the ranked consequence of all three.

**[`docs/README.md`](./docs/README.md) is the index** — which file answers which
question, and which of two overlapping documents is the current authority. When
you are unsure whether a doc has been superseded, that table is the answer.

## The rule that matters most

Run the self-test before and after every change:

```bash
bash scripts/build-test.sh
```

It boots a real server against generated audio, exercises the HTTP surface,
checks the schedule is deterministic, and drives the player in a real browser.
Green before your change and red after means **your change is wrong**. Do not
weaken a test to make it pass.

## Commands

```bash
npm install            # once
npm start              # run the station on :8080
npm run dev            # same, with --watch
npm test               # unit + integration tests
npm run scan           # what does the library look like to the tower?
npm run scan -- --list # …and print every track
npm run healthcheck    # one-screen status of a running station
npm run selftest       # the full build-test.sh
npm run collections    # does collections/collection.json match the files on disk?

npm run site           # the static site on :8090 (add -- --fixtures DIR for local audio)
npm run site:build     # assemble dist/ (what GitHub Pages serves)
npm run site:smoke     # drive the static site in a real browser (also stage 7 of the self-test)
npm run cloud:check    # is site/station/library.json valid?
npm run cloud:live -- https://NAME.github.io/radio-tower/   # after going live: page, audio, queue — from outside
npm run preview        # the private claude.ai preview → dist-preview/ (test tones, shared-database booth)
npm run preview:smoke  # drive that preview through a stand-in claude.ai host
node scripts/site-card.mjs  # re-draw the link-preview card (site/assets/share-card.jpg) after changing places, origin or palette
```

The static site lives in `site/` and has no bundler either: `scripts/site-build.mjs`
only copies. `site/js/lib/*` are **generated copies** of `server/lib/schedule.js`,
`server/lib/payloads.js`, `public/viz.js` and `public/queue.js` — edit the
source and run `node scripts/site-sync.mjs`; a test fails if they drift.

Changing what is *playing* — as opposed to what the station is — happens in the
booth, which is standalone and needs none of the above:

```bash
cd dj
node dj.mjs status                 # on air, upcoming, what can legally be moved
node dj.mjs doctor                 # is the station even reading the right folder?
node dj.mjs emit "night drive"     # a Spontaneous Emission
node dj.mjs clear                  # back to the station clock
node --test test.mjs               # the booth's own 11 tests
```

Deployment: `pi/install.sh` is the maintained installer (installs to
`/opt/radio-tower` with a systemd unit) — `pi/README.md` is the from-scratch,
blank-SD-card walkthrough. `scripts/setup-pi.sh` is a thin compatibility
wrapper around it for a repo already on the Pi (see `docs/DECISIONS.md`
2026-08-18, "Reconciling the two Pi installers" — do not re-add logic there,
it should stay a one-line `exec` into `pi/install.sh`). `scripts/setup-tunnel.sh`
handles the Cloudflare Tunnel (`quick` for an ephemeral URL, `named
yourdomain.com` for a permanent one).

## Conventions

- **ES modules everywhere.** `"type": "module"`. No CommonJS, no transpiler.
- **No build step on the front end.** `public/` is plain HTML/CSS/JS served as-is.
  If you reach for a bundler, you have left the design of this project.
- **Dependencies are a cost.** Two runtime deps today (`express`,
  `music-metadata`). Adding a third needs a line in `docs/DECISIONS.md` saying why.
- **The Pi is the target.** Pi Zero 2 W: 512MB RAM, slow USB reads. No transcoding
  per request, no second copy of the library in memory.
- **Comments explain *why*, not *what*.** The code says what it does.
- **Never commit audio.** `music/` is gitignored; real libraries live at `MUSIC_DIR`.
- **Append to `docs/DECISIONS.md` and `docs/WORKLOG.md`.** Never rewrite history there.

## Embedded tooling

This project carries its own agents, skills and slash commands in `.claude/`, so
they travel with the folder rather than living in one conversation:

| Kind | Name | Use |
|---|---|---|
| Agent | `tower-planner` | Stands back: reviews what's built against the goal, re-ranks the roadmap, provisions tooling. No code |
| Agent | `tower-builder` | Picks the next roadmap item, implements it, proves it with the self-test |
| Agent | `tower-auditor` | Read-only review: correctness, security, Pi-fitness |
| Agent | `tower-scout` | Researches one bounded question and writes up options; changes no code |
| Agent | `tower-dj` | Changes what is *playing*: reads the MP3s, drives the queue over the Pi bridge, fires a Spontaneous Emission. Changes no code |
| Agent | `tower-roamer` | Keeps the tower online anywhere: known Wi-Fi, unknown Wi-Fi (setup hotspot + phone portal), your domain, the watchdog. Owns `pi/anywhere/` and `pi/wifi/` |
| Agent | `tower-curator` | Decides what the Library / Photos / Crates rooms publish, and makes it safe to publish (student IDs, GPS, faces, raw data). Owns `collections/` |
| Skill | `tower-dj-booth` | Operating the booth in `dj/` — moods, the permutation rule, and how to read a refusal |
| Skill | `tower-selftest` | How to run and read the self-test, and how to fix common failures |
| Skill | `tower-station-clock` | The sync model, with the invariants that must not break |
| Skill | `tower-deploy` | Getting it onto the Pi and onto the public internet |
| Skill | `tower-anywhere` | The go-anywhere kit: boot order, the invariants, the status file, how to prove a change off-Pi |
| Skill | `tower-curate` | The publishing pipeline and privacy rules for the three rooms |
| Skill | `tower-mobile-check` | Proving the player on a phone: what emulation can't settle, the iOS Safari hazards, the physical-device checklist |
| Command | `/tower-status` | Where the project stands right now |
| Command | `/tower-work` | Do one full improvement cycle, end to end |
| Command | `/tower-online` | Is the tower set up to come online anywhere? What works, what only the Pi can prove |
| Command | `/tower-curate` | Add / remove / fix what a room shows — shortlist, scrub, publish |

> The six rows added 2026-09-23 (`tower-roamer`, `tower-curator`,
> `tower-anywhere`, `tower-curate`, `/tower-online`, `/tower-curate`) were
> written from Cowork, which may not write into `.claude/`. Until Ortis runs
> the three copy commands in
> [`claude-tooling-to-install/README.md`](./claude-tooling-to-install/README.md),
> they live there instead.

The account-level plugins (`engineering`, `desktop-commander`, `wix`, `canva`,
`box`, `pdf-viewer`, `adobe-for-creativity`, `productivity`, `postiz`,
`cowork-plugin-management`) are enabled for every session, so their skills —
`engineering:code-review`, `engineering:testing-strategy`,
`engineering:deploy-checklist`, `engineering:debug`, `engineering:system-design`
— are available here without extra setup. Use them; that is what they are for.
Each agent file ends with the short list of which ones are *its* to reach for;
those lists are the specific instruction, this paragraph is the general one.

## The folders that are not the station

| | |
|---|---|
| `dj/` | **the booth.** Standalone, zero dependencies, its own `CLAUDE.md` and its own permission fence. `cd dj && claude` runs the DJ on its own; it cannot write to `server/`, `public/`, `scripts/`, `tests/`, `docs/` or `music/`. It changes the *programme*, never the station |
| `usb/` | rebuilding the USB stick so `pi/install.sh` cannot adopt the wrong library. Dry-run by default. See `docs/guides/USB-CLEANUP.md` |
| `split/` | cutting the long mixes into tracks with ffmpeg. Proposes; refuses to write into `MUSIC_DIR`. ffmpeg is **not** a runtime dependency — this is offline tooling, like `usb/` |
| `collections/` | **the rooms' content.** `collection.json` is the only thing that decides what is published; `_review/` and `_incoming/` are working folders the server refuses to serve. Personal material — see the `tower-curate` skill before adding anything |
| `archive/` | build debris kept rather than deleted (the old architecture PDF, the superseded SD-card zip). Nothing here is referenced by code |

The division: **`tower-builder` changes the station. `tower-dj` changes what it
is playing.** If a DJ session finds something that needs a server change, it
files it and stops — reaching one folder up is the failure mode `dj/`'s
permission fence exists to prevent.

## Working style expected here

Small, complete, verified steps. One coherent improvement per run, tested, with a
dated line in `docs/WORKLOG.md`. A half-finished feature left behind is worse than
no feature. If something is genuinely ambiguous and Ortis is reachable, ask; if he
is not (a scheduled run), pick the most reasonable option, state the assumption in
the worklog, and continue.
