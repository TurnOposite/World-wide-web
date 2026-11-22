# A phone app for Radio Tower: the plain guide

Written 2026-11-22 (Ortis: « a comprehensible guide for a phone app »). What exists, the three levels a phone app
can mean, what each costs, who does what, and the one question to settle before any app store.

## The short answer

**The site already installs as an app**: it has the manifest, the icons and the service worker for it. On a phone,
« Add to Home Screen » gives it an icon, opens it full screen without the browser bar, and it plays.
The next two levels put it in the **stores**. Android costs little and is mostly packaging. iPhone needs a Mac, a
yearly fee and a review by Apple. **For both stores the real question is the music's rights, not the code** (see
« Before any store »).

## Level 1: the Home Screen app (exists today, free)

| | iPhone (Safari) | Android (Chrome) |
|---|---|---|
| Install | Share → « Add to Home Screen » | ⋮ → « Install app » (or the banner) |
| Opens | Full screen from its own icon, at `/radio` | Same |
| What is built | the app icon, the dark theme, the lock-screen title and cover (Media Session, `site/js/player.js`) | Same |
| **Not proven on a real phone** | that the music goes on with the screen locked; the lock-screen controls; the join at the right second after a lock | Same |

The last row is backlog **W3**: the real-phone checklist in [`WORLD.md`](./WORLD.md) has never been run. That is the
first step of any phone app, because a store app built on top of it inherits whatever fails there.
Since 2026-11-22 the phone version shows no boat and no chat notifications (Ortis's choice). The station's own phone
notifications go through ntfy instead ([`NOTIFICATIONS.md`](./NOTIFICATIONS.md)).

## Level 2: Android, in the Google Play Store

**How:** a *Trusted Web Activity* (TWA). Google's own way to put a web app in the store: the app is a thin Android
shell that opens the site full screen, with no browser bar. Tools: **PWABuilder** (pwabuilder.com, give it the
site's address) or Google's **Bubblewrap**. Either one produces the signed `.aab` file the store takes.

| Step | Who |
|---|---|
| A Google Play developer account (**$25 once**, identity check) | Ortis |
| Package the app with PWABuilder; keep the signing key safe (losing it = no more updates) | Claude prepares, Ortis holds the key |
| Prove the site and the app belong together: a file `/.well-known/assetlinks.json` on the site. **Needs one code change**: `scripts/site-build.mjs` skips folders starting with a dot today | Claude |
| A privacy-policy page (the stores require one; the site keeps a chat line and, if asked, a push address) | Claude drafts, Ortis approves |
| Store listing: icon 512 px, a 1024 × 500 banner, phone screenshots, a description | Claude prepares, Ortis signs off |
| **A closed test before going public**: for a new personal account, Google asks for at least 12 testers opted in for 14 days in a row | Ortis invites friends |
| Publish | Ortis |

Time: one Claude session for the code and the package, then about three weeks of calendar because of the test.
Every site update reaches the app by itself: the app *is* the site.

## Level 3: iPhone, in the App Store

**How:** **Capacitor** wraps the site in a native iOS project. That is also the moment to add what only a native
app gets for sure: music that goes on with the screen locked (iOS background audio) and the lock-screen controls.

| Needs | Cost |
|---|---|
| Apple Developer Program | **$99 a year** |
| A Mac with Xcode to build and sign. The laptop is Windows, so a borrowed Mac, a rented cloud Mac, or a build service (Codemagic and the like) | from free (a friend's Mac) to a monthly fee |
| TestFlight (Apple's test app) for the first testers | free |
| **App Review** | days, and the risks below |

Two known reasons Apple refuses apps like this one: **guideline 4.2**, an app that is « just a website » (the
native background audio and lock-screen controls are the answer), and **guideline 5.2**, intellectual property
(next section).

## Before any store: the music's rights

The tower broadcasts recordings by other artists, to anyone, for free. In a browser that is the site's business.
**A store's review asks whether you hold the rights to stream what the app plays**, and a music app without
licences can be refused, or removed later with a strike on the developer account. Buying an album on Bandcamp gives
the right to listen to it, not to broadcast it. Before paying for a store account, decide which of these it is:

- **Stay a Home Screen app (Level 1).** No review, no fee, no question asked. Everything above still works.
- **A store app that plays only music you have the rights to** (your own, artists who agreed, Creative
  Commons). A separate stream could do this; the streams are already built per folder (`docs/STREAMS.md`).
- **A store app as it is, with the risk.** Your call; the code does not change the answer.

## Recommended order

1. **Run the real-phone checklist** (W3) on your iPhone and fix what it finds. That makes Level 1 good: it is what
   every listener on a phone gets anyway.
2. **Decide the rights question** above.
3. Then, if a store: **Android first** (cheap, no Mac, the same site), **iPhone after** if it is worth the $99 a
   year and a Mac.

Say « phone app, level 2 » (or 3) to a session to start one; this page is its brief.
