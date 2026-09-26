# The USB cleanup

**Status: prepared, not run. The stick was not plugged in when this was
written.** Everything below is derived from what the logs already record about
the stick, so check the numbers against reality before trusting them.

The kit is in [`usb/`](../../usb/).

---

## What is on the stick, per the logs

| Path | Files | What it is |
|---|---|---|
| `E:\Music` | 42 | a scrape of a laptop music folder |
| `E:\Behold the backkup\Musiques` + `...\Arthur's\Arthur s music` | 471 | a backup that **lives on this stick** |
| `E:\radiotower-update-2026-08-19.zip` | — | the code bundle for the Pi |

~515 MP3s. **None of it is the station's library.** The library is the curated
tree on this laptop — 30 files, 12.5 hours, in `Radio Tower\music`.

## Why this is not just untidiness

`pi/install.sh` step 5 scans `/media/*/*` and `/mnt/*` for audio, **recursively**,
and repoints `MUSIC_DIR` at the first mount where it finds any:

```bash
for M in /media/*/* /mnt/*; do
  C=$(count_audio "$M")          # find -type f -iname '*.mp3' ... | wc -l
  if [[ "$C" -gt 0 ]]; then MUSIC_DIR="$M"; FOUND=$C; break; fi
done
```

Setting `MUSIC_DIR` explicitly does not save you — `MUSIC_DIR="${MUSIC_DIR:-/mnt/music}"`
sets a default and the scan overwrites it. So plugging this stick in during an
install silently makes those 515 backup files the radio station. That is very
likely the real story behind "the music is not the right files."

The workaround the runbook uses today is to mount the stick outside `/mnt` and
`/media`. That works and it is fragile — it depends on remembering.

**The durable fix is to make the stick's only audio the correct audio.** Then
auto-detection stops being a hazard and becomes the behaviour you want.

## The plan

1. **Inventory.** A CSV manifest of every audio file on the stick, written to
   `usb/manifests/`, every run, apply or not. Losing track of what was on a
   stick is the expensive mistake; a 200KB CSV is not.
2. **Archive before anything is removed.** `Behold the backkup` is a backup
   that lives *on the stick* — there may be no second copy anywhere. It gets
   copied to a folder on another drive and the file count verified before a
   single delete happens.
3. **Mirror the curated library** to `E:\RadioTowerMusic\`.
4. **Purge the stray audio** — only after step 2 has run *and* verified in the
   same invocation. The script refuses otherwise.

## Running it

Dry run first. It writes nothing.

```powershell
cd "C:\Users\barri\Documents\Ortis\Radio Tower\usb"
.\rebuild-usb.ps1
```

Then, once the report looks right:

```powershell
.\rebuild-usb.ps1 -Archive D:\RadioTowerArchive -Apply          # copy, no deletes
.\rebuild-usb.ps1 -Archive D:\RadioTowerArchive -Apply -Purge   # and remove the strays
```

`-Drive` if the letter has moved (check first — letters move). `-Source` if the
library is somewhere other than `..\music`.

Guards built in, because this script deletes things:

- Dry run by default.
- Refuses any drive Windows does not report as `Removable`.
- Refuses an `-Archive` path on the stick itself.
- Refuses `-Purge` unless an archive completed and verified **this run**.
- Deletes only audio files; folders and non-audio are left alone.

## Then check the Pi actually changed

```bash
grep MUSIC_DIR /etc/radio-tower.env
curl -s localhost:8080/api/health | grep musicDir
```

and from the laptop:

```bash
cd dj && node dj.mjs doctor
```

`doctor` compares the folder the booth reads against the folder the *station*
reads and says so in one line. That is the check worth having a habit about.

## For Claude Code, when the stick is in

```text
The Radio Tower USB stick is plugged in. Clean it up using usb/rebuild-usb.ps1.
Read usb/README.md and docs/guides/USB-CLEANUP.md first.

1. Confirm the drive letter yourself (Get-Volume). Do not assume E:. If more
   than one removable drive is present, stop and ask me which.
2. Run `.\rebuild-usb.ps1` with no flags. Show me the whole report and the
   manifest path. Compare its numbers against what USB-CLEANUP.md says was
   there (42 + 471) and tell me about any difference rather than proceeding.
3. Tell me how much free space the archive target needs and check it has it.
   Stop if it doesn't.
4. Run with -Archive <path> -Apply. Do NOT pass -Purge on this run. Confirm the
   archived count matches the stray count.
5. Only if that verified, ask me before running again with -Purge.
6. Re-run with no flags and show me that the only audio left is
   E:\RadioTowerMusic and that it matches the 30-file curated library.

"Behold the backkup" is a backup that exists only on this stick. If anything
about the archive step looks off — a count mismatch, a permissions error, a
path with characters robocopy mangles — stop and tell me. An undeleted mess is
recoverable; a deleted backup is not.
```

## What is deliberately *not* here

- **No reformat.** The stick is also the courier for code updates.
- **No touching `music/` on the laptop.** `BRIEF.md` rule 7 — deleting under
  `music/` needs Ortis, and the laptop tree is the source of truth this whole
  plan copies *from*.
- **No change to `pi/install.sh`.** Fixing the music scan is roadmap #25 and
  belongs to `tower-builder` with the self-test around it. This cleanup makes
  the bug harmless; it does not pretend to fix it.
