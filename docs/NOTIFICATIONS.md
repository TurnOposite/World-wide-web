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

## A′ — Ortis is told when someone tunes in (2026-11-25)

Same topic, same app, nothing more to set up: when a device that is **not one of the station's own** starts
playing, the phone shows « Someone tuned in to the tower — An iPhone started listening. 2 listening now ». The
station's own = every browser where the Booth was unlocked with the key at least once (unlock it once on the laptop,
and on the phone if you do not want to be told of yourself). The same device is told of once per half hour; the
one-a-minute rule holds. Only the kind of device leaves the tower, never an address. `LISTEN_NOTIFY=0` stops it.

## A″ — Ortis replies from the phone (2026-11-27)

Ortis, 2026-11-25: « reply to the chat I received a notification about directly through my phone without looking
at the website ». A **second** ntfy topic is the station's mouth: the tower listens to it, and whatever is
published there goes on the telegraph line as the station's own message, under the name and picture of your last
message on the line (or « The station » if you have not spoken today). It notifies nobody.

**Not on yet: one step on the tower, then pick a way to send.**

1. Choose a second topic name nobody can guess, different from the first (whoever knows it can speak as the
   station). Give it to the tower, as you did the first. **PowerShell on the laptop:**

```powershell
ssh -i $env:USERPROFILE\.ssh\radio-tower ubuntu@129.151.227.129
```

   then, **bash on the tower** (replace `YOUR-REPLY-TOPIC`):

```bash
echo 'TELEGRAPH_REPLY_URL=https://ntfy.sh/YOUR-REPLY-TOPIC' | sudo tee -a /etc/radio-tower.env >/dev/null && sudo systemctl restart radio-tower
```

2. Ways to send — nothing to subscribe to in the ntfy app:
   - **The « Reply » button** on the line's notifications opens ntfy's own page for the reply topic: type, send.
     ntfy's documentation does not say whether its iPhone app shows these buttons; on Android and the ntfy web
     app it does. If your notification has no button, use the Shortcut.
   - **An iPhone Shortcut** (works without the button): Shortcuts → **+** → *Ask for Input* (Text, prompt
     « Reply on the line ») → *Get Contents of URL*: `https://ntfy.sh/YOUR-REPLY-TOPIC`, Method **POST**, Request
     Body **File**, the file = *Provided Input*. Name it « Reply on the line »; put it on the Home Screen, the lock
     screen's widgets or the Action button, or say it to Siri.
   - Anywhere else: `curl -d "your words" https://ntfy.sh/YOUR-REPLY-TOPIC`.

To check: `/api/status` (the Booth's Status side) says `replies: true`. To stop: remove the line and restart.
What leaves the tower: nothing new — it only reads the reply topic. What you publish there passes through
ntfy.sh. The topic's name is never written in the repository, a document or a log.

## B — Your other devices, from the Booth

Ortis, 2026-11-17: « the notifications should only be accessible to me, so it doesn't have to appear on the
antenna ». The Antenna offers listeners nothing. In the Booth, unlocked with the station key, the **Line** side
has a bell, **« Notify this device »**: it asks the browser's permission, registers the site's service worker,
and hands the tower this device's push subscription — only with the key. **« On · stop »** takes it back.

- Messages you send yourself (the Booth unlocked) notify nobody, either way.
- What is sent: who wrote and the first 80 characters, encrypted so only that device can read it (RFC 8291);
  one a minute at most. The tower keeps the subscription (an address at the browser's push service and two keys)
  in `/srv/radio/cache/telegraph-push.json`, with its own push key pair.
- **On an iPhone** a website can only receive notifications once it is added to the Home Screen and opened from
  there (iOS 16.4 or later): Share → Add to Home Screen → open it → Booth → unlock → Line → the bell. In a Safari
  tab the Line side says so instead of showing the bell. Not yet tried on your iPhone.

## Settings (the tower's environment, `/etc/radio-tower.env`)

| Line | Default | What |
|---|---|---|
| `TELEGRAPH_NOTIFY_URL` | unset | A: the ntfy topic's address. Unset = nothing sent |
| `LISTEN_NOTIFY` | on | A′: `0` stops « someone tuned in » (it needs `TELEGRAPH_NOTIFY_URL` anyway) |
| `LISTEN_NOTIFY_COOLDOWN_MINUTES` | 30 | A′: the same device is told of once per this many minutes |
| `TELEGRAPH_REPLY_URL` | unset | A″: the reply topic's address. Unset = no replies. Must differ from `TELEGRAPH_NOTIFY_URL` |
| `TELEGRAPH_REPLY_NAME` | The station | A″: the name a reply goes under before the station has said anything on the line |
| `TELEGRAPH_PUSH` | on | B: `0` switches the Booth's « Notify this device » off |
| `TELEGRAPH_NOTIFY_GAP_SECONDS` | 60 | at most one notification per this many seconds, each way |
| `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` | made and kept by the tower | only to bring a key pair from elsewhere |
| `PUBLIC_SITE` | `site` in `deploy/fire.json` | where a tap on Ortis's notification leads |
| `TELEGRAPH_PUSH_ALLOW` | unset | the self-test's stand-in push service. **Never on a real tower** |

If the tower is reinstalled and `telegraph-push.json` is lost, listeners'
subscriptions are lost with it: each taps the link again.
