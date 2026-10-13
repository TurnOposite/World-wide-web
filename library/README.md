# The library bot

Keeps the music folder in the shape of your Spotify playlists: one folder per
playlist, every song filed in the right one, and a checklist of what is still
missing. It never downloads anything — you bring the songs, it sorts them.

## Every day

Double-click **`watch.cmd`** (in this folder). It opens the checklist in your
browser and starts watching. Then get songs however you get them: anything
that lands in your **Downloads** folder or in **`music\_inbox`** and matches
a playlist is renamed `Artist - Title.mp3` and moved into that playlist's
folder within a few seconds. An **album zip** (what Bandcamp sends) that
lands in Downloads while it watches is opened into
`music\Crates\Bandcamp\<album>\` — a copy; the zip stays. What was filed goes
up to the tower a minute later. The checklist refreshes itself.

Close the window to stop.

`watch.cmd` finds the music on its own: `MUSIC_DIR` if you set one, else
`..\music` next to this folder, else `..\..\Radio Tower\music` — where it
lives on the laptop since the code moved to `radio-tower-live` (9/10).

## The folder

```
music\
  _checklist.html      what each playlist has, and what is missing (open it)
  _inbox\              drop anything here — it gets sorted
  _unmatched\          dropped in _inbox but on no playlist: file it yourself,
                       or: node library\bot.mjs sort --to "Playlist name"
  _duplicates\         a second copy of a song you already have — bin them
  Gone fishing\        one folder per playlist…
  Haze\
  …
  BarberBeats\  Liminal Atmosphere\  …   your own crates: untouched
  Crates\Bandcamp\     one folder per album zip opened (the albums command)
  playlists.json       the bot's memory (which file is which song)
  _albums.json         which zip was opened into which folder (remove a line to reopen it)
  channels.json        optional — which channels the radio offers
```

You can also drop a song straight into a playlist folder by hand: the bot
recognises it on its next run. Folders starting with `_` are never played on
the radio.

A song that is in several playlists is stored **once**, in the first
playlist's folder; `playlists.json` remembers the others, and the radio plays
it on each of those channels.

## Commands

Run these in **Windows PowerShell**, from the `radio-tower-live` folder. Each
takes `--lib "..\Radio Tower\music"` (or set `MUSIC_DIR` once):

```powershell
node library\bot.mjs status              # every playlist: have / total
node library\bot.mjs read                # re-read the playlists from Spotify
node library\bot.mjs add https://open.spotify.com/playlist/…   # follow a new one
node library\bot.mjs sort                # file what is waiting, once
node library\bot.mjs albums              # open album zips in Downloads into Crates\Bandcamp
node library\bot.mjs watch               # …and keep doing it (--albums for zips too)
node library\bot.mjs import full.json    # a full playlist list (see below)
node library\bot.mjs publish             # send new songs to the cloud tower
```

Add `--dry-run` to any of them to see what would happen without changing anything.

`albums` options: `--since 2026-10-12` (only zips from that day on),
`--into "Crates/Bandcamp"` (where albums go), `--publish` (send them at once).
It turns down a zip with no audio (silently — not its business), a pack of
short sounds, and a second download of an album already there.

## Zips

Zips are opened by `zip.mjs` in this folder, with Node alone — not `tar`:
from Git Bash that is GNU tar, which cannot read a zip at all, and Windows'
own tar cannot open a zip named in Japanese — 81 of the 152 Bandcamp albums
of 12 October. Encrypted entries and unusual compression
are refused with a reason; a damaged download is caught by its CRC and leaves
nothing half-written.

## The 100-track limit

The bot reads playlists from Spotify's public embed pages: no login, no
developer account. Those pages show a playlist's **first 100 tracks**. The
checklist marks playlists that may be longer with `+?`.

To get the rest, either:

- sign in to Spotify in the Claude app's browser and ask Claude to "read my
  full playlists for the library bot" — it saves a `full.json` you import; or
- export them with Exportify (exportify.net, sign in with Spotify,
  *Export All*), unzip, and `node library\bot.mjs import` each CSV.

A later `read` never forgets tracks an import found.

## Not playing on the radio yet?

The radio plays what is on the tower. After filing songs, send them:

```powershell
node library\bot.mjs publish --lib "..\Radio Tower\music"
```

It sends only what the tower does not have yet. The address and key come
from `tower.json` — next to the bot, or in the `library` folder beside the
music (`Radio Tower\library\tower.json`); `publish <url> --key <key>` works too.
