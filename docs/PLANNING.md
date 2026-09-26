# Planning log

Where this project is heading, and whether that is still the right way.

Written by `tower-planner`. Append-only, newest at the top. Never rewrite an old
entry — a verdict that turned out wrong stays, with a newer entry explaining what
changed. The point of this file is that a future run can see how the thinking
moved, not just where it landed.

**How this differs from the other logs.** `DECISIONS.md` says why a specific
choice was made. `WORKLOG.md` says what a run did. This file asks the wider
question — *is the sum of all that still becoming the thing `BRIEF.md` §7
describes* — and `ROADMAP.md` is the ranked answer.

Shape:

```markdown
## YYYY-MM-DD — one-line verdict

**Heading the right way?** yes / yes-but / no — and the honest reason
**Where it stands:** distance to BRIEF §7, concretely
**Verified:** what was actually run or read, vs. taken on the worklog's word
**Researched:** what was checked externally, with links — or "no network this run"
**Roadmap changed:** what moved, what was added, what was dropped, and why
**Tooling changed:** every skill/agent/command/setting added or edited
**Wants:** ≤3 things needing Ortis, each with the one action he takes
**Biggest risk right now:** the thing most likely to make this project fail
```

---

## 2026-08-19 — The station is live for the first time, and the roadmap was still ranked for a station nobody could reach

**Heading the right way?** **Yes-but**, and today's "but" is sharper than last
week's: the architecture is still sound, but the newest finished feature
(#5's fix) is not safe to run unattended, and it is now running unattended, on
real hardware, for a real (if singular) listener. That is a materially
different risk profile than "the code is good but nobody's listening yet,"
which was last week's honest verdict.

**Where it stands:** §7 decomposed against what's actually true today, not a
week ago —
- *"no account, no app"* — still done, structurally.
- *"served from a Raspberry Pi in his home"* — **true**, for real, since
  2026-08-18: `install.sh` ran end to end on Ortis's actual Pi 4, verified from
  a second LAN machine and a real Chrome tab actually playing audio. This is
  the single biggest change since the last planning entry.
- *"hand a stranger a URL"* — **still not true, deliberately.** LAN-only by
  Ortis's own choice, not a technical blocker — he wants local stability proven
  first. Correct call, and this review does not second-guess it; see
  "Researched" below for why the wait is also buying time against a real risk.
- *"hears the same song Ortis is hearing"* — **was newly threatened, same day
  it started being true.** The fix for the library re-deal bug (#5) shipped
  2026-08-19 and was audited the same day: a revision-fingerprint collision can
  permanently desync the schedule from what's actually streamable, and even
  without a collision a renamed/removed track can 404 for the entirety of the
  cycle the fix is supposed to be protecting. `AUTO_RESCAN_MINUTES` (default
  30) fires this automatically, unattended. I re-derived both findings from
  the live code myself this run rather than taking the audit's word for it —
  see "Verified" below — and they hold up.
- *"on a phone"* — unchanged from last week: 0% proven, and the one
  agent-actionable piece (a mobile viewport/touch profile in
  `scripts/browser-smoke.mjs`) has now been skipped by every single run since
  it was flagged 2026-08-18, even though #0/#1 (the reason it kept losing,
  reasonably, at the time) are now done and no longer a competing priority.

**Verified:** Ran, myself, this run, against the real repo (no `node` on this
machine's `PATH` — downloaded a portable Node 22.14.0 into the session
scratchpad, same approach a prior builder run used, left no trace on the
machine outside the Claude temp directory):
- `node --test tests/*.test.js` → 84 tests, 68 pass, 0 fail, 16 skipped
  (`ffmpeg`-gated, none installed here) — matches every prior session's
  reported number exactly. The suite is real and green; it simply doesn't
  cover the three findings below yet.
- `npm audit --omit=dev` against the real, installed `node_modules` (84
  packages present, confirmed by listing) → 0 vulnerabilities.
- Read `server/lib/schedule.js` end to end and confirmed, myself, the exact
  mechanism `tower-auditor` flagged: lines 142–143 update `this.tracks`/
  `this.byId` unconditionally, above the line 150–151 early return that gates
  the entire era-staging mechanism on `this.revision === queuedRevision` — a
  coarse `"<count>:<roundedDuration>"` string that a same-count, same-duration
  file rename can collide on. Confirmed `Station.get(id)` (line 360) has no
  era gating at all. Confirmed `public/app.js`'s `<audio>` error handler
  (line 353) sets a status string and nothing else — no retry, no refetch.
  All three claims check out against the code as it stands today, not as
  described in a worklog entry.
- Confirmed `#3` (Media Session) genuinely unbuilt (`grep -n "mediaSession"
  public/app.js` → nothing) and `#2`'s mobile viewport profile genuinely
  unbuilt (`scripts/browser-smoke.mjs` still one desktop viewport, `page.click`
  not `page.tap`) — both re-derived from the files, not carried forward from
  the last audit's word.
- Confirmed `server/lib/stream.js` sets `Accept-Ranges: bytes` unconditionally
  (line 68) — the thing a comparable self-hosted media server (Jellyfin) is
  documented to have gotten wrong for iOS Safari. This project has it right;
  it has simply never been checked against a real Safari.
- Confirmed no rate limiting or flood protection exists anywhere in
  `server/index.js` or `server/routes/api.js` (grepped for `helmet`,
  `rate-limit`, checked `Listeners.seen`'s only cleanup path) — a new finding,
  not previously on the roadmap.
- Confirmed `music-metadata`'s disclosed CVE-2026-32256 (ASF parser infinite
  loop, fixed in 11.12.3) does not affect this project — installed/locked
  version is 11.14.0.

**Researched:** (network available this run)
- Cloudflare's CDN terms: re-checked, unchanged conclusion from 2026-08-18 —
  the "disproportionate percentage of audio files" clause still applies on its
  face; general search this run found the same shape of evidence as before
  (self-hosted media over `cloudflared`, e.g. Jellyfin, is common and not
  reported as enforced against at hobby scale). Reaffirmation, not new
  information — carried forward in `docs/ROADMAP.md`, not re-litigated.
  [Cloudflare Service-Specific Terms](https://www.cloudflare.com/service-specific-terms-application-services/)
- iOS Safari + HTTP range requests: confirmed the general hazard is real and
  current — Apple's media stack requires working range support, and
  `Accept-Ranges: none` (a real bug in another self-hosted media server) is
  documented to break iOS seeking outright. This project's own
  `Accept-Ranges: bytes` is correct on inspection but has never been checked
  against a real device — folded into #2's reasoning in `docs/ROADMAP.md`.
- Raspberry Pi Zero 2 W concurrency: no authoritative benchmark found for this
  specific workload (concurrent HTTP audio listeners), consistent with last
  week's finding — still has to be measured on-device, and the device actually
  deployed (a Pi 4, not a Zero 2 W) has meaningfully more headroom than the
  documented worst case, noted as a hygiene item in `docs/ROADMAP.md`.
- Express 4: no formal EOL date published yet; Technical Committee still
  recommends 5.x for new work. `music-metadata`: real disclosed CVE checked
  and confirmed not applicable to the version actually locked. Neither changes
  today's ranking.

**Roadmap changed:**
- **#5 reopened** — un-marked "done," moved back to the very top of "Next up,"
  with the full BLOCKING/HIGH/MEDIUM audit findings folded into its own entry
  (re-verified against the code myself, not just relayed) and concrete "Done
  when" criteria for a real fix. This is the single most consequential change
  this run.
- **New tiebreaker added**, stacked on the 2026-08-18 one: correctness of
  what's already live beats reach for more listeners, while the two compete.
  Full reasoning: `docs/DECISIONS.md` 2026-08-19.
- **New item #14** — no rate limiting or flood protection anywhere on the
  public HTTP surface, including an unbounded-under-flood `Listeners.seen`
  map. Ranked just below #6 (rescan auth), above the phone/lock-screen items.
- **#7 promoted** — "the drive disappearing" was ranked low on "hardware
  nobody has connected yet." That hardware is now connected and real
  (USB-attached music on the actual Pi). Promoted accordingly.
- **#2 rewritten**, not reordered — same rank, sharper language: the
  agent-actionable half (mobile viewport emulation) has been skipped every
  run since 2026-08-18 despite no longer competing with Pi work, and that is
  now called out explicitly rather than left to be rediscovered again.
- **Housekeeping:** #0, #0b, #1, #9 — all genuinely finished, re-verified this
  run — moved out of "Next up" into "Done," per the file's own stated
  convention, which had not been followed for these four despite them being
  complete. Nothing trimmed; full detail preserved at the new location.
- **Dropped:** nothing.

**Tooling changed:** none this run. Considered a `tower-security` skill for
the flood-protection / auth findings (#6, #14) but decided against it — this
is ordinary Express hardening, not project-specific knowledge that would
otherwise be re-derived by every run the way the station-clock or mobile-check
knowledge is. `engineering:code-review`/`engineering:debug` (already enabled
account-level plugins per `CLAUDE.md`) are the right tool for a builder run
implementing #14, not a new skill.

**Wants:** (each needs Ortis at a keyboard; nothing here can be done by an
agent)
1. **Rule on the Cloudflare CDN terms** (unchanged ask from 2026-08-18,
   repeated because it is still open and still blocks nothing but a decision):
   see `docs/ROADMAP.md` → "Needs a ruling from Ortis". Most likely answer is
   "accept the risk at hobby scale," but `BRIEF.md` §2 locks the choice and no
   agent may make it.
2. **When #5's reopened fix and #6/#14 (auth + flood protection) are done,
   this is a natural moment to reconsider the LAN-only deferral** — not a
   request to act now (that stays Ortis's call, per this run's own
   instructions not to touch `setup-tunnel.sh`), just a flag that the thing
   he said he was waiting for (local stability) is now measurably closer to
   true than it was, once the reopened #5 actually closes.
3. Unchanged from 2026-08-18, still true, still worth restating since it's
   never been acted on: **installing Playwright with a real browser in
   whatever environment runs the scheduled builds** would let the browser
   stage of `build-test.sh` actually run on those runs instead of being
   skipped by whichever environment a given scheduled run happens to land on
   (this run's own environment had neither `node` nor `ffmpeg` nor a browser
   pre-installed, confirming the 2026-08-19 builder run's own note that future
   runs "may land on either kind of environment interchangeably").

**Biggest risk right now:** **A silent, permanent desync between "what the
schedule says is playing" and "what can actually be streamed."** Concretely:
#5's reopened bug means the station can, under an ordinary action (a file
rename, or `AUTO_RESCAN_MINUTES` catching an ordinary reorganisation), start
promising a track id that 404s forever, with the client-side error handler
doing nothing but changing a status string. This is worse than last week's
"nobody has ever heard it" risk in one specific way: last week's risks were
all about *reach*, and every one of them fails loud (no phone test happened,
no tunnel is up — both are simply absent, not silently wrong). This one fails
quiet, on infrastructure already running unattended, for the one listener who
exists. Fix #5 for real before picking anything else on this list back up,
including the tempting, nearly-free #2 viewport-emulation work — a station
that can go silently, permanently wrong is not more ready for a phone,
regardless of how good the phone experience would otherwise be.

---

## 2026-08-18 — The server is healthy; the half of §7 that defines "done" is untested, and the roadmap had been ranking around it

**Heading the right way?** **Yes-but** — and the "but" is the point of this entry.

The architecture is sound and I found nothing that argues against it. What is
drifting is *attention*. `BRIEF.md` §7 describes a stranger, on a phone, over a
public URL, hearing a Pi. Of those four nouns, exactly one — the URL — is proven
to work, and only on localhost. The Pi has never been touched. No phone has ever
opened the player. The browser stage of the self-test has now been skipped in
three consecutive scheduled runs. Meanwhile the top of the roadmap held "persist
the listener peak" and "add a second channel": pleasant server-side features that
move that sentence exactly zero.

That is not anyone's fault — it is the natural gradient. Agents can verify
server-side work and cannot verify a phone, so server-side work is what gets
done, and what gets done is what gets ranked. Left alone, this project converges
on an extremely well-tested thing nobody has listened to. The re-ranking below
is the correction.

**Where it stands:** Decomposing §7 —
- *"no account, no app"* — **done**, and structurally so. No cookies, no auth, no
  storage anywhere in the request path.
- *"the same song at the same second"* — **proven in principle, unproven in the
  field.** The determinism property is genuinely well covered (2,857 sampled
  instants agree across two independent `Station` instances; re-verified today).
  Real end-to-end drift was measured once, 0.02s, on 2026-08-17, in headless
  desktop Chromium in a container. Never since.
- *"on a phone"* — **0% proven.** Not under-polished: untested. Nothing in the
  suite has ever emulated a mobile viewport, let alone iOS Safari, which is the
  one browser most likely to break a player that sets `currentTime` on every
  join.
- *"hand a stranger a URL"* — **unbuilt in practice.** `setup-tunnel.sh` exists
  and has never been executed.
- *"served from a Raspberry Pi in his home"* — **blocked on Ortis.** Every
  performance number on record is x86-container-with-four-fixture-tracks. The
  self-test's "86MB (fits a Pi Zero 2 W)" is not a measurement of the real thing.

So: the server half is in good shape and honestly documented. The listener half
is at zero, and three of its four gaps need Ortis, not an agent.

**Verified:** Ran, myself, this run —
- `bash scripts/build-test.sh --no-browser` → green, 6 stages, 55 tests, verdict
  "the tower is sound".
- `npm test` **six times**. It reports 56 tests, but between 55 and 56 *pass*:
  `tests/api.test.js`'s "two /api/station calls a second apart advance the
  offset" self-skips with `# SKIP too close to a track boundary`, and did so in
  1 of 5 consecutive runs. This explains the discrepancy between the worklog's
  "56 tests" and the self-test's "55 tests passed" — both were honest; the suite
  is a different size each run. Now roadmap #10.
- Confirmed the 2026-08-18 warm-up work is really in the code and really
  reachable (`server/index.js` listens before it scans; `routes/api.js` gates
  `warmingUp` on `lastScanAt === null`). The worklog did not overstate itself.
  Its own "Next" line — a test that *observes* the warm-up state end-to-end —
  is still outstanding; noted on the Done entry rather than re-opened.
- Confirmed the `isMain` boot fix and `tests/boot.test.js`.
- Confirmed **no `navigator.mediaSession` anywhere in `public/app.js`** — roadmap
  #3 is genuinely unbuilt, not half-done.
- `node -e "import('playwright')"` → **missing**. The browser stage cannot run
  here, and `build-test.sh` still prints "the tower is sound" without it. Now
  roadmap #4.
- `npm audit --omit=dev` → 0 vulnerabilities (express 4.22.2,
  music-metadata 11.14.0).
- **Measured the library-change re-deal.** Wrote a throwaway script against the
  real `server/lib/schedule.js`: 500 tracks, 229 days past the epoch, add one
  file → position in cycle moves 105,810s → 67,590s. **A 10.6-hour jump, live,
  for every listener**, and it scales with `cycleIndex`, so it grows the longer
  the station stays up. `AUTO_RESCAN_MINUTES=30` fires it automatically. This is
  now roadmap #5 and I regard it as the most substantive finding of the run.

Taken on the worklog's word: the 0.02s browser drift figure and the 13/13
browser checks from 2026-08-17 — I could not re-run them.

**Researched:** (network available this run)
- **Cloudflare's CDN terms still cover this exact use case.** The blanket §2.8
  "no non-HTML content" rule was retired in 2023, but it was *moved*, not
  removed. The Service-Specific Terms, last updated 02 June 2026, reserve the
  right to disable CDN access for serving "a disproportionate percentage of
  pictures, audio files, or other large files" without a Paid Service. This
  project is a disproportionate percentage of audio files by construction. The
  `Revisit if` clause written into `docs/DECISIONS.md` 2026-08-17 has therefore
  been met. **Escalated to Ortis, not acted on** — `BRIEF.md` §2 locks Cloudflare
  Tunnel, and enforcement risk at hobby scale is a judgement call, not a fact.
  Written up in `ROADMAP.md` under "Needs a ruling from Ortis".
  [Cloudflare Service-Specific Terms](https://www.cloudflare.com/service-specific-terms-application-services/)
- **Node.js 20 reached EOL on 30 April 2026.** `package.json` says `>=20`;
  `setup-pi.sh` only reinstalls Node when the existing major is `< 20`, so a Pi
  already carrying 20 would keep an unpatched runtime on a public box. Node 22 is
  Maintenance LTS to Apr 2027, Node 24 Active LTS to Apr 2028. Now roadmap #9.
  [Node.js EOL dates](https://www.herodevs.com/blog-posts/node-js-end-of-life-dates-you-should-be-aware-of)
- **Express 4:** no formal EOL published as of mid-2026, but the Technical
  Committee now recommends 5.x for production and expectation is that 4 sunsets
  when 6 ships. Not urgent — filed under unranked ideas.
  [Express support reference](https://www.herodevs.com/blog-posts/express-3-is-eol-express-4-is-next-the-2026-support-reference)
- **The clock design is mainstream, not exotic.** Independent synced-radio
  implementations compute position as `(now - epoch) % total_loop_duration` and
  re-sync clients periodically to correct drift — the same two moves this project
  makes. Nothing found argues for abandoning the approach; `docs/DECISIONS.md`
  2026-08-17 stands unchallenged.
  [online-radio-system](https://github.com/IAmMasterCraft/online-radio-system)
- **iOS Safari:** no *new* 2026 breakage surfaced, but the long-standing hazards
  are all live on this player's critical path — audio needs a user gesture (the
  "Tune in" button covers this), setting `currentTime` has a history of quirks
  (this player does it on every join), and backgrounded tabs get suspended.
  Emulation will not settle these; a physical device will. Roadmap #2.
  [MDN autoplay guide](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay)
- **Pi Zero 2 W:** nothing authoritative found on concurrent-listener limits for
  this workload — the honest answer is that it has to be measured (roadmap #1).
  Confirmed hardware facts only: quad-core A53, 512MB, 2.4GHz-only Wi-Fi, no
  Ethernet without a USB dongle. That last one is worth Ortis knowing before he
  plugs it in.

**Roadmap changed:** Rewritten and re-ranked, with an added tiebreaker stated in
the file: *among items of equal severity, the one that moves §7 closer wins.*
- **Added #2** "prove the player on a real phone" — the largest unproven surface,
  and the one §7 names. Split into an agent-actionable half (mobile emulation in
  `browser-smoke.mjs`) and an Ortis half (an actual phone).
- **#4 → #3** Media Session. Re-argued from "polish" to "possibly broken": on a
  locked phone, no Media Session may mean no audio at all.
- **Added #4** the self-test must stop certifying "the tower is sound" when it
  skipped the browser stage.
- **Added #5** the library-change re-deal, with the measured 10.6-hour figure and
  a suggested fix (apply library changes at the next cycle boundary).
- **Promoted #6** `POST /api/rescan` auth out of the unranked bin — it goes live
  the same hour the tunnel does, and it compounds with #5.
- **Added #9** Node floor 20 → 22. **Added #10** the self-skipping clock test.
- **#3 → #7** (drive disappears), **#2 → #11** (persist listener peak, demoted
  nine places), **#5 → #12** (second channel). All three are fine ideas that move
  §7 zero; #11's demotion is the single clearest expression of this review.
- **Added** a "Needs a ruling from Ortis" section for the Cloudflare terms, and
  a "Considered and dropped" section (seeded with Spotify) so future runs can see
  what was already rejected.
- **Dropped:** nothing.

**Tooling changed:**
- **Added** `.claude/skills/tower-mobile-check/SKILL.md` — how to verify the
  player on a phone: what emulation can and cannot prove, the iOS Safari hazards
  specific to a player that seeks on every join, and a physical-device checklist
  Ortis can run in four minutes. Written because roadmap #2 and #3 both need this
  knowledge and no existing skill carries it — `tower-selftest` covers the
  harness, `tower-deploy` covers the Pi, neither covers the listener's device.
- **No new agents.** Four is already the right number; a "mobile" agent would
  overlap `tower-builder` and make both worse.
- **No changes to `.claude/settings.json`.** Nothing this run needed a plugin or
  marketplace that is not already enabled.

**Wants:** (each needs Ortis at a keyboard; nothing here can be done by an agent)
1. **Install Playwright in whatever environment the scheduled runs use** —
   `npm i -D playwright && npx playwright install chromium`. Today the browser
   stage has been skipped three runs running while the self-test still reports
   "the tower is sound". This single action restores the project's most valuable
   test and unblocks the agent-actionable half of roadmap #2.
2. **Put the Pi on the bench and run `sudo bash scripts/setup-pi.sh`** — roadmap
   #1, and the blocker behind three other items. Note before starting: the Zero 2
   W has no Ethernet port and 2.4GHz-only Wi-Fi.
3. **Rule on the Cloudflare CDN terms** (see `ROADMAP.md` → "Needs a ruling from
   Ortis"). Most likely answer is "accept the risk at this scale" — but it should
   be a recorded decision rather than an assumption, because `BRIEF.md` §2 locks
   the choice and no agent may change it.

**Biggest risk right now:** **That the project reaches a state where every test
is green and nobody has ever heard it.** Concretely: the two things standing
between here and §7 — a Pi and a phone — are both things agents structurally
cannot touch, while the things agents *can* touch produce visible progress every
day. Three runs in, the code is genuinely good and the distance to "a stranger
hears music" has not measurably shrunk. The mitigation is not more agent work; it
is the two items in **Wants** above. Second-order risk, if the first is
addressed: roadmap #5 — a station that jumps ten hours through its own programme
every time its owner adds a song is a station that cannot be used the way it will
obviously be used.

---

## 2026-08-18 — File created; first planning run not yet held

`tower-planner` was added to `.claude/agents/` today, along with a weekly
scheduled run. No strategic review has been performed yet — the first one is
scheduled and will land here.

What a first run inherits, so it does not have to rediscover it:

- The project is one day old. `docs/WORKLOG.md` holds two entries: the initial
  build (2026-08-17) and a scheduled run (2026-08-18) that spent itself fixing a
  boot regression rather than advancing the roadmap.
- **Every performance number on record is unproven on real hardware.** Memory and
  latency were measured in an x86 cloud container. Roadmap item #1 exists to
  replace them and is blocked on Ortis having the Pi in hand. Treat any claim
  about Pi-fitness as provisional until then.
- The browser stage of the self-test has not run since the initial build —
  Playwright is not installed in the scheduled-run container. Headless-green is
  currently the real bar being cleared, which is less coverage than the docs
  imply at a glance.
- `_to_delete/` holds two items awaiting Ortis's judgement, not agent action.
