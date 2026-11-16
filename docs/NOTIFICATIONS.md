# Notifications for the telegraph line

Ortis, 2026-11-16: « phone notification for messages in antenna ». Two things,
separate, both off until someone turns them on. The code is
`server/lib/notify.js` (the tower), `server/lib/webpush.js` (the encryption),
`site/js/ui/push.js` and `site/sw.js` (the listener's browser).

## A — Ortis is told when someone writes

The tower posts to an **ntfy topic**; the ntfy app on the phone shows it: the
sender's name and the first 80 characters. Free, no account. Not sent for the
station's own messages. At most one a minute: what arrives meanwhile comes as
« 3 new messages on the telegraph line ».

**Not on yet: it needs three steps from Ortis (5 minutes).**

1. On the phone, install the **ntfy** app (App Store / Play Store).
2. Choose a topic name nobody can guess — it is the only secret: whoever knows
   it can read what is sent there. Something like `tower-` followed by 20
   random letters and digits. In the app: **Subscribe to topic**, type it.
3. Give the tower the same name. **PowerShell on the laptop:**

```powershell
ssh -i $env:USERPROFILE\.ssh\radio-tower ubuntu@129.151.227.129
```

   then, **bash on the tower** (replace `YOUR-TOPIC`):

```bash
echo 'TELEGRAPH_NOTIFY_URL=https://ntfy.sh/YOUR-TOPIC' | sudo tee -a /etc/radio-tower.env >/dev/null && sudo systemctl restart radio-tower
```

To try it: write something on the Antenna from another browser, not unlocked
with the key. To stop it: remove that line from `/etc/radio-tower.env` and
restart, or unsubscribe in the app.

What leaves the tower this way: the name and the start of the message, to
ntfy.sh (a third party), for that topic. Never an address. The topic's name is
never written in the repository, a document or a log.

## B — Listeners who ask are told

On the Antenna, in the line's foot: **« tell me when someone writes »**. Nobody
is asked anything until they tap it. The tap asks the browser's permission,
registers the site's service worker, and hands the tower a *push subscription*:
an address at the browser's own push service (Google's, Mozilla's, Apple's) and
two keys. The same link stops it, on both sides.

- **On as soon as the tower runs this code** (unless `TELEGRAPH_PUSH=0`). The
  tower makes its own key pair on first start and keeps it, with the
  subscriptions, in `/srv/radio/cache/telegraph-push.json` (the service's
  own, mode 600).
- **What is kept about a listener:** that subscription and when it was made.
  No name, no address. It is the one exception to « nothing about a listener
  is stored », by their own tap, and undone by their own tap
  (`docs/DECISIONS.md`, 2026-11-16).
- **What is sent:** who wrote and the first 80 characters, encrypted so only
  that browser can read it (RFC 8291); the push service carries it without
  seeing it. A listener is not told about their own message. One a minute at
  most, as above.
- **A subscription that has gone** (the push service answers 404 or 410) is
  forgotten by itself.
- **The tower only ever calls a real push service**: an address that is not
  Google's, Mozilla's, Apple's or Microsoft's push host is refused, so the
  subscribe endpoint cannot be used to make the tower call anything else.

### iPhone

Safari only lets a website send notifications when it has been **added to the
Home Screen and opened from there** (iOS 16.4 or later). In a Safari tab the
line says so in one sentence instead of showing a link that cannot work:
Share → Add to Home Screen → open the radio from that icon → the link appears.
The site carries what that needs (`site/manifest.webmanifest`, the icons in
`site/assets/app-*.png`, re-drawn by `node scripts/site-icons.mjs`).

**Not proven on a real iPhone.** The self-test drives Chromium with a stand-in
push service: it proves the tap, the subscription, the encryption and the
delivery to the push service — not Apple's side. To check on the iPhone 11 Pro:
add to Home Screen, open, Antenna, tap the link, allow; then write from the
laptop and wait for the notification with the phone locked. In the EU, Apple
announced in 2024 that Home Screen web apps would go, then kept them: if the
icon opens in Safari instead of its own window, that has changed again, and
part B cannot work on an iPhone until it changes back.

## Settings (the tower's environment, `/etc/radio-tower.env`)

| Line | Default | What |
|---|---|---|
| `TELEGRAPH_NOTIFY_URL` | unset | A: the ntfy topic's address. Unset = nothing sent |
| `TELEGRAPH_PUSH` | on | B: `0` switches the listeners' notifications off |
| `TELEGRAPH_NOTIFY_GAP_SECONDS` | 60 | at most one notification per this many seconds, each way |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | made and kept by the tower | only to bring a key pair from elsewhere |
| `PUBLIC_SITE` | `site` in `deploy/fire.json` | where a tap on Ortis's notification leads |
| `TELEGRAPH_PUSH_ALLOW` | unset | the self-test's stand-in push service. **Never on a real tower** |

If the tower is reinstalled and `telegraph-push.json` is lost, listeners'
subscriptions are lost with it: each taps the link again.
