# Identity options — name, mark, motto

> **This is a menu, not a migration.** Nothing in `public/` was changed to
> produce it. Ortis asked to review the name, logo and motto and explicitly
> wanted *options to pick from, not a decision made for him* — so this file
> presents five directions and stops there.
>
> Written 2026-08-19 by the scheduled run. To adopt one, say which; the change
> is `STATION_NAME` / `STATION_TAGLINE` in `deploy/`, the inline `<svg
> class="tower-icon">` in `public/index.html`, and the favicon data-URI in the
> same file. Roughly a fifteen-minute job, one worklog line.

---

**All five marks rendered:** [`identity-marks.png`](./identity-marks.png) — each
one at 64px, 26px (the masthead size) and 16px (the favicon size), on the real
background colour. Every SVG below was pasted into a browser and screenshotted
to produce it, so what is in that image is what the code in this file actually
draws. A is the muddiest at 16px (the cross-bracing fills in); D is the
cleanest.

---

## What the identity has to carry

Worth stating before the options, because it is what separates them.

The library is **barber beats, vaporwave, VGM, and atmospheric drum & bass**,
plus a French chanson and classical shoebox that arrived in the same six
folders. The listening model is a **single synced stream** — everyone hears the
same second of the same track, nobody can seek, no account, no app. It runs on
a **Raspberry Pi in Ortis's home**, reachable from the public internet through
a Cloudflare tunnel.

So the identity is balancing four things:

1. **Liminal / hauntological.** The genre's whole aesthetic is *a place that
   isn't quite there* — the empty mall, the hold music, the save room.
2. **Broadcast, not library.** The one-stream rule is the product. Anything
   that reads as "playlist" or "player" sells the wrong thing.
3. **Small and personal.** It is one guy's Pi, not a service. Corporate polish
   would be a lie, and a charming one is available instead.
4. **Legible at 26px.** The mark renders in the masthead at 26×26 and as a
   favicon at 16×16. Every SVG below is drawn to survive that.

A note on the current motto: *"One signal. Everyone on the same second."* is
genuinely good — it states the single most unusual thing about the project in
seven words. Several options below keep its structure on purpose.

---

## Option A — Keep **Radio Tower**, restyle the mark

**Name** Radio Tower
**Motto** One signal. Everyone on the same second.

The name is doing more work than it gets credit for. It is unpretentious, it
says "broadcast" rather than "playlist" in two words, it is already in
`STATION_NAME`, the docs, the systemd unit and the installer, and it does not
date. The weak part is not the name — it is the mark. The current icon is a
generic four-stroke pylon that reads as a smudge at favicon size.

**The mark, redrawn.** A tower reduced to three horizontals and two legs, with
the signal as concentric arcs leaving the top — the arcs are the identity, the
tower is just what they leave from. Wide stroke, few elements, survives 16px.

```svg
<svg viewBox="0 0 32 32" width="32" height="32" fill="none"
     stroke="currentColor" stroke-width="2" stroke-linecap="round">
  <!-- the legs -->
  <path d="M11 29 L16 12 L21 29"/>
  <!-- the cross-bracing: three rungs, widest at the base -->
  <path d="M12.7 23h6.6M13.8 19h4.4M14.6 15.5h2.8"/>
  <!-- the signal: two arcs, opening upward and outward -->
  <path d="M11.5 8.5a6.5 6.5 0 0 1 9 0" opacity=".85"/>
  <path d="M8 5a11 11 0 0 1 16 0" opacity=".5"/>
  <circle cx="16" cy="11" r="1.6" fill="currentColor" stroke="none"/>
</svg>
```

**Palette** Keep the existing dark (`#0b0d10` / `#12161b`) and swap the amber
`--signal` (`#ffb340`) for a warmer coral-to-violet: `#ff9d6c` primary,
`#b98cff` secondary. The amber currently fights the visualiser's pastel ring on
every genre except jazz and chanson.

**Signals** Confidence. "We know what this is, we are not going to be clever
about it." Costs nothing, breaks nothing, keeps every doc reference true.

---

## Option B — **Liminal FM**

**Name** Liminal FM
**Motto** *Nobody is here. Everybody is listening.*

The most honest name for what the library actually is. "Liminal" is the exact
word the barber-beats / mallsoft scene uses about itself, and "FM" pulls it
back toward broadcast so it does not float off into art-project territory. The
motto is the paradox of a synced stream with no accounts: the room is empty and
full at the same time.

**The mark.** A doorway with no door — a rounded arch, and inside it a horizon
line with the sun half-set. Two shapes, enormous negative space, reads clean at
16px because it is essentially a keyhole silhouette.

```svg
<svg viewBox="0 0 32 32" width="32" height="32">
  <!-- the arch: a doorway you can see through -->
  <path d="M7 29V14a9 9 0 0 1 18 0v15" fill="none"
        stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/>
  <!-- the horizon inside it -->
  <path d="M9.5 22.5h13" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
  <!-- the half-set sun -->
  <path d="M16 15.5a7 7 0 0 1 6.1 7H9.9a7 7 0 0 1 6.1-7z"
        fill="currentColor" opacity=".38"/>
</svg>
```

**Palette** Dusk. Background stays near-black (`#0a0b10`), accents run
`#8fd3ff` (cold light through a doorway) → `#f7a8d8` (the sunset) → `#c8b6ff`.
This is the most vaporwave palette of the five without going full
magenta-and-cyan cliché.

**Signals** That the station has a *mood* and knows it. The risk: "liminal" is
having a moment and moments end — this is the option most likely to feel dated
in five years. The upside is it is the only one a stranger would immediately
understand the vibe of before pressing play.

---

## Option C — **Night Porter**

**Name** Night Porter
**Motto** *Someone's awake. Something's on.*

A porter is the person at the desk at 3am in a building where nothing is
happening — which is precisely the emotional register of this library, and
precisely what a Pi humming in a cupboard is doing. It is warm rather than
cold, which none of the other options are, and it makes the station feel
*staffed* — like there is someone choosing, even though it is a seeded shuffle.

**The mark.** A desk bell, seen straight on, with signal arcs instead of a
ringing line. Distinctive at any size because the dome-plus-base silhouette is
unmistakable, and nobody else in this space uses it.

```svg
<svg viewBox="0 0 32 32" width="32" height="32">
  <!-- the dome -->
  <path d="M6.5 23a9.5 9.5 0 0 1 19 0z" fill="currentColor" opacity=".9"/>
  <!-- the base -->
  <rect x="4.5" y="23.5" width="23" height="3" rx="1.5" fill="currentColor"/>
  <!-- the button on top, and the signal leaving it -->
  <circle cx="16" cy="10.5" r="1.9" fill="currentColor"/>
  <path d="M10.5 7.5a8 8 0 0 1 11 0" fill="none" stroke="currentColor"
        stroke-width="1.8" stroke-linecap="round" opacity=".55"/>
</svg>
```

**Palette** Lamp-lit. `#0d0c0f` background, `#ffc98a` primary (a desk lamp, not
a warning light), `#7fb8b0` secondary, and a single `#e8595b` reserved for the
ON AIR dot. Warmer than the current scheme; the one option where the amber
already in the CSS survives almost unchanged.

**Signals** Hospitality and a bit of wit. Reads well to someone handed the URL
cold — it explains why the station is on at an odd hour. Weakest fit for the
VGM and DnB thirds of the library, which are not sleepy.

---

## Option D — **Same Second**

**Name** Same Second
**Motto** *You are hearing what I am hearing.*

Named after the mechanism instead of the mood. `BRIEF.md` §7 defines "done" as:
*a stranger opens the URL on a phone and hears the same song Ortis is hearing
at that moment*. This is that sentence compressed to two words. The genre can
change entirely — Ortis could refill the drive with something else next year —
and the name would still be exactly right, which is not true of B or C.

**The mark.** Two concentric arcs and a dot: one signal, two listeners, the
same instant. Effectively a play button that has been folded into a broadcast
symbol. The most abstract mark here, and the most scalable.

```svg
<svg viewBox="0 0 32 32" width="32" height="32" fill="none"
     stroke="currentColor" stroke-linecap="round">
  <!-- the instant -->
  <circle cx="16" cy="16" r="3" fill="currentColor" stroke="none"/>
  <!-- two listeners, same arc, opposite sides -->
  <path d="M23.5 8.5a10.5 10.5 0 0 1 0 15" stroke-width="2.4"/>
  <path d="M8.5 23.5a10.5 10.5 0 0 1 0-15" stroke-width="2.4"/>
  <path d="M27.5 5a15 15 0 0 1 0 22" stroke-width="1.8" opacity=".4"/>
  <path d="M4.5 27a15 15 0 0 1 0-22" stroke-width="1.8" opacity=".4"/>
</svg>
```

**Palette** Iridescent neutral — this is the one identity that should take its
colour *from the music*. Fix the background at `#0b0d10` and let the accent be
driven live by `GENRES[].accent`, the same hue the visualiser already uses. The
masthead mark would shift from violet on barber beats to sea-green on
atmospheric DnB. Technically easy: the value is already in `/api/station` as
`genreAccent`, and the mark uses `currentColor` throughout.

**Signals** That the sync *is* the product. Best option if this is ever shown to
other people as a thing that was built, rather than just used. Slight risk of
sounding like a productivity app rather than a radio station.

---

## Option E — **The Tower is On** *(wordmark, no icon)*

**Name** The Tower is On
**Motto** *Since <date>. Still going.*

The contrarian entry: no logo at all. A wordmark set in the existing UI font,
with the state of the station as part of the name. Where the mark would go,
put a single live element — a 6px dot that pulses with the actual on-air state
(the `.badge .pulse` animation already exists in `styles.css` and does exactly
this). The motto renders the real uptime from `/api/health`, which is already
in the payload.

```svg
<!-- Not an icon: the whole "mark" is one live dot. -->
<svg viewBox="0 0 32 32" width="32" height="32">
  <circle cx="16" cy="16" r="5" fill="currentColor">
    <animate attributeName="opacity" values="1;.35;1" dur="1.9s" repeatCount="indefinite"/>
  </circle>
  <circle cx="16" cy="16" r="10" fill="none" stroke="currentColor"
          stroke-width="1.4" opacity=".28"/>
</svg>
```

**Palette** Unchanged from today. The point is subtraction, not restyling.

**Signals** Extreme confidence and a slightly punk refusal to brand itself,
which fits "one guy's Pi" better than any logo could. Two real costs: it is the
weakest at favicon size (a dot is a dot), and "The Tower is On" is awkward to
say out loud, which matters if Ortis ever tells someone the name rather than
sending a link.

---

## Side by side

| | Name | Motto | Mark | Best if you want… |
|---|---|---|---|---|
| **A** | Radio Tower | One signal. Everyone on the same second. | Pylon + arcs | To change nothing but the weakest part |
| **B** | Liminal FM | Nobody is here. Everybody is listening. | Empty doorway | The mood legible before play is pressed |
| **C** | Night Porter | Someone's awake. Something's on. | Desk bell | Warmth and a bit of wit |
| **D** | Same Second | You are hearing what I am hearing. | Concentric arcs | The mechanism to be the identity |
| **E** | The Tower is On | Since <date>. Still going. | A live dot | No branding at all |

## If you want one opinion rather than five

Asked to pick, I would put **A** and **D** at the top for opposite reasons — A
because the name is already right and only the mark is weak, D because it is
the only name that stays true if the library is replaced wholesale. **B** is
the strongest *aesthetic* fit and the weakest bet on longevity.

But this is a menu on purpose, and the tiebreaker is a fact I do not have:
whether this station is mostly for Ortis or mostly for the strangers he sends
the link to. A and E are better for the first; B and D are better for the
second.

## Not decided, deliberately

- Nothing in `public/`, `deploy/` or `pi/` was touched.
- No `STATION_NAME` / `STATION_TAGLINE` default was changed.
- The visualiser palette already keys off genre and is independent of whichever
  identity is chosen — except under **D**, which would extend the same hue to
  the masthead mark.
