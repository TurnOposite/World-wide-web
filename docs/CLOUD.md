# Radio Tower in the cloud — the plan, and where it stands

Started 2026-09-26 from Ortis's request, verbatim:

> modernize this to the github like and on world wide web build the modern
> website with map, portfolio and working radio with an actually functionning
> queue change and visuals control. code it in the cloud i guess, the projects
> this draws on were all made locally so u might need to get the instruvtion and
> send them to the cloud […] break down the tasks […] make it all cloudyyy

He was on a plane until Sunday night (2026-09-27), so this was built
unattended in scheduled shifts. Every assumption below is stated because he
could not be asked.

---

## 1. What "the cloud" means here — the one-paragraph version

The station never needed the Pi to *decide* anything: the programme is a pure
function of wall-clock time (`BRIEF.md` §3). `server/lib/schedule.js` imports
nothing, so the exact same `Station` class runs in a browser. A static website
can therefore **be** the station: every visitor's browser computes the same
track at the same second from the same library file and the same epoch. The
only shared, mutable thing a radio needs on top of that is *"the DJ moved
something"* — a few hundred bytes of JSON (`site/station/control.json`) that
lives in the GitHub repository and is rewritten by the DJ booth through the
GitHub API. No server, no database, no Pi required. The Pi stays a supported
origin for the day Ortis wants his whole library (see §6).

```
 GitHub repo ──(Actions: test, assemble, deploy)──▶ GitHub Pages (static site)
     ▲                                                   │
     │ PUT contents/site/station/control.json            │ every visitor's browser:
     │ (DJ booth, fine-grained token in DJ's browser)    │   Station.at(now) ← library.json + control.json
     │                                                   │   <audio crossorigin> ← track URLs (Wix CDN today)
  the DJ ◀───────────────────────────────────────────────┘   visualiser, map, portfolio, writing
```

## 2. The site

One single-page app, plain ES modules, **no bundler** (the project rule stands:
`scripts/site-build.mjs` only *copies* files and writes JSON). Client-side
routing so the audio never stops when you change page — the one thing the Wix
free plan could not do (`Web-Creative/sites/globe-trotter/RADIO-TOWER-COMPAT.md`
§3).

| Route | What | Source of the design |
|---|---|---|
| `/` Seuil | The threshold: what is on air, the map, the writing — one look | mock `14_Maquette_Hub` layout A |
| `/radio` | The station: on-air card, echoes (up next / just played / guide), the **full-page visualiser**, the **Visuals** panel, the **queue** | mock `16_Page_Radio-Tower` + `10_Demo_…visualiseur-plein-page` |
| `/atlas` | World map: places where things were made + the tower's broadcast origin; hover/tab for the dossier | mock `15_Page_Atlas` + `DESIGN-BRIEF.md` §2 (Zone) |
| `/ecrits` | The six Globe Trotter texts, verbatim; three are "scored" by a track in the rotation | `Web-Creative/sites/globe-trotter/content/` |
| `/portfolio` | Library (essays, thesis, map room), Photos, Crates — the three rooms of 2026-09-23 | `collections/collection.json` |
| `/booth` | The DJ booth: reorder, Spontaneous Emissions (moods), broadcast look | `dj/` + `public/queue.js` |

A persistent **mini-player** sits at the bottom of every route.

Identity follows `docs/DESIGN-BRIEF.md` (locked 2026-08-19): green mark (tower +
sideways arcs), `#34d399`, credit **Zoneko**, "Echoes" not "Guide".

## 3. The radio, precisely

- **Library** — `site/station/library.json`. The launch library is the 28
  tracks (1 h 39 min 51 s) **already hosted on Ortis's Wix media**
  (`static.wixstatic.com`, CORS-clean and range-capable, verified 2026-09-09).
  Same epoch (2026-01-01T00:00Z), same order, same durations as the Wix block
  (`Web-Creative/_Travail/13_…`), so the new site and that draft play the *same
  second*. Nothing was uploaded anywhere: those files are his, already public,
  and uploading other people's albums to new hosts is not an agent's call
  (`pages/radio.md` "Ce qui reste" §3 said the same).
- **Clock** — `server/lib/schedule.js`, copied verbatim into the site by the
  assemble step. One new constructor option, `shuffle` (default `true`, so the
  Pi is unchanged); the cloud channel uses `false` (deliberate album order).
- **Payloads** — `server/lib/payloads.js` builds `/api/station`, `/api/queue`,
  `/api/schedule` bodies. The Express router *and* the browser engine call it,
  so the two cannot drift apart. Tests compare them.
- **Queue change** — permutation of upcoming slots, exactly the Pi's rule
  (`schedule.js` "Reordering what's next"): it keeps `cycleSeconds` constant,
  so nothing outside the window moves and nobody desyncs. The DJ can move any
  of the next *N* slots (default 12) that start more than **3 minutes** from
  now (the Pi uses 60 s; the cloud needs time for the change to reach every
  browser).
- **Propagation** — listeners poll `control.json` through the GitHub REST API
  with `If-None-Match` (a 304 does not count against the rate limit), falling
  back to the copy on Pages. Worst case ≈ 60–90 s.
- **Auth** — the booth writes with a fine-grained GitHub token (this one repo,
  *Contents: read & write*), kept only in the DJ's own browser
  (`localStorage`), sent only to `api.github.com`. Without it the booth is
  read-only. This is the standard static-CMS pattern.
- **Visuals control** — every listener has a Visuals panel (look, layers,
  intensity, hue, motion, full-screen), remembered per browser. The DJ can also
  set a **broadcast look** in `control.json`; listeners follow it unless they
  have chosen their own.
- **What a static site cannot do, said plainly** — a live listener count (no
  server to count; the Wix version dropped it for the same reason — shown only
  in tower mode), and the Zone's blue listener point (needs server-side geo-IP;
  `DESIGN-BRIEF.md` forbids guessing).

## 4. Bandwidth — the number to watch

Wix's free plan gives **1 GB/month** of bandwidth. At ~160 kbit/s that is
roughly **14 hours of listening per month, all visitors combined**. Fine for a
preview; not for a public station. The library format already allows several
`sources` per track, tried in order, so moving audio later is a data change,
not a code change. Cheapest next host: **Cloudflare R2** (10 GB free, no egress
fees) — `docs/GO-LIVE.md` has the steps; only Ortis can create that account.

## 5. GitHub

- `.github/workflows/ci.yml` — the test suite + the site's own tests on every push.
- `.github/workflows/pages.yml` — assemble `dist/` and deploy to GitHub Pages.
- Going live needs three things only Ortis can do: create the repo, push, and
  set *Settings → Pages → Source: GitHub Actions*. `docs/GO-LIVE.md` is the
  one page for that, with `scripts/publish-to-github.ps1` doing the push.

## 6. The Pi is not abandoned

`server/`, `public/`, `pi/` keep working and keep their 234 tests + 43 browser
checks. The new site also runs in **tower mode**: served by (or pointed at) a
Radio Tower server, it reads that server's `/api/*` instead of computing
locally — full library, listener count, Pi-side queue key. Same front end, two
back ends.

## 7. Phases (one per scheduled shift, roughly)

| # | Phase | State |
|---|---|---|
| 0 | Intake: project, Web-Creative mocks, music manifest pulled to the cloud; baseline green | done 2026-09-26 |
| 1 | Station core in the browser: `payloads.js`, `shuffle` option, cloud engine, `library.json`, `control.json`, tests | |
| 2 | Site shell: tokens, mark, router, persistent mini-player | |
| 3 | Radio page: on air, echoes, full-page visualiser (roadmap #28 done properly), Visuals panel | |
| 4 | Working queue: listener view, booth (drag/keys, moods, clear, broadcast look), GitHub control plane | |
| 5 | Atlas, Écrits, Portfolio | |
| 6 | GitHub-ready: workflows, README, secret scan, publish script, GO-LIVE | |
| 7 | Verification: e2e (two listeners same second, reorder reaches both, visuals), mobile, review | |
| 8 | Delivery: preview, write-back to the laptop folder, bundle, Project docs | |

The state column is updated by each shift; `docs/WORKLOG.md` has the detail.
