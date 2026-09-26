# What to tell Claude Code

Four things, in order. Each is a paste-ready block. Do #1 and #2 today; #3 when
you want the music actually fixed; #4 when the USB stick is plugged in.

---

## 0. The one thing to do by hand first

The station refuses every DJ command unless it was **started with a key**. Open
PowerShell in the project folder and leave this running:

```powershell
cd "C:\Users\barri\Documents\Ortis\Radio Tower"
$env:STATION_KEY=[guid]::NewGuid().ToString()
$env:STATION_KEY        # copy what this prints — the booth needs it
npm start
```

Leave that window open. Everything below happens in a *second* window.

**A `.env` file does nothing here.** `server/config.js` reads `process.env`
directly and the project has no `dotenv` dependency (two runtime deps, and a
third needs a line in `docs/DECISIONS.md`). The key has to be in the environment
of the shell that starts the server. Two ways to make it survive:

- **On this laptop:** put it in `.claude/settings.local.json` (gitignored) under
  `"env"`, alongside the `STATION_NAME` already in `.claude/settings.json`. Any
  Claude Code session that starts the server then has it.
- **On the Pi:** `/etc/radio-tower.env`. The systemd unit reads it
  (`EnvironmentFile=-/etc/radio-tower.env`), which is why it works there.

### If you've lost the key of a *running* station

You cannot read it back out — it only exists in that process's environment.
Restart the station with a key you choose. **That is safe**: the programme is a
pure function of wall-clock time, so a restart does not interrupt it. Listeners
reconnect to the same second of the same track. The only thing lost is an active
queue override, which you were about to replace anyway.

A `401 bad_key` means the server *does* have a key and yours isn't it. A `503
queue_editing_disabled` means it has none at all.

---

## 1. Check the work landed (main project session)

```powershell
cd "C:\Users\barri\Documents\Ortis\Radio Tower"
claude
```

Paste:

```text
A Cowork session built a DJ booth in dj/, a USB kit in usb/, three guides in
docs/guides/, and docs/README.md as the doc index. It also appended to
docs/DECISIONS.md and docs/WORKLOG.md. Verify all of that on this machine —
the sandbox it was built in could not run the full self-test.

1. `npm test` — expect 152 pass / 0 fail.
2. `bash scripts/build-test.sh` — the FULL run, browser stage included. The
   sandbox could only run it in two halves because of a command time cap; this
   is the first uninterrupted end-to-end run, so it is the one that counts. If
   it fails, that is the real result — report it, do not work around it.
3. `node --test dj/test.mjs` — expect 11 pass / 0 fail.
4. Read dj/CLAUDE.md and .claude/agents/tower-dj.md and tell me if the
   boundaries they claim match dj/.claude/settings.json.
5. Delete the empty _to_delete/ folder at the repo root. The sandbox could not.

Report what passed, what failed, and anything the worklog claims that you could
not confirm. Do not weaken a test to make it pass.
```

---

## 2. Run the DJ (its own session, its own folder)

```powershell
cd "C:\Users\barri\Documents\Ortis\Radio Tower\dj"
$env:STATION_URL="http://localhost:8080"     # or http://raspberrypi.local:8080
$env:STATION_KEY="<the key from step 0>"
claude
```

`dj/CLAUDE.md` loads automatically — that folder's session cannot write to
`server/`, `public/`, `scripts/`, `tests/`, `docs/` or `music/`.

Then just talk to it:

> this is too sleepy, put some game music on

Or use the slash command: `/emit night drive`

Or, without Claude Code at all:

```powershell
node dj.mjs status
node dj.mjs emit "liminal"
node dj.mjs clear
```

**When something is wrong on air**, paste this instead:

```text
The station is playing the wrong thing. You are the DJ — work in this folder and
change nothing outside it.

1. `node dj.mjs doctor`. Report every line. The one that matters most is whether
   the station's MUSIC_DIR is the same folder the booth reads; a mismatch is the
   usual cause of "these aren't the right files" and it is a Pi config fix, not
   something the booth can solve.
2. `node dj.mjs files --big`. Every file is one slot no matter how long it is.
   List the oversized ones with sizes. Do NOT move or delete any audio.
3. `node dj.mjs status`. What's on air, how many slots are movable.
4. If the library is fine and only the moment is wrong: run
   `node dj.mjs emit "<the mood I asked for>" --dry-run` first, read the plan to
   me, then send it. If zero slots matched, do NOT send it — show me the
   moods.json entry you would add instead.
5. Report in numbers: which cycle and slot the override landed on, how many
   matched, and confirm the track on air was untouched.

Before and after any edit to dj.mjs: `node --test test.mjs`.
```

---

## 3. Actually fix the music (main project session)

This is the one that matters. Eight files hold 71.8% of the day — the DJ cannot
fix that, and it needs your decisions.

```powershell
cd "C:\Users\barri\Documents\Ortis\Radio Tower"
claude
```

```text
Read docs/guides/STATE-OF-THE-STATION-2026-08-19.md, section 2. The library is
30 files / 12.48h and eight files hold 71.8% of the air, because the station
shuffles slots and not minutes.

Do these three, in this order, and STOP before anything that deletes or moves
audio — BRIEF.md rule 7 says that is my call, not yours.

1. Re-measure. Run the scan yourself and print, per file: length, and share of
   total air. Tell me if the numbers in that doc still hold.
2. Propose the split. For each file over 40 minutes, tell me what you would do
   with it — split into tracks, or move it to a "Long Mixes" folder OUTSIDE
   MUSIC_DIR — and what the genre balance and cycle length become afterwards.
   Show me the before/after table. Do not touch a single file yet.
3. Fix the two unsorted tracks: music/ㅤㅤㅤ.mp3 (Hangul filler filename) and the
   Air track. Either propose a rename for me to approve, or add rules to
   server/lib/genre.js — the rules change is yours to make, with `npm test`
   before and after.

Then, only if I say go: make the moves, `npm run scan`, and re-run
`node dj.mjs library` so we can see the new balance.
```

---

## 4. When the USB stick is plugged in

```text
The Radio Tower USB stick is plugged in. Clean it up using usb/rebuild-usb.ps1.
Read usb/README.md and docs/guides/USB-CLEANUP.md first.

1. Confirm the drive letter yourself (Get-Volume). Do not assume E:. If more
   than one removable drive is present, stop and ask me which.
2. Run `.\rebuild-usb.ps1` with no flags. Show me the whole report and the
   manifest path. Compare the counts against what USB-CLEANUP.md says was there
   (42 + 471) and tell me about any difference rather than proceeding.
3. Tell me how much free space the archive target needs, and check it has it.
   Stop if it doesn't.
4. Run with -Archive <path> -Apply. Do NOT pass -Purge on this run. Confirm the
   archived count matches the stray count.
5. Only if that verified, ask me before running again with -Purge.
6. Re-run with no flags and show me the only audio left is E:\RadioTowerMusic
   and that it matches the 30-file curated library.

"Behold the backkup" is a backup that exists only on this stick. If anything
about the archive step looks off — a count mismatch, a permissions error, a path
robocopy mangles — stop and tell me. An undeleted mess is recoverable; a deleted
backup is not.
```

---

## Cheat sheet

| I want to | Where | What |
|---|---|---|
| change what's playing | `dj/` | `node dj.mjs emit "<mood>"` |
| undo that | `dj/` | `node dj.mjs clear` |
| know why it's wrong | `dj/` | `node dj.mjs doctor` |
| change the station itself | repo root | `/tower-work`, or the `tower-builder` agent |
| know where the project stands | repo root | `/tower-status` |
| find the right doc | anywhere | `docs/README.md` |
