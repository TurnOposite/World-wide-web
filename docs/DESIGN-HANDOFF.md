# Changing the site's design: the handoff for a designer

Written 2026-11-22 for a designer joining the project (Ortis: « what design templates and code integrations
[he] would need to make layout and integrated design changes to the website — file formats, a direct link from
Claude to the infrastructure, code review »). It holds the facts from the code. The project's story (why it looks
the way it does, what was tried and dropped, what is settled) is [`SITE-HISTORY.md`](./SITE-HISTORY.md): read it
first.

The site: **https://globe-trotter-ochre.vercel.app**. Two halves of one world: **Zone**, the radio (dark), and
**Echo**, the journal (paper). One synced radio stream plays under all of it. Plain HTML, CSS and JavaScript,
**no build step, no framework**.

---

## 1. Three ways to work. Pick one

| | You do | Claude does | What you need |
|---|---|---|---|
| **A. Design only** | Mockups and assets in the formats of section 4 | Builds them, sends you a preview link | Nothing technical |
| **B. Claude on your machine** | You steer Claude Code in a copy of the code | Writes the code, runs the tests, opens the pull request | GitHub access (section 2), [Claude Code](https://claude.com/claude-code), Node 24 |
| **C. Claude in the browser** | The same, from claude.ai/code | The same, in the cloud | GitHub access, a Claude account |

**The direct link between Claude and the infrastructure is the repository itself.** The code carries its own
briefing: `CLAUDE.md` (read first by any Claude session), `BRIEF.md` (the rules), `.claude/agents/` and
`.claude/skills/` (the project's own agents and know-how). Any Claude session opened on a copy of the repo gets
all of that without being told. There is nothing else to connect.

The site's story comes the same way: [`SITE-HISTORY.md`](./SITE-HISTORY.md) is in the repository, so your Claude
can be told « read docs/SITE-HISTORY.md and docs/DESIGN-HANDOFF.md first » and needs nothing else.

If you design in **Figma**: Figma's Dev Mode MCP server lets Claude Code read your frames, layers and variables
directly (it needs a Figma plan with Dev Mode). Without it, an exported frame and its measurements work just as well.

## 2. Access to ask for

- **Collaborator on the GitHub repository `TurnOposite/World-wide-web`** (Ortis invites you: Settings →
  Collaborators). That is all you need for B and C.
- **Not needed and not given:** the Vercel account (previews come to you as links on pull requests), the Oracle
  server, the station key, the music folder, the deploy keys. They stay with Ortis.
- **The repository is public.** Nothing private goes into it: no unpublished drafts, no personal photos, nobody's
  data.

## 3. Where the design lives

| What | File(s) |
|---|---|
| Colours, radii, fonts (the tokens) | `site/css/site.css` `:root` (pages) and `site/css/world.css` `:root` (`--w-night…` for Zone, `--w-paper…` for Echo) |
| The world, the map, the menus, the tags | `site/css/world.css`, `site/js/world/` |
| Where each window stands on the map | `site/data/layout.json`. **Edit it visually in the site itself: add `?atelier=1` to any address** (drag, resize, tilt, see it at once). Guide: [`ATELIER.md`](./ATELIER.md) |
| Each page's markup | `site/js/pages/<page>.js` (HTML in template strings); its styles in `site.css` or `rooms.css` |
| The Archive's rooms (library, crates, photos) | `site/js/pages/rooms/`, `site/css/rooms.css` |
| The boat (the 3D front, desktop only) | `site/js/boat/`, `site/css/boat.css` |
| Fonts | `site/fonts/` (WOFF2, all under the SIL Open Font License, `OFL.txt`) |
| Images, icons, marks | `site/assets/` |
| Words and lists (playlists, texts, collections) | `site/data/*.json` |
| Design history | [`SITE-HISTORY.md`](./SITE-HISTORY.md) (start here), [`DESIGN-BRIEF.md`](./DESIGN-BRIEF.md), [`WORLD.md`](./WORLD.md), [`design/MOODBOARD-globe-trotter.md`](./design/MOODBOARD-globe-trotter.md), [`IDENTITY-OPTIONS.md`](./IDENTITY-OPTIONS.md), [`DESIGN-POSTMORTEM.md`](./DESIGN-POSTMORTEM.md) |

### The template to start from

`npm run compare` builds one page with **every route at three sizes**. Screenshot it to get today's state as the
base for your mockups. The sizes the tests check, so design for these:

| | Width × height |
|---|---|
| Laptop | 1440 × 900 (also 1280 × 800) |
| Phone | 390 × 844 |
| Small phone | 375 × 667 |
| Phone on its side | 844 × 390 |

The routes: Zone has `radio`, `ondes`, `playlists`, `antenna` and `booth`. Echo has `echo` (la Une),
`echo/articles`, `portfolio` (the Archive) and `atlas`.

## 4. File formats

| What | Send as | Limits |
|---|---|---|
| Mockups | A Figma link (view access), or PNG/PDF exports at the sizes above, @2x | One frame per route and size you change |
| Icons, marks, shapes | **SVG**, one colour (`currentColor`), with a `viewBox`, no embedded bitmap | Under ~5 KB each |
| Photos, illustrations | **JPG** or **WebP** at twice the size shown | Under ~300 KB each; PNG only for flat art with transparency |
| Fonts | **WOFF2**, with a licence that allows web embedding (OFL is ideal) | Latin subset; two or three weights |
| Colours | Hex values, and where each is used | Text at **AA contrast** or better (4.5:1; 3:1 for large text) |
| Motion | A short MP4 or GIF, plus durations (ms) and easing | Built in CSS: only `transform`, `opacity`, `clip-path` move |
| Words | Plain text or Markdown | French for Echo, English for Zone's interface, as today |
| 3D | `.glb` / `.gltf` under ~5 MB | Needs a library the site does not have yet: talk first (section 5) |

## 5. Rules the code keeps

The tests enforce most of these, so a change that breaks one fails on its own.

- **No build step, no framework, no bundler.** A new library is a cost and needs a line in `DECISIONS.md` saying why.
- **The music never stops** for a design reason: no animation, flight or page change may pause or desync it.
- **Reduced motion is respected everywhere** (`prefers-reduced-motion`): the same thing, without the movement.
- **Text reaches the screen at its own size** (the map scales windows, not text), and passes AA contrast. An
  accessibility check (axe) runs on every page.
- **Nothing copied** from published games, films or brands (logos, art, textures, fonts): the mood board borrows
  Persona 5's and Scott Pilgrim's *mechanics*, never their look. No rehosted Bandcamp art.
- **Leave these to Ortis:** `server/`, `deploy/`, `library/`, `dj/`, the music, the keys, `.github/workflows/fire.yml`.

## 6. From your change to the live site: the review loop

1. **A branch**, named for the change (`design/booth-tabs`), never `main`.
2. **The self-test before and after:** `bash scripts/build-test.sh` (about 15 minutes; it boots the station, drives
   the site in a real browser at every size above, and runs the accessibility checks). Green before and red after
   means the change is wrong. Never weaken a test to make it pass.
3. **A pull request** on GitHub. GitHub runs the same self-test on it by itself (up to 30 minutes), and Vercel
   normally adds a **preview link** to the pull request, so you and Ortis see the change live without publishing it.
4. **Code review.** Claude reviews it: in a Claude Code session, `/code-review` on the pull request, or « review
   pull request N » in a session. Ortis reviews what it looks like on the preview.
5. **Ortis merges.** Merging is publishing: Vercel puts it live within minutes, and the radio server takes it the
   same night (or at once with `fire`). His word is « push » or « fire »; nothing reaches `main` without it.

Suggested for Ortis, once: in GitHub, **Settings → Branches → protect `main`**, requiring a pull request and the
`self-test` check to pass before merging. Then nothing lands unreviewed or red, whoever opens it.

## 7. Waiting for a designer, from the backlog

From [`BACKLOG.md`](./BACKLOG.md): **C1**, the Archive's books as a pile on phones (a mock with two or three
variants first); **W5 / MB-06**, the Atlas rethought as an overworld (option A or B); **F1**, the boat's next
version (its files: `Radio Tower\Claude outputs\boat-files-2026-11-22\`); **W8**, the telegraph line's cast in
Ortis's own drawings.
