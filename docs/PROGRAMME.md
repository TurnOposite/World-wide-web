# The programme — what plays on the 24/7 loop, and why

Ortis's rules, set on 2026-10-13, and how the tower applies them. The code is
`server/lib/programme.js`; the switch that turns it on is a `programme`
block in `channels.json` beside the music (`library/channels.programme.json`
is the copy in git). Without that block the tower plays its old single
shuffle.

## The rules

1. **A day starts at 05:00, Paris time.** It runs to 05:00 the next morning:
   24 hours, or 23 and 25 on the two nights a year the clocks change. The
   last track of the day is cut at 05:00 if it would run past it.
2. **Favourites play every day.** Every track in `For Radio` and
   `For The Waves`, every day, spread through the day so there is roughly
   one an hour. They are never bunched together.
3. **The loop comes round every two days.** These are the tracks that were on
   air before the albums (the 140, minus the favourites and the long mixes),
   plus any song later filed in a playlist folder. Each one plays once in
   every two-day pass: more often than the albums, not every day.
4. **Every album track plays, as many days as that takes.** The albums
   (`Crates/Bandcamp`, where the library bot opens Bandcamp zips) fill the rest
   of each day, mixed track by track: a track from one album, then from
   another, never two from the same album in a row. Each track plays once per
   pass. A pass is as many days as the albums need, 9 today.
5. **Long mixes are spaced out.** Anything 20 minutes or longer: **at most 4
   a day, never two in a row, at least 3 songs between them**, spread evenly
   through the day (around 07:30, 13:30, 19:30 and 01:30). They take turns, so
   each comes round every 5 or 6 days.
6. **Never the same artist twice in a row, as far as the music allows.**
   Collaborations count as each of their artists, so "undersaken & GORE"
   can follow neither undersaken nor GORE. A file with no artist tag gets
   one from its "Artist - Title" name. See *The undersaken arithmetic* below.
7. **Room to push songs up or down.** Two folders are already in the rules
   and empty: `More often` (every 3 days) and `Less often` (every 30 days).
   Drop a song in one and that's its pace from the next morning. More
   levels are one line each (*Changing the rules*).
8. **New music needs no listing.** New album zips go to `Crates/Bandcamp` and
   join the albums. New songs in a playlist folder join the loop. New
   favourites go in `For Radio` or `For The Waves`. Any of these starts
   playing the morning after it reaches the tower.

## What that gives, on the real library (simulated 2026-10-13, 28 days)

| | Tracks | Hours | How often | Per day | × an album track |
|---|---|---|---|---|---|
| Favourites | 24 | 1.9 | every day | 24 | ~9 |
| More often | 0 | – | every 3 days | – | ~3 |
| Loop | 106 | 8.0 | every 2 days | ~53 (4 h) | ~4½ |
| Albums | 1,615 | 122.7 | every ~9 days | ~185 | 1 |
| Less often | 0 | – | every 30 days | – | ~⅓ |
| Long mixes (≥ 20 min) | 21 | 19.7 | every 5–6 days | 4 | – |

The "×" column is the pass length of the albums divided by the lane's
`every`. The favourites are about 9× today. Adding albums makes a pass longer
(about one more day per 14 hours of music), and every × grows with it. The
`every` stays in days, so the favourites stay daily whatever the albums do.

In the 28 simulated days, every day ended exactly at 05:00, every album
track had played by day 9, every favourite played every day, and two tracks
of the same album never followed each other (0 of 7,540 pairs).

## The undersaken arithmetic

undersaken (with collaborations) is about **70% of everything that plays**:
about 1,225 of the 1,624 album tracks, half of the old loop, 16 of the 24
favourites. With 70%, "never the same artist twice in a row" is impossible
for him. There are only enough other tracks to separate him into runs of
three. So the rule works like this:

- **Every other artist is never back to back.** That happened 0 times in 28
  simulated days.
- **undersaken plays in runs of at most 3**, evenly spaced through the day.
  A run of 4 happened 13 times in 28 days, on days when the albums' share
  happened to be over three quarters undersaken, where 4 is the minimum.
- `Saken 天` and `saken` are the same person, but listeners don't know that,
  so the rules treat them as separate artists (Ortis, 2026-10-13). To change
  that, add them to `aliases` (below).

## Changing the rules

Everything is in the `programme` block of `channels.json` (beside the
music; `library/channels.programme.json` is the copy in git):

```json
"programme": {
  "timeZone": "Europe/Paris",
  "dayStarts": "05:00",
  "since": "2026-10-14",
  "lanes": [
    { "name": "Long mixes", "minMinutes": 20, "perDay": 4, "apart": 3 },
    { "name": "Favourites", "folders": ["For Radio", "For The Waves"], "every": 1 },
    { "name": "More often", "folders": ["More often"], "every": 3 },
    { "name": "Less often", "folders": ["Less often"], "every": 30 },
    { "name": "Albums", "folders": ["Crates/Bandcamp"], "fill": true },
    { "name": "Loop", "every": 2 }
  ],
  "aliases": {}
}
```

- A track goes in the **first lane it matches**, top to bottom, so a track of
  20 minutes or more is always a long mix, whatever its folder. `folders`
  matches the path inside the music folder (`"Crates/Bandcamp"` also covers
  everything under it). `crates` matches a Spotify playlist it belongs to.
  `minMinutes` / `maxMinutes` match its length. A lane with no filter takes
  everything left over.
- `"every": 1` means every day. `"every": 3` means once in every three-day
  pass. `"fill": true` means the time left over, track after track (only one
  lane can fill). `"perDay": 4, "apart": 3` means at most 4 a day, at least 3
  songs between (only one such lane).
- A new level: copy a lane line, give it a folder and an `every`. An "every
  5 days" lane for songs you want about twice as often as the albums is
  `{ "name": "Twice", "folders": ["Twice"], "every": 5 }`.
- `aliases`: `{ "Saken 天": "undersaken" }` would keep him apart from them
  too.
- Then `node library\bot.mjs publish`. The new rules take over at the next
  05:00. **Exceptions:** changing `timeZone` or `dayStarts`, or adding or
  removing the `programme` block itself, needs a restart of the tower
  (`sudo systemctl restart radio-tower`). Each of those moves the start of
  the day.
- A broken block never takes the station off air: unreadable parts fall back
  to the defaults above.

## How it stays a radio

The station's one idea holds (BRIEF.md §3). Every day is rebuilt from the
library, the rules and the date, identically on any machine, and nothing is
stored. Everyone hears the same second. The DJ booth still reorders what's
coming up, inside the day. A library change waits for the next 05:00, so
nobody's song changes under them.

Two honest limits, both in `docs/DECISIONS.md` (2026-10-14):

- **Adding albums re-deals the album pass in progress** from the next
  morning. Every track still comes round within two passes, but the count
  restarts.
- **A restart of the tower during a day when new music arrived** recomputes
  that day with the new music in it. Listeners then hear a jump to another
  track, once. The nightly update restarts the tower at ~05:20–06:20 Paris
  time, after the turnover, so in practice this needs a publish *and* a
  manual restart on the same day.

## Visuals from the cover

The visuals used to take one hue per *genre*. Nearly everything is "Barber
Beats", so nearly everything was violet. Now they take their colours from
the **album cover** of what's playing:

- The listener's browser already downloads the cover. It reads it at 48×48
  pixels (`public/cover-palette.js`), which gives a **main hue**, an
  **answering hue** (a small bright sun in a blue sky counts), how
  **colourful** it is, and how **light or dark**.
- The stage (`site/js/viz/stage.js`) eases to them like it eased to the
  genre hue. The ring keeps the main hue. The blooms, sparks and ribbons lean
  toward the answering one. A black-and-white sleeve gives a nearly grey
  stage, and a dark sleeve a darker one.
- No cover, or one the browser can't read, falls back to the genre colour
  as before.
- Every listener's browser reads the same image the same way, so everyone
  sees the same colours.
- Nothing runs on the tower: no image library, no new dependency.

Read on the 151 album sleeves (2026-10-13): 93 (62%) have a clear second
colour. 15 are black-and-white or nearly. The other 43 lean on one hue and
get a near neighbour as the second. Rendered on the real stage with four
covers from the tower: red sleeve → red-orange rings, pale blue → cyan,
green → green, black-and-white → near white.
