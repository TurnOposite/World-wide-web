# The Atelier — the site's map as data, its past, its short links, and `fire`

Asked by Ortis on 2026-10-26: *« build site design instant change with model to move
around page layout of all current and past globe trotter pages, with a referral easy
link system to refer to the other and seamless integration of the menus and interfaces
between them — have an online/offline toggle for the old ones and have a fire procedure
to connect to oracle and github to publish immediately ».*

It is built on the world (`WORLD.md`): every page is a window on one plane, so « the
page layout » is where those windows stand. Four parts, one file between them.

| | What | Where |
|---|---|---|
| **The map** | where every window and every tag stands — today's pages and the past's — in one JSON file | `site/data/layout.json` |
| **The Atelier** | the map's editor, in the site itself: drag, resize, tilt, switch the past on and off, see it at once | `?atelier=1` on any address |
| **The past** | the old versions of the site, frozen, each a window on the map and a site of its own under one shared bar | `past/<id>/`, `/versions/<id>`, `/past/<id>/` |
| **Short links** | one stable name per page, old or new: `go/Z-04`, `go/v1/atlas`, `gt:` in a link | `site/js/refs.js` |
| **`fire`** | publish now: GitHub, then Vercel, then the Oracle tower — without waiting for the night | `fire.cmd`, `scripts/fire.mjs` |

## Change the layout

**In the browser.** `npm run site`, open <http://localhost:8090/?atelier=1>. The Atelier's
panel lists every page by its code. **Vue d'ensemble** shows the whole map: drag a window
to move it, its gold corner to resize it (10 px grid; hold **Alt** for none), arrow keys
to nudge the one in focus (**Shift**: 100 px). The panel's fields place it to the pixel,
tilt it, and move its tag in the menu. **En ligne / Hors ligne** switches a version of the
past. Every change shows at once — it is the real site being moved, pages and all — and
anything that would break it is listed in red (two windows on top of each other, two
phone frames that would cover each other, a window off the world). ↶ / ↷ undo and redo.

What you change is a **draft in this browser**: nobody else sees it. Then:

- **Enregistrer dans le dépôt** — only on `npm run site` on this machine: writes
  `site/data/layout.json`. A map with an error is refused.
- **Télécharger layout.json** — anywhere, the live site included: put the file in
  `site/data/` of the repository yourself.
- **Revenir au publié** throws the draft away.

`?atelier=0` leaves the Atelier (it is remembered for the tab, like `?classic=1`).

**From a terminal** — the same edits, one line each, for you or for an agent:

```powershell
npm run layout                          # the map: code, page, place, size, tilt, online
npm run layout -- swap atlas zone       # two windows trade places
npm run layout -- move Z-04 1200 900    # x, y in world pixels (the world is 5200 wide; Zone left of 2600)
npm run layout -- nudge atlas +100 -50
npm run layout -- size atlas 700 720
npm run layout -- tilt atlas 2
npm run layout -- tag atlas 8 44 5      # % from its side, % from the top, tilt
npm run layout -- offline v1            # or online
npm run layout -- check
```

A command that would leave the map broken is refused and writes nothing.

## The past

Two versions are frozen today, both from the archive tags of 20 October:

| Code | Id | What | Source |
|---|---|---|---|
| P-01 | `v1` | the site as it was live from 8 to 20 October (the Seuil, Radio, Echoes, Atlas, Écrits, Portfolio) | tag `site-v1-2026-10-20` |
| P-02 | `v2` | the Zone/Echo site of 20 October (Ondes, Playlists, the Gazette) | tag `site-v2-echo-2026-10-20` |
| P-03 | `wix` | the first Globe Trotter on Wix — another site, opened in a new tab; **offline** until you say | `arthurbarrier.wixsite.com/globe-trotter` |

They stand in a band under both halves of the world (« Archives · les versions passées du
site »). Each has a tag in the menu and a window, `/versions/<id>`, where the old site runs
**framed and silent** — the world's mini-player stays the one radio (`site/past/bar.js`
refuses the old page's `<audio>` the right to play, which every old player already reads
as « autoplay blocked »). « Ouvrir en plein écran » opens the old site on its own at
`/past/<id>/`, under **the bar**: today's pages, the other versions — on the same page when
they had it — and « Cette page aujourd'hui » (v1's *Écrits* is today's *Lectures*). The bar
is today's code reading today's map, so an old page gets today's menu without a line of it
being edited.

An old page plays **today's** programme and talks to **today's** tower: the build gives it
today's `station/` and today's tower in its `config.json`. The heavy files every version
shares (the portfolio, the press: 33 MB) are not copied: the build points the old page's
data at today's copy (in tower mode the tower already names them from the site's root).

**Offline** means not built: no window, no tag, no `/past/<id>/`; a short link to it says
« … est hors ligne ». Switch it in the Atelier or with `npm run layout -- online v1`, then
`fire`.

**Freeze another version** (a commit, a branch, a tag):

```powershell
npm run past -- snapshot v3 <git-ref>
```

It writes `past/v3/` (that commit's `site/`, less the station and what is byte for byte
today's) and refuses to overwrite a snapshot — a version of the past is never retaken.
Then give it a window: an entry in `layout.json` with `"era": "past"` (copy v2's line,
change `id`, `code` → P-04, `title`, `source`, `routes`, and its place).

## Short links

Every page has a code — `Z-01`…`Z-07` (Zone), `E-01`…`E-04` (Echo), `P-01`… (the past) — and
an id (`atlas`, `v1`). Any of them, any case:

| Link | Leads to |
|---|---|
| `go/Z-04`, `go/atlas` | the Atlas, wherever its window is |
| `go/E-02/<slug>` | an Echo article · `go/E-03/<slug>` a text in Lectures · `go/Z-05/photos` a Portfolio room |
| `go/P-01`, `go/v1` | Version 1 in its window |
| `go/v1/atlas` | the v1 site's own Atlas, full screen |

`go/…` is the form to share: every one answers 200 on a cold load (the build writes a shell
for each) and is resolved when it is followed, against that day's map — so a link given
out before a version went offline says so instead of a blank « not found ». Each window's
door carries its own (« ⧉ go/Z-04 » copies it).

Inside the site, write a link as a ref and it gets today's address as it enters the page:
`<a href="gt:Z-04">` in a page; `[l'Atlas](gt:Z-04)` in an Echo article (articles take
`[text](https://…)` and `[text](atlas)` too, since this change — they had no links before).

## fire — publish now

Double-click **`fire.cmd`** in the `radio-tower-live` folder (or `node scripts/fire.mjs`).

1. **The map** is checked; if you changed it, it will be committed with the publish — the
   only file fire ever commits. Any other uncommitted work is listed and left out.
2. **GitHub**: fetched. Its `main` must be behind this commit — if someone pushed from
   elsewhere, fire stops and says `git pull --ff-only`. Nothing is ever forced.
3. **The unit tests** (`npm test`).
4. **What goes live**, and the question: **type `FIRE`**. Anything else stops, and nothing
   has been committed or sent.
5. The map's commit, then **`git push origin HEAD:main`**.
6. **GitHub's self-test** on that commit. Vercel waits for it, the tower refuses a commit
   it failed — so does fire, saying the site is unchanged.
7. **Vercel** serving it — `config.json`'s `commit`, which every build now stamps.
8. **The tower, now**: `ssh -i ~/.ssh/radio-tower ubuntu@129.151.227.129 sudo
   /usr/local/bin/radio-tower-update` — the nightly updater run early, with its own CI
   check and its rollback of a commit that does not answer (`deploy/cloud/update.sh`).
9. **The tower serving it**, and answering `/api/health`.

```powershell
.\fire.cmd --dry-run      # what it would do — nothing committed, nothing sent
.\fire.cmd --no-tower     # GitHub and Vercel; the tower takes it tonight
```

The addresses are in `deploy/fire.json` (no secret: the key is only a path handed to ssh).
A whole run takes about as long as GitHub's self-test, ~6–10 minutes.

**What fire publishes is the branch you are on.** From `main` that is `main`'s new commits;
from a working branch it is the whole branch. Read step 4's list before typing FIRE.

## Files

| File | What |
|---|---|
| `site/data/layout.json` | **the map** — one page per line |
| `site/js/world/model.js` | the map's rules: resolve the file onto `layout.js`'s pages, check it, write it back. Pure, unit-tested |
| `site/js/world/layout.js` | what each page of today *is* (code, title, half, route), and its place as designed (`DESIGNED`) |
| `site/js/world/atelier.js`, `site/css/atelier.css` | the Atelier — loaded only for a tab that asked |
| `site/js/refs.js` | short links: `resolveRef`, `sameRoute` (the same page across versions), `pointHome` |
| `site/js/ui/reflinks.js` | `gt:` links rewritten as they enter a page |
| `site/js/pages/version.js`, `site/js/pages/go.js` | a version in its window; a short link that cannot be followed |
| `site/past/bar.js` | the bar over an old page, and its silence inside the world |
| `past/<id>/` | the frozen versions (`SNAPSHOT.json`: ref, commit, date) |
| `scripts/site-past.mjs` | freeze a version; lay it out in `dist/past/<id>/` (called by `site-build.mjs`); serve it locally |
| `scripts/site-layout.mjs` | `npm run layout` |
| `scripts/fire.mjs`, `fire.cmd`, `deploy/fire.json` | `fire` |
| `tests/atelier.test.js`, `tests/fire.test.js`, `scripts/atelier-smoke.mjs` | the tests — the smoke is stage 8 of `build-test.sh` |

## What holds, and why

- **Pages keep what they are.** The map file can move a page of today, never rename it or
  change its address: those stay in code, so a hand edit cannot break a route.
- **The map is checked everywhere it is written** — the Atelier's save, `npm run layout`,
  the build, the unit tests, `fire` — by the same function (`checkLayout`): no window on
  another (20 px apart), and every two windows' **phone frames** clear (corners 736 px
  apart across or 700 down), because on a phone each frame is the screen.
- **A draft is private.** The Atelier never writes anywhere but the browser and, through
  `npm run site` on this machine only, `site/data/layout.json`. Publishing is `fire`, and
  `fire` asks.
- **The past is frozen.** A snapshot is never edited and never retaken; only its window,
  its tag and whether it is online change.

## Not done here

- A version of the past inside the world is a frame: the old site's own visualiser runs
  in it while its window is open (only then — leaving the window removes the frame).
- The classic shell (`?classic=1`) is not a version of the past: it is today's code, and
  it shares the tab's memory with the world. It goes when `WORLD.md` says it goes.
- Rearranging the sections *inside* a page (Radio's cover, dial and queue) is not part of
  the map: that is each page's own layout.
