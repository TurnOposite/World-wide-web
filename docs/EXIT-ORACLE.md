# A ready exit from Oracle

Ortis, 2026-11-13: he doubts Oracle's future for the tower and wants a plan
to move off it if it fails or ends the free tier — free options first, files
managed from GitHub and Vercel. Written 2026-11-16. **A plan, not a build:**
nothing below is switched on, and the three pieces of work it names (P1–P3)
wait for his word. `docs/LIVE.md` (« If the server dies ») says what happens
the minute the server stops; this page is what to do next.

Prices and limits are from the providers' own pages, read on 2026-11-16
(links at the end). They move: check them again on the day.

## What the Oracle server does, and where each job would go

| Job today | Without Oracle | Free? |
|---|---|---|
| Serves the music files (51 GB, `/srv/radio/music`) | **Cloudflare R2** (object storage, no charge for traffic out), or **the Pi at home** | R2: first 10 GB free, then $0.015 per GB a month → the whole library ≈ **$0.62 a month**. The Pi: free |
| Deals the daily programme (one clock for everyone) | **Each browser computes it**, from a published index of the library — the site already does this for the 28 Wix tracks | Free |
| The telegraph line (chat, log, moderation, notifications) | **A Cloudflare Worker with one Durable Object** | Free plan, if the line stops polling (below) |
| The Booth's queue and moods | **`control.json` in the GitHub repository** — the cloud edition's way (a token instead of the key), already built | Free |
| Listener count | From the chat's Durable Object (who is connected), or dropped | Free |
| Receives new music from the laptop (`bot.mjs publish`) | The bot uploads to R2 instead | Free |
| A second address for the whole site | Gone; the Vercel address is the site | — |

So the whole station can run on **Vercel + GitHub + Cloudflare**, with no
server to keep alive, for **$0 with a library cut to 10 GB, or about $0.62 a
month with all of it**. Nothing in that set is reclaimed for being idle.

## The three levels of exit

### Level 0 — do nothing (already true)

The site waits 6 s for the tower, then plays the in-browser station: the 28
tracks on Wix, the same second for everyone, a plain loop. Echo, the Atlas,
the Archive, the Lights are untouched. The line says it runs through the
tower. Nothing is lost for good: the code is on GitHub, the music is on the
laptop (and should have a second copy — see « Before anything happens »).

**First thing to try on the day:** a *stopped* Always Free server is not
deleted. Oracle console → Compute → Instances → Start. If it starts, the
radio is back in two minutes and this page can wait.

### Level 1 — the radio back, without a server (P1 + P3, about two sessions)

1. **The music on R2.** A bucket, public through a Cloudflare address. The
   library bot learns a second destination (`publish --to r2`, the S3 API —
   `library/bot.mjs` already diffs « what is there » against « what is
   here »). Covers are written beside the tracks at publish, since nothing
   would be left to cut them out of the files on request
   (`/api/track/<id>/art` today).
2. **The index.** At publish the bot also writes `library.json` — every
   track's id, title, artist, album, folder, length, address — the file the
   in-browser station already reads for Wix (`site/station/library.json`),
   only longer (3,174 tracks ≈ 1 MB, gzipped ≈ 200 KB).
3. **The daily programme in the browser (P1).** `server/lib/programme.js`
   (`DailyStation`) is pure — the library, the rules, the clock — like
   `schedule.js`, which is already copied into the site by
   `scripts/site-sync.mjs`. Copy it too, give the in-browser engine
   `channels.json` (published beside the index), and every browser deals the
   same day the tower would. The 05:00 turn, favourites daily, the long mixes:
   all of it is in that one file. A test pins browser and server to the same
   programme for the same library, as `tests/cloud-station.test.js` does for
   the loop.
4. **The Booth** writes reorders to `control.json` on GitHub (built: the
   cloud edition; `docs/CLOUD.md`). The key becomes a GitHub token kept in
   his browser.

What the site loses at level 1: the line (until level 2), the live listener
count, the Booth's Line and Status sides, `npm run repeats` against a tower
(it would read the index and deal the days itself — small change).

### Level 2 — the line back (P2, several sessions)

A Worker in front of one Durable Object that *is* the room: it holds the
day's messages, the log (its own SQLite storage), the silenced tags, the
push subscriptions.

- **The free plan's wall is requests: 100,000 a day.** Today each open
  Antenna asks every 4 seconds — 21,600 requests a day for one tab left
  open; five listeners spend the whole allowance. So the line must move to
  **WebSockets**: opening one counts as a single request, and messages on it
  are not counted as requests. With the hibernation API the object sleeps
  between messages, so a quiet room costs nothing.
- The rules port as they are — plain text, no links, the budgets, the daily
  salt, the 05:00 turn, restore — `server/lib/telegraph.js` has no Node-only
  part but the file writes. `server/lib/webpush.js` uses ECDH, HKDF and
  AES-GCM, all in the Workers runtime's Web Crypto: notifications port too.
- Moderation and the log stay behind the station key, kept as a Worker
  secret.
- **Prototype only on his word** (handoff, 2026-11-16), behind a flag in
  `site/config.json`, with the tower's line still the one on air.

## The other ways to hold the music

| Where | Cost | For | Against |
|---|---|---|---|
| **Cloudflare R2, whole library** | ≈ $0.62 a month (41 GB over the free 10) | No traffic charge, no idle rule, same company as the chat | Not free; signing up for R2 asks for a payment method — confirm at sign-up |
| **Cloudflare R2, a 10 GB station** | $0 | Entirely free | A smaller radio: favourites, the loop, the albums he picks (10 GB is about 115 hours of music at 192 kbps) |
| **The Pi at home** | $0 | The whole library, his own machine; the kit is in `archive/pi-kit/` (installer, Cloudflare Tunnel, the go-anywhere Wi-Fi) and ran the station until 2026-10 | Depends on his home line and power, and on the Pi being plugged in wherever he lives; every listener's audio leaves through that line |
| **Another free server** | — | — | None found that gives 51 GB of disk and a radio's traffic for free; a small free VM elsewhere would hold the *station* but not the *music*. Not recommended as the plan |

Recommended: **R2 for the music, the browser for the programme, the Worker
for the line** — because none of the three can be « idle », and the bill is
either nothing or cents.

## Before anything happens (cheap, and worth doing now)

1. **A second copy of the music.** `Radio Tower\music\` on the laptop is the
   only copy besides the tower. A USB disk is enough. His to do.
2. **A copy of the tower's line.** `/srv/radio/cache/telegraph.jsonl*` and
   `telegraph-push.json` exist only on the tower. If the log matters to him,
   a monthly copy to the laptop (one `scp`, his key).
3. **Keep Oracle from calling the tower idle** — or decide Pay As You Go once
   the cost cap exists (BACKLOG U1, B1). Oracle reclaims an Always Free
   machine whose CPU (95th percentile), network *and*, on this shape, memory
   all stay under 20 % for 7 days. The tower sits at about 1 % of its memory.
4. **A Cloudflare account** (free) under his name, so level 1 does not start
   with a sign-up. Nothing to deploy yet.

## On the day, in order

1. Oracle console: is the server only stopped? Start it. Done.
2. Gone, or the free tier ended: the site is already on the Wix loop. Tell
   listeners nothing; it plays.
3. Level 1 (R2 + the browser's programme): the radio is his library again.
   If P1 and P3 were built beforehand, this is an afternoon — a bucket, one
   `publish --to r2` (51 GB at his upload speed is the long part: hours),
   and one line in `site/config.json`.
4. Level 2 when he wants the line back.
5. Or, at any point: a new server from `deploy/cloud/README.md` (an hour)
   and `bot.mjs publish` — if a free one exists then, or he chooses to pay
   for one.

## What needs his word

- Build P1 (the daily programme in the browser) and P3 (the bot's R2
  destination) **now**, so the exit is an afternoon and not a week? They
  change nothing on air: the tower stays the station.
- The whole library on R2 for ≈ $0.62 a month, or a 10 GB station for
  nothing?
- The Worker chat prototype (P2): yes, later, or never?

## Sources (read 2026-11-16)

- Oracle, Always Free resources — the idle rule: <https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm>
- Cloudflare Workers, pricing and limits (100,000 requests a day on Free): <https://developers.cloudflare.com/workers/platform/pricing/> · <https://developers.cloudflare.com/workers/platform/limits/>
- Cloudflare Durable Objects, pricing and limits (SQLite-backed objects on the Free plan; WebSockets and hibernation): <https://developers.cloudflare.com/durable-objects/platform/pricing/> · <https://developers.cloudflare.com/durable-objects/platform/limits/>
- Cloudflare R2, pricing (10 GB free, $0.015 per GB-month, no egress charge): <https://developers.cloudflare.com/r2/pricing/>
