# Picking Radio Tower back up

> **Since 2026-10-08 the radio runs in the cloud, not on the Pi** — the site on
> Vercel, the music on an Oracle server. Start with **[`LIVE.md`](./LIVE.md)**;
> this page is still right about the Pi.

Written 2026-08-28, the day the project went on hold. You are reading this
weeks or months later, probably in a different flat, on a router this Pi has
never seen. This page assumes you remember nothing.

**Read this one page. You do not need to re-read the other twelve.**

---

## What you have

A Raspberry Pi that serves a website playing music, where everyone who opens
it hears the same track at the same second, with no account and no app. It
worked. On 2026-08-19 it was live on your LAN with five real listeners on it.

The whole design rests on one idea: **there is no stream.** The server does not
push audio. It publishes a schedule derived from a fixed epoch and the library,
and every browser computes for itself what should be playing right now and
seeks its own `<audio>` element to that offset. That is why restarting the
server does not interrupt the programme, and why a listener who reconnects is
already in sync without doing anything.

Do not break that. `BRIEF.md` is the constitution and says so at more length.

---

## Getting it running again, in order

### 1. Does the code still work?

Before touching hardware. On your laptop, in this folder:

```
npm install
bash scripts/build-test.sh
```

As of 2026-08-28 that is **188 tests, fully green**, on Linux with `ffmpeg` and
`python3` present. On Windows without them, expect 3 environment failures in
the fixture-generation stages — those are the machine, not the code. If you
see failures beyond those, something rotted; start with `docs/WORKLOG.md`'s
last entry.

### 2. Get the Pi onto your new Wi-Fi

**This is the thing that was built specifically for the situation you are in.**
You do not need to SSH in, and you do not need a monitor.

Put the SD card in your laptop, open the FAT32 partition Windows calls
`bootfs`, copy `radiotower-wifi.txt.example` to `radiotower-wifi.txt`, and
edit it:

```
My New Router | thepassword
```

Card back in, power on, wait a minute, open `http://radiotower.local:8080`.

Full detail, including the "make the tower its own Wi-Fi hotspot so it works
with no router at all" option: **[`../pi/NEW-NETWORK.md`](../pi/NEW-NETWORK.md)**.

> If the Pi was installed **before 2026-08-28**, it does not have this yet —
> the boot-time script ships with `pi/install.sh` and that Pi predates it. In
> that case get on the Pi once by any means (Ethernet cable straight to your
> laptop is the easy one — `pi/NETWORK.md` Scenario B), re-run
> `sudo bash /opt/radio-tower/pi/install.sh`, and from then on the card-edit
> route works.

> **Added 2026-09-23 — even easier:** with the go-anywhere kit
> ([`../pi/anywhere/README.md`](../pi/anywhere/README.md)) you don't need to
> know the Wi-Fi in advance at all. If the tower finds no network it knows, it
> broadcasts **Radio Tower Setup**; join it from your phone and pick the
> router. Same one-time `install.sh` re-run applies to a Pi installed before
> that date.

### 3. Starting from a blank SD card instead

If the Pi is gone, or you would rather start clean:
**[`../pi/README.md`](../pi/README.md)** is the from-scratch walkthrough, and
`pi/install.sh` is the installer it drives. `pi/CHECKLIST.md` is the short
form. Copy `pi/wifi/radiotower-wifi.txt.example` onto the boot partition as
`radiotower-wifi.txt` while you are flashing and it will join your network on
first boot.

### 4. Updating a Pi that is already running

Different procedure, and the difference matters — there may be listeners on it.
**[`RUNBOOK-update-2026-08-19.md`](./RUNBOOK-update-2026-08-19.md)**.

---

## What is actually left to do

Ranked, honestly, from `docs/ROADMAP.md` and this run's own findings.

### The one that will annoy you first

**The full-page visualiser still is not built.** You asked for the visualiser
over the whole page. What shipped is a `Stage` preset that paints a diffuse
bloom wash — the methods that make the visualiser recognisable are still only
ever called against the small canvas around the album art. Two rounds of
tuning could not fix it because there is no geometry on the stage to reveal.

Why that happened, and the ready-to-paste prompt that fixes it, are in
**[`DESIGN-POSTMORTEM.md`](./DESIGN-POSTMORTEM.md)**. Read it before you write
another design prompt for this project — the failure was in how the brief was
written, and it will repeat otherwise.

### Real defects, in roadmap order

| # | What |
|---|---|
| 6 | `POST /api/rescan` is unauthenticated — anyone who can reach the station can make it rescan |
| 14 | No rate limiting anywhere on the public HTTP surface |
| 7 | The station does not degrade gracefully when the music drive disappears |
| 2 | The player has never been proven on a real phone — emulation cannot settle iOS Safari's audio unlock |
| 25 | `install.sh` has no rollback, and its music scan can adopt the wrong library off a mixed-content USB |

### Waiting on a decision from you, not on a build

- **Cloudflare's CDN terms** and whether they cover what this station does
  (`ROADMAP.md` → "Needs a ruling from Ortis").
- Whether `cover.png` may be used as a backdrop — it was dropped on a
  copyright judgement call you never actually made (`DECISIONS.md`, 2026-08-19).

### The thing that most improves how it sounds

Not code. `split/` cuts your hour-long mixes into tracks. A library of 30
files where several are full albums makes the schedule lumpy and the shuffle
meaningless. `docs/guides/STATE-OF-THE-STATION-2026-08-19.md` has the measured
version of "the music sucks".

---

## What changed on 2026-08-28 (this run)

- **Fixed: stale code served to listeners.** `public/` was cached for an hour,
  so returning listeners ran old JavaScript and two correct deploys looked
  like silent failures. Now `no-cache` on anything the browser executes,
  `/assets/` still cacheable. `tests/static-cache.test.js` pins it.
- **New: the Wi-Fi recovery path** described in step 2 above —
  `pi/wifi/`, `pi/NEW-NETWORK.md`, 12 tests in `tests/pi-wifi.test.js`.
- **Fixed: two intermittently-failing tests.** `pi/install.sh` now checks the
  SD card before it probes the internet — cheap local checks first — which
  makes those tests deterministic and also stops the installer sending you to
  fix your network when the real problem is an incomplete copy.
- **Tidied.** Three `PROMPT-*.md` files moved from the repo root into
  `docs/prompts/` with an index saying which have been run; the empty
  `_to_delete/` and two zero-byte write-test artifacts deleted.
- **Written:** `DESIGN-POSTMORTEM.md`, this file.

Full detail in `docs/WORKLOG.md` and `docs/DECISIONS.md`, both append-only.

---

## The five commands worth remembering

```bash
npm start                          # run the station on :8080
bash scripts/build-test.sh         # the self-test — green before and after every change
npm run scan -- --list             # what does the library look like to the tower?
npm run healthcheck                # one screen of status from a running station
cd dj && node dj.mjs status        # what is on air, and what can be moved
```

And on the Pi:

```bash
sudo radiotower-network --status   # what Wi-Fi config it read, and what is connected
sudo systemctl status radiotower   # is the station running?
journalctl -u radiotower -n 50     # why is it not?
```

---

## The rule that matters most

Run the self-test before and after every change. Green before and red after
means your change is wrong. **Do not weaken a test to make it pass.** That rule
is why this project could be left alone for a month and picked up with
confidence, and it is the single most valuable thing in the repo.
