---
name: tower-curate
description: The pipeline and privacy rules for publishing Ortis's essays, thesis, network maps, photos and album covers in Radio Tower's Library / Photos / Crates rooms via collections/collection.json. Use when adding, removing or correcting anything shown on /library.html, /photos.html or /crates.html.
---

# Curating the rooms

## Layout

```
collections/
  collection.json          ← the only thing that decides what is published
  university/essays/*.pdf  university/covers/*.jpg  university/thesis/*.pdf  university/maps/*.png
  photos/<album>/<name>.jpg + photos/<album>/thumbs/<name>.jpg
  music/covers/*.jpg
  _review/  _incoming/     ← working folders, NEVER served (any path segment starting "_" is a 404)
```

Served under `/collections/…` as pdf/jpg/png/webp only, with `?download=1`
for a download. The API is `GET /api/collections`. An entry whose file is
missing is dropped from the page and listed in `missing`.

## Where the sources live (Ortis's laptop)

| Room | Source |
|---|---|
| Library | `Desktop\University\WORD docs backup\*.docx` (McGill essays), `…\UCPH\…`, the thesis `Downloads\Barrier_Arthur_Thesis_June2026.pdf`, slides in `…\PP n PDF backup\` |
| Map room | thesis appendix figures (`pdfimages -png -f 61 -l 63`), `…\UCPH\SNA\Social Network Analysis\*.png` |
| Photos | `Pictures\Kruger safari\`, `Pictures\Camera Roll\` |
| Crates | the station's own library. Covers from `Desktop\Music\cover*.png/jpg` |

## Essays → shelf

1. Shortlist by title and class, and get Ortis's OK.
2. Redact the student ID inside the .docx XML (`word/*.xml`), regex
   `(McGill|Student)?\s*ID\s*[#:]?\s*26\d{7}`. Also blank
   `docProps/core.xml` creator.
3. `soffice --headless --convert-to pdf --outdir out/ redacted/*.docx`
4. **Verify**: `pdftotext out/x.pdf - | grep -cE '26[0-9]{7}'` must be 0.
5. Cover: `pdftoppm -f 1 -l 1 -r 60 -jpeg x.pdf covers/x`, then rename to
   `x.jpg`.
6. Manifest entry: `id, title, course ("POLI 369"), kind ("Final paper"),
   file, cover, pages`. The spine colour comes from the course prefix (LACS,
   POLI, INTD, HISP, HIST, SOCI; UCPH/IFP by shelf). Its height comes from
   `kind`, its thickness from `pages`.
7. A book can be a doorway instead of a file: `mapsLink: true` with no `file`.

## Photos → album

PIL: `ImageOps.exif_transpose` → `thumbnail((1800,1800))` → save quality 84
**without exif** (this drops GPS). Thumbnail 640 px. The manifest carries
`w`/`h` of the web copy so the justified grid holds its shape before images
load. No faces of other people without their OK.

## Maps

PNG at native size (≥ 900 px). A `legend` of `{label, share, color}` renders
as swatches with bars. Transcribe it from the figure's own legend, never
invent it.

## Checks

```bash
npm run collections                       # manifest ↔ disk, sizes
node --test tests/collections.test.js     # what must never be served
bash scripts/build-test.sh                # browser stage: rooms render, book lifts, lightbox, map zoom
```
