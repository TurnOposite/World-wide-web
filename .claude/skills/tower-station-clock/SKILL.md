---
name: tower-station-clock
description: The synchronisation model behind Radio Tower — how every listener hears the same track at the same second without any stored playback state. Use before touching server/lib/schedule.js or public/app.js, when debugging drift or sync problems, when a listener reports being out of step, or when designing any feature that touches what plays when.
---

# The station clock

## The whole idea in one line

**The programme is a pure function of wall-clock time.**

Nothing stores what is playing. `Station.at(now)` computes it. Same library, same
epoch, same instant → same answer, on any machine, after any restart, in any
process. That single property is what makes this a radio station rather than a
music player, and it is why the sync works without websockets, without a message
bus, and without the server tracking a single listener.

## How it computes

```
elapsed     = now - STATION_EPOCH          (seconds)
cycleIndex  = floor(elapsed / cycleSeconds)
posInCycle  = elapsed mod cycleSeconds
```

A **cycle** is one pass through every track in the library exactly once.
`cycleSeconds` is the sum of all durations (plus any inter-track gap).

Cycle 0 plays in natural path-sorted order, so a fresh install sounds
intentional. Every later cycle is a deterministic Fisher–Yates shuffle seeded
from `cycleIndex * 2654435761` — a fixed constant, so cycle 47 always has the
same order, forever, on every machine.

Walking that cycle's order and accumulating durations lands on the track and the
offset inside it. O(n) per lookup, memoised per cycle. A 5,000-track library
resolves in well under a millisecond.

## What falls out of this

- **Restarting the server does not interrupt the programme.** It comes back
  exactly where the clock says it should be.
- **Two servers with the same library and epoch play identically.** Horizontal
  scaling is free and needs no coordination.
- **A listener joining at any moment gets the exact offset** and seeks there.
  That is the entire join protocol.
- **`STATION_EPOCH` is load-bearing.** Changing it re-deals all of history. Set
  it once before going live and never touch it again.
- **Changing the library changes `cycleSeconds`,** which shifts every future
  position. That is why `Station.revision` exists and why the player rejoins when
  it changes. Adding tracks to a live station causes one audible jump; that is
  accepted and documented.

## Invariants — do not break these

1. `at(now)` depends on nothing but `now`, `tracks`, `epoch`, and `gapSeconds`.
   No `Math.random()`, no `Date.now()` inside, no mutation, no memo that outlives
   a library change.
2. Every instant resolves to a track. No gaps, no `null` for a non-empty library —
   including exactly on a boundary and after the last track of a cycle.
3. `startsAt <= now <= endsAt` for whatever `at(now)` returns.
4. `seededShuffle` returns a permutation and never mutates its input.
5. Tracks with zero, negative, or `NaN` duration are filtered out before
   scheduling. One bad file must not stop the station.
6. Nothing that crosses the wire contains `relPath` or an absolute path. Use
   `publicTrack()`.

`tests/schedule.test.js` encodes all of these. If one fails after your change,
your change is wrong — not the test.

## The client side

The server tells the player: this track, this offset, this `startsAt`. The player
then has two problems the server cannot solve for it.

**Problem 1: the listener's clock may be wrong.** A phone can be tens of seconds
off. So `syncClock()` samples `/api/time` five times, keeps the sample with the
lowest round-trip (least network noise), and stores `skew = serverTime - clientMid`.
Everything afterwards uses `serverNow() = Date.now() + skew`. Without this, a
listener with a skewed clock joins at the wrong offset and stays there.

**Problem 2: buffering makes playback fall behind.** Every second, the player
compares `audio.currentTime` against where the tower says it should be. Under 2
seconds of drift, it leaves it alone — re-seeking constantly is worse than being
slightly off, because each seek is audible. Over 2 seconds, it hard-seeks back to
live. The `sync` meter in the header shows the current drift so a problem is
visible rather than mysterious.

Two more cases the player handles explicitly:

- **Track rollover.** When the computed position passes the end of the track, the
  player refetches `/api/station` and switches. It does not wait for the `ended`
  event, because a stalled buffer would make that fire late.
- **Backgrounded tab.** Phones throttle timers hard. On `visibilitychange` back
  to visible, the player refetches and rejoins rather than trusting its state.

## Things that look like sync bugs but are not

- **A listener hears a track 0.3s later than another.** That is network and
  buffer latency, and it is under tolerance. Chasing it with tighter seeks makes
  the experience worse.
- **Two tracks in a row from the same artist.** The shuffle is uniform per cycle,
  not artist-aware. If that matters it is a feature request (`docs/ROADMAP.md`),
  not a bug.
- **The same track appearing twice near a cycle boundary.** Last of cycle N and
  first of cycle N+1 are independently shuffled. Real, expected, and only fixable
  by constraining cycle seams.

## If you are about to add a feature

Ask first: **does this need stored playback state?** Requests, skips, per-listener
queues, "resume where I left off" — all of them break the pure-function property
and turn this into a different product. That does not make them bad ideas; it
makes them a decision for Ortis, documented in `docs/DECISIONS.md`, not something
to slip in.

The safe shape for most such features: keep the station clock untouched and layer
the new thing *beside* it — a second endpoint, a second mode — so the core
guarantee survives.
