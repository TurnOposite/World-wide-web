# Radio Tower — the standing brief

> **Every agent, session, and scheduled run working on this project reads this file first.**
> It is the constitution. `CLAUDE.md` points here; the agents in `.claude/agents/` are
> instructed to open it before doing anything.

---

## 1. The original request, verbatim

Kept unedited on purpose. When a decision is ambiguous, the answer is more likely
to be found in the original wording than in any summary of it.

> Set up this project: use all these plugins to create an agent capable of test
> building the platform itself: code the infrastructure of a website capable of
> playing music (I have enough mp3 files to last for weeks but maybe a spotify
> embedded link that would still let users without an account get direct access
> to the audio could work). Make the plugins embedded in the project, not only
> this conversation. Schedule a task to self analyse and continue working on
> this project. For that you may create as many files as you want in the folder
> given, update them: ask me the permission this time if you want but continue
> building on it on your own. If you can make sure this prompt stays a general
> guide by making sure the task agents can see this it's perfect too.

Project instruction attached to the folder:

> Coding a Raspberry Pi to function as a host server for a website that plays music

---

## 2. Decisions already made

These were answered by Ortis on 2026-08-17. **Do not relitigate them without asking.**

| Question | Decision | Consequence |
|---|---|---|
| Listening experience | **Radio station — one synced stream** | Everyone hears the same track at the same second. Not a jukebox. Nobody can seek. |
| Reach | **Public internet from day one** | Cloudflare Tunnel. No port forwarding, no static IP needed. |
| Stack | **Node.js + Express + vanilla JS** | No build step. One language. Small enough for a Pi Zero 2 W. |
| Spotify | **Dropped** | Spotify's embed only gives 30-second previews to logged-out users, which defeats the stated goal of "access without an account". The MP3 library *is* the product. |

### Why "no Spotify" was the right call
The brief hoped an embedded Spotify link would let account-less visitors hear full
audio. It does not — the iframe falls back to 30-second previews unless the
listener is signed in that browser. If a future agent wants a second audio source,
public internet-radio stream URLs (SomaFM and similar) play in full for anyone and
are the correct substitute. Do not silently re-add Spotify.

---

## 3. The one idea the whole system rests on

**The programme is a pure function of wall-clock time.**

No playback state is stored anywhere. Given the library and a fixed epoch,
`Station.at(now)` returns which track is on air and how many seconds into it —
deterministically, on any machine, after any restart. A listener joining at
14:32:07 is told "track X, 41.2 seconds in", seeks there, and is in sync.

`server/lib/schedule.js` is the heart of the project. Changes there are the
highest-risk changes in the codebase. `tests/schedule.test.js` exists to make
those changes safe — never weaken it to make a change pass.

Corollaries that fall out of this and must be preserved:
- Restarting the server does not interrupt the programme.
- Two servers with the same library and epoch play identically. Horizontal scaling is free.
- `STATION_EPOCH` is load-bearing. Changing it re-deals history. Set once, never touch.
- Changing the library shifts the cycle. That is why `revision` exists and why the
  player re-joins when it changes.

---

## 4. Standing rules for anyone working here

1. **Read this file, then `docs/DECISIONS.md`, before writing code.**
2. **Run `bash scripts/build-test.sh` before and after every change.** It boots a
   real server against generated audio and drives a real browser. If it was green
   before your change and red after, your change is wrong — not the test.
3. **Never commit audio files.** The library lives outside the repo (`MUSIC_DIR`).
4. **The Pi is the constraint.** Assume a Pi Zero 2 W: 512MB RAM, slow USB I/O.
   No transcoding on request. No loading the library into memory twice. If a
   feature needs a build step or 500MB of `node_modules`, it is the wrong feature.
5. **No accounts, no tracking, no cookies.** A listener opens a URL and hears
   music. That is the entire contract with the user.
6. **Write down *why*.** Any non-obvious choice goes in `docs/DECISIONS.md` as a
   dated entry. Future agents inherit reasoning, not just code.
7. **Ask Ortis before**: changing `STATION_EPOCH` on a live station, adding a
   dependency heavier than ~2MB, adding anything that requires a listener account,
   or deleting files under `music/`.
8. **Small, verified steps.** One coherent improvement per run, fully tested,
   logged in `docs/WORKLOG.md`. A half-finished feature is worse than none.
9. **Never write "done" without re-reading the file.** On 2026-08-18, five
   separate `docs/DECISIONS.md` entries and `docs/ROADMAP.md` "Done" bullets
   — written the same day, in detail, with confident verification language —
   described code that had never actually been written or that a file-write
   had silently failed to save. A later run had to rediscover and re-fix all
   five. Describing an intended change is not the same as making one. Before
   writing *any* entry that claims code exists or behaves a certain way:
   - **Re-read the actual file after editing it**, not the diff you meant to
     apply. A rename-on-write can fail (a locked file, a permissions error)
     without the edit tool necessarily making that obvious to you.
   - **Name the exact command you ran to verify it**, and quote its real
     output — not "should pass" or "this now works," but `npm test` output,
     a `grep` result, a curl response actually seen this session.
   - If you cannot verify something (no hardware, no network, a tool
     missing), **say that plainly** instead of writing the claim anyway.
     "Not verified — needs a real Pi" is a legitimate, useful sentence.
     A confident false claim is not more useful for sounding more finished.

---

## 5. Where things are

```
Radio Tower/
├─ BRIEF.md              ← you are here; the standing guide
├─ CLAUDE.md             ← auto-loaded project instructions, points here
├─ server/               ← Express app
│  ├─ config.js            all env-tunable knobs
│  ├─ index.js             boot, static hosting, rescan loop
│  ├─ lib/schedule.js      THE STATION CLOCK — read this first
│  ├─ lib/library.js       scanning, metadata, path containment
│  ├─ lib/stream.js        HTTP range streaming
│  ├─ lib/listeners.js     anonymous listener counting
│  └─ routes/api.js        the HTTP surface
├─ public/               ← the player (no build step, edit and reload)
├─ pi/                   ← the maintained Pi installer — start here for a real device
│  ├─ README.md            blank-SD-card walkthrough, no prior Pi experience assumed
│  ├─ install.sh            the installer itself; run once over SSH
│  ├─ NETWORK.md, TROUBLESHOOTING.md, CHECKLIST.md
├─ scripts/
│  ├─ build-test.sh        the self-test the build agent runs
│  ├─ browser-smoke.mjs    real-browser checks
│  ├─ setup-pi.sh          thin wrapper around pi/install.sh, for a repo already on the Pi
│  ├─ setup-tunnel.sh      Cloudflare Tunnel, quick or named
│  ├─ scan.js              library report
│  └─ healthcheck.js       one-screen status
├─ deploy/               ← systemd unit, env template, tunnel config
├─ tests/                ← node:test suite
├─ docs/
│  ├─ ARCHITECTURE.md      how it works and why
│  ├─ DEPLOY.md            Pi + tunnel walkthrough
│  ├─ DECISIONS.md         dated decision log — append, never rewrite
│  ├─ ROADMAP.md           what to build next, ranked
│  └─ WORKLOG.md           what each agent run actually did
└─ .claude/              ← the embedded agents, skills and commands
```

---

## 6. The scheduled runs

Three tasks fire unattended on Ortis's machine, on different rhythms, each
starting a fresh session with no memory of any previous one — which is exactly
why this file, `docs/WORKLOG.md`, `docs/PLANNING.md`, `docs/ROADMAP.md` and
`docs/DECISIONS.md` exist. They are the only continuity the project has.

| When | Task | Agent discipline | Writes to |
|---|---|---|---|
| Daily, 10:05 | Build run | `tower-builder` | `WORKLOG.md`, code, tests |
| Sundays, 09:00 | Strategic review | `tower-planner` | `PLANNING.md`, `ROADMAP.md`, `.claude/` |
| Wednesdays, 18:00 | Audit | `tower-auditor` | `ROADMAP.md` (findings only) |

The loop that produces: the planner sets direction on Sunday, the builder works
through the ranked list daily, the auditor checks mid-week for what the builder's
own tests would not catch — and its findings land back in the roadmap for the
planner to rank the following Sunday.

**They communicate only through files.** No agent can see another's session.
`WORKLOG.md` is how the builder reports to the planner; `ROADMAP.md` is how the
planner instructs the builder; the auditor files into the same roadmap. An
undocumented change is a change the next agent will unknowingly undo.

What the daily build run does:

1. Preflight — the folder is there, Node answers, `node_modules/` exists.
2. Read `BRIEF.md` → `WORKLOG.md` → `ROADMAP.md` → `DECISIONS.md`, in that order.
3. Run `scripts/build-test.sh` for a baseline. If it is already red, fixing that
   regression is the entire run.
4. Take **one** unblocked roadmap item and implement it.
5. Prove it with a test that fails without the change, then a green self-test.
   A change that cannot be made green is reverted, not shipped.
6. Append to `WORKLOG.md` and update `ROADMAP.md`.

These runs work **directly on the real folder** at
`C:\Users\barri\Documents\Ortis\Radio Tower` — no staging, no upload, no
commit-back. Every edit is the real file.

They may change code and docs. They may not deploy to the Pi, and they skip
roadmap item #1 because they cannot reach the hardware. Nothing is ever deleted:
anything that should go moves to `_to_delete/` for Ortis to remove himself.

The planner additionally may provision the project's own tooling — new skills,
agents, commands, and `.claude/settings.json` changes — without asking, and logs
every such action in `docs/PLANNING.md`. It cannot install account-level plugins
or authorize connectors; those need Ortis, and it queues them under **Wants**.

**Therefore: keep the docs honest.** A future run's entire understanding of this
project comes from what the last one wrote down.

To disable or re-tune any of it, ask Claude to update the scheduled tasks —
`radio-tower--daily-build-run-local`, `radio-tower--weekly-planning-review`, or
`radio-tower--weekly-audit`.

---

## 7. What "done" looks like

The project is finished when Ortis can hand a stranger a URL, the stranger opens
it on a phone with no account and no app, and hears the same song Ortis is
hearing at that moment — served from a Raspberry Pi in his home.

Everything else is in service of that sentence.

> **Addendum, 2026-09-26 (Ortis's request, recorded — not a relitigation).**
> He asked for the station "on the world wide web", on GitHub, "all cloudy".
> The sentence above still describes the Pi edition, which keeps working. It
> now has a sibling: the same programme computed in each visitor's browser on
> a static site, so a stranger can hear the same song Ortis hears with no Pi
> switched on at all. §2 and §3 hold unchanged for both. See
> [`docs/CLOUD.md`](docs/CLOUD.md) and `docs/DECISIONS.md` 2026-09-26.
