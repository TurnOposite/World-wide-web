# Echo — how to publish an article

Echo is the site's online media room (`/echo`). An article is one Markdown file in the repository;
**merging it into `main` publishes it** (Vercel rebuilds the site, the tower pulls it overnight).

## The short way

1. Write in Word or Markdown. If Word: save as `.docx`, convert with `pandoc draft.docx -t markdown -o draft.md`
   (or paste the text into a `.md`). Headings become intertitles.
2. Drop it in `inputs/echo/` of `ortis-cache` (private, a draft is never published from there) **or**
   run the importer yourself:
   ```bash
   node scripts/echo-import.mjs draft.md --date 2026-10-17 --author "Nom" \
        --standfirst "Le chapeau, en une ou deux phrases." --place "Paris" --tags reportage,paris
   ```
   It writes `echo/articles/2026-10-17-<slug>.md`, never overwrites, and marks anything missing as
   `[à compléter : …]` so it is visible in the preview rather than invented.
3. Add the hero image under `site/assets/echo/` (a **JPG/PNG/WebP** — link previews ignore SVG) and
   fill `hero`, `hero_alt`, `hero_caption`, `hero_credit` in the front matter. Credit every photo.
4. `node scripts/site-echo.mjs` (rebuilds `site/data/echo.json`; CI fails if you forget), open the PR,
   look at the Vercel preview **on a phone**, merge = publish.

## The file

```
---
title: "…"            standfirst: "…"       author: Nom        date: 2026-10-17
place: Paris          tags: reportage, paris   lang: fr
hero: assets/echo/photo.jpg   hero_alt: "…"   hero_caption: "…"   hero_credit: Nom
---
Paragraphs. `## Intertitle`. `> pull quote`. `---` section break.
*italic*, **bold**. A closing `## Sources` (or `## Notes`) bulleted list becomes the notes block.
```

French typography is applied at build (no-break space before `: ; ! ?`, inside « »): write normally.

## What the build adds

- **Feed:** `/echo/feed.xml` (Atom), linked from every page. Entry ids are `tag:` URIs, stable if the domain moves.
- **Link previews:** each article's cold-load page carries its own title, standfirst, `og:type=article`,
  `og:url` and — with a raster hero — its own `og:image` (otherwise the site's share card). Absolute URLs
  need `SITE_URL` at build time, as for the rest of the site.
- **Print:** printing an article gives the text alone, black on white, with external links spelled out.

## Never

Nothing private in this repository: it is public. No drafts, no names from outside the piece, no
unpublished sources. Publish only what you would be happy to see on the front page.
