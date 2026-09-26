# Putting the tower on your own domain

You do this once. After that the tower is live at your domain wherever it's
plugged in, because the connection runs from the tower out to Cloudflare and
nothing comes in through the router.

You need a domain, and the domain must be on Cloudflare. That means using
Cloudflare's nameservers; the free plan is fine. If you're buying a domain
now, buying it through Cloudflare (Domain Registration) skips step 1.

> Dashboard names below match Cloudflare's docs as of September 2026
> ("Networking → Tunnels", "Published application"). Cloudflare renames menus
> now and then. If something has moved, the words to look for are **Tunnels**,
> **Create tunnel**, and a **route** to a **published application**.

---

## 1. Put the domain on Cloudflare (skip if it already is)

In the Cloudflare dashboard, choose **Add a domain**, type it, pick the Free
plan, and follow the instructions to change the nameservers where you bought
it. Wait until Cloudflare says the domain is **Active**. That can take
anywhere from minutes to a few hours.

## 2. Create the tunnel

1. Go to **Networking → Tunnels → Create tunnel**.
2. Name it `radio-tower`.
3. When it asks which system you're installing on, pick **Debian**,
   **arm64**. You won't run its commands. You only want the token inside
   them.
4. Copy the long string that starts with **`eyJ`** from the install command.
   That's the token. Copying the whole command is also fine, because the tower
   pulls the token out of it.

## 3. Point your domain at the tower

Still on that tunnel:

1. Go to **Routes → Add route → Published application**.
2. Subdomain: `radio` (or leave it empty to use the bare domain).
   Domain: pick yours.
3. **Service URL: `http://localhost:8080`**, exactly this. That's the station,
   seen from inside the Pi.
4. Save.

## 4. Give the token to the tower

Pick one:

- **Windows, the easy way.** SD card in the laptop.

  RUN THIS IN: Windows PowerShell on the laptop.

  ```powershell
  cd "C:\Users\barri\Documents\Ortis\Radio Tower\pi\anywhere"
  powershell -ExecutionPolicy Bypass -File .\prepare-card.ps1
  ```

  It asks for the domain and the token.

- **By hand.** On the card's `bootfs` drive, copy
  `radiotower-online.txt.example` to `radiotower-online.txt` and fill in two
  lines:

  ```
  DOMAIN = radio.example.com
  TUNNEL_TOKEN = eyJhIjoi…
  ```

Put the card back and power on. Within a minute or two
`https://radio.example.com` plays the station, with TLS included.

## 5. Check it

- Open the domain on your phone **with Wi-Fi off**, so you know it's the
  public route.
- Or read `radiotower-status.txt` on the card: `State: live on https://…`.
- In Cloudflare, the tunnel shows **Healthy**.

---

## If it doesn't come up

| What you see | Why | Fix |
|---|---|---|
| Cloudflare error **1033** | the tunnel isn't connected; the tower is off or offline | check `radiotower-status.txt` on the card |
| Cloudflare error **502** | the tunnel is up, but the station isn't answering on :8080 | status file says `station not answering`, see pi/TROUBLESHOOTING.md |
| The domain doesn't resolve at all | the route in step 3 is missing, or the domain isn't Active yet | re-check step 1 and step 3 |
| Status says `no tunnel token` | the file didn't reach the tower, or the token didn't look like `eyJ…` | re-copy the token, check the line starts `TUNNEL_TOKEN =` |
| The tunnel worked, then stopped for good | the token was rotated in Cloudflare | paste the new token into `radiotower-online.txt` |

## About the token

Anyone with the token can run your tunnel, which means serving whatever they
like on your domain. Treat it like a password.

- The boot partition is FAT32 and has no permissions. After the first
  successful boot the tower keeps a root-only copy in `/etc/radiotower/`.
  You can then **delete the `TUNNEL_TOKEN` line** from the card and the tower
  stays online. (A line that's deleted keeps the old value. A line that's
  present but empty, `TUNNEL_TOKEN =`, turns the tunnel off.)
- If the card is lost, go to **Networking → Tunnels → your tunnel → Rotate
  token** in Cloudflare. The old token stops working immediately.

## Why a remotely-managed tunnel and not `scripts/setup-tunnel.sh named`

`setup-tunnel.sh named` creates a tunnel from the Pi with an interactive
browser login and keeps its credentials in files on the Pi. That's fine while
you're sitting next to the Pi. A token from the dashboard needs no login on
the Pi at all and fits in a text file on the card. That's the whole premise
of this folder. `setup-tunnel.sh quick` is still there for a throwaway
`trycloudflare.com` URL.
