# Architecture

## What this is

A Raspberry Pi serving a website where everyone hears the same music at the same
moment. No accounts, no apps, no login. Open a URL, press one button, you are
listening to whatever the tower is playing right now.

## The shape of it

```
   listener's browser                    Raspberry Pi
  ┌────────────────────┐             ┌──────────────────────────┐
  │ public/index.html  │             │  server/index.js         │
  │ public/app.js      │◄─── /api ──►│    Express, port 8080    │
  │  ├ clock sync      │             │                          │
  │  ├ join at offset  │             │  lib/schedule.js  ← clock│
  │  ├ drift correct   │             │  lib/library.js   ← scan │
  │  └ <audio> element │◄── audio ───│  lib/stream.js    ← range│
  └────────────────────┘   (206)     │  lib/listeners.js        │
            ▲                        └───────────┬──────────────┘
            │                                    │ reads
      cloudflared tunnel                    MUSIC_DIR/**.mp3
      (TLS, public URL)
```

Two runtime dependencies: `express` and `music-metadata`. No front-end build
step — `public/` is served exactly as written.

## The station clock

This is the load-bearing idea, and it deserves its own explanation:
`.claude/skills/tower-station-clock/SKILL.md`. In short:

**The programme is a pure function of wall-clock time.** No playback state is
stored. `Station.at(now)` divides `now - STATION_EPOCH` into cycles (one pass
through the whole library), finds the position in the current cycle, and walks
that cycle's deterministically-shuffled order accumulating durations until it
lands on a track and an offset.

Same library + same epoch + same instant → same answer, always, everywhere.

That single property gives us, for free:

- restart-safe playback (the server comes back where the clock says it is)
- identical output from any number of servers, with zero coordination
- a trivial join protocol: "track X, 41.2 seconds in" — seek there, done
- no websockets, no message bus, no per-listener state on the Pi

## Joining, and staying joined

The server tells the player *what* and *how far in*. The player handles the two
things the server cannot see:

1. **A wrong device clock.** `/api/time` is sampled five times; the sample with
   the lowest round-trip wins, giving `skew = serverTime - clientMid`. Everything
   after uses `Date.now() + skew`. A phone twenty seconds off still joins correctly.

2. **Buffering.** Every second the player compares `audio.currentTime` to the
   computed live position. Under 2s of drift it does nothing — constant re-seeking
   sounds worse than being slightly behind. Over 2s it hard-seeks back to live.
   The header shows the current drift so the state is visible, not mysterious.

Rollover is driven by the clock, not by the `ended` event: a stalled buffer would
fire `ended` late and leave the listener a track behind.

## The HTTP surface

| Endpoint | Purpose |
|---|---|
| `GET /api/station` | what is on air, the offset, what's next, listener count |
| `GET /api/time` | server clock, for skew measurement |
| `GET /api/health` | operational status — tracks, cycle, memory, uptime |
| `GET /api/library` | paginated, searchable track list |
| `GET /api/track/:id/stream` | the audio, with HTTP range support |
| `GET /api/track/:id/art` | embedded cover art, if the file has any |
| `POST /api/rescan` | pick up newly added files immediately |

Everything is `Access-Control-Allow-Origin: *` — someone embedding the tower in
their own page is a feature for a radio station.

## Library scanning

`scanLibrary()` walks `MUSIC_DIR`, reads duration and tags with `music-metadata`,
and caches results keyed on `(relPath, size, mtime)`. A rescan only pays the
metadata cost for files that actually changed, which matters when the library is
thousands of files on a USB 2.0 drive.

Files whose duration cannot be determined are skipped and reported rather than
crashing the scan — one corrupt MP3 must not take the station off air.

`resolveTrackPath()` is the only place a client-supplied value becomes a
filesystem path, so the containment check lives there and nowhere else. Track ids
are SHA-1 prefixes of the relative path: stable across restarts, and they reveal
nothing about the filesystem.

## Streaming

Plain HTTP range requests, not Icecast or HLS. The player *always* seeks — that
is how a listener joins mid-track — so 206 correctness is not optional; getting
`Content-Range` off by one breaks Safari specifically. `parseRange` handles
closed, open-ended, and suffix ranges, clamps overlong ends, and returns 416 for
genuinely unsatisfiable requests.

No transcoding. The Pi has no headroom for it, and the files are already in a
format browsers play.

## Why not Icecast/Liquidsoap

A real streaming server would give a single continuous stream and perfect sync
without any client-side arithmetic. It would also mean a second daemon to
install and keep alive, a transcode pipeline on a device with no CPU to spare,
no per-track metadata in the player without extra plumbing, and no ability to
show "up next" — because with a true stream there is no schedule to query, only a
now.

The clock approach gets sync within a couple of seconds using only static file
serving, which is the one thing a Pi is genuinely good at. If a future
requirement demands sample-accurate sync (a listening party across rooms),
Icecast becomes the right answer and this document should be revisited.

## Deliberate non-goals

- **No accounts.** Ever. The contract is: open a URL, hear music.
- **No requests, skips, or per-listener queues.** They require stored playback
  state, which breaks the pure-function property the whole design rests on.
- **No transcoding on request.** The Pi cannot afford it.
- **No front-end framework.** The player is ~350 lines of vanilla JS and stays
  editable by anyone who opens the file.
- **No Spotify.** Its embed gives logged-out visitors 30-second previews, which
  defeats the point. See `docs/DECISIONS.md`.
