# The library bot

Keeps the music folder in the shape of your Spotify playlists: one folder per
playlist, every song filed in the right one, and a checklist of what is still
missing. It never downloads anything — you bring the songs, it sorts them.

## Every day

Double-click **`watch.cmd`** (in this folder). It opens the checklist in your
browser and starts watching. Then get songs however you get them: anything
that lands in your **Downloads** folder or in **`music\_inbox`** and matches
a playlist is renamed `Artist - Title.mp3` and moved into that playlist's
folder within a few seconds. The checklist refreshes itself.

Close the window to stop.

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
  playlists.json       the bot's memory (which file is which song)
  channels.json        optional — which channels the radio offers
```

You can also drop a song straight into a playlist folder by hand: the bot
recognises it on its next run. Folders starting with `_` are never played on
the radio.

A song that is in several playlists is stored **once**, in the first
playlist's folder; `playlists.json` remembers the others, and the radio plays
it on each of those channels.

## Commands

Run these in **Windows PowerShell**, from the `Radio Tower` folder:

```powershell
node library\bot.mjs status              # every playlist: have / total
node library\bot.mjs read                # re-read the playlists from Spotify
node library\bot.mjs add https://open.spotify.com/playlist/…   # follow a new one
node library\bot.mjs sort                # file what is waiting, once
node library\bot.mjs watch               # …and keep doing it
node library\bot.mjs import full.json    # a full playlist list (see below)
node library\bot.mjs publish https://YOUR-TOWER --key YOUR-KEY   # send new songs to the cloud tower
```

Add `--dry-run` to any of them to see what would happen without changing anything.

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
node library\bot.mjs publish https://YOUR-TOWER --key YOUR-KEY
```

It sends only what the tower does not have yet.
