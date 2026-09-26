# Radio Tower on a Raspberry Pi — the whole thing, start to finish

**You are here:** you have a Raspberry Pi 4 or 5, a blank SD card, an Ethernet
cable, and a router. You have never set up a Pi before.

**You will end up here:** you type `http://radiotower.local:8080` into your
phone and hear your music, and so does anyone else on your network. The Pi
starts the station automatically every time it powers on.

**Time:** about 45 minutes, most of it waiting for downloads.

---

## The one thing to understand before you start

> **A blank SD card cannot just have files copied onto it.**

A Raspberry Pi has no built-in operating system. The SD card *is* the computer's
hard drive, and right now it is empty. You have to **write an operating system
image** onto it first, with a free tool called Raspberry Pi Imager. Copying
files onto a blank card does nothing — the Pi will not boot, no lights, no
network, nothing.

Once the OS is written, the card ends up with **two partitions**:

| Partition | Size | Windows sees it? | What it is |
|---|---|---|---|
| `bootfs` | ~512 MB, FAT32 | **Yes** — shows up as a drive letter | Boot files. This is where our folder goes. |
| `rootfs` | the rest, ext4 | **No** — Windows offers to format it. **Say no.** | The actual Linux system. |

So the real sequence is: **flash the OS → copy our folder onto `bootfs` → boot
the Pi → run one command.** That is what the rest of this document walks you
through.

> ⚠️ **When you plug the freshly-flashed card into Windows, it will pop up
> "You need to format the disk in drive X: before you can use it."**
> That is Windows looking at the Linux `rootfs` partition it cannot read.
> **Click Cancel.** Never Format. The `bootfs` partition will have appeared
> as a separate, working drive letter.

---

## What you need

- Raspberry Pi 4 or 5
- The official USB-C power supply. **Use the real one.** A phone charger that
  looks identical will cause random reboots and corrupted SD cards, and you
  will spend a day blaming the software.
- microSD card, **32GB or larger**, Class 10 / A1 or better
- An SD card reader for the laptop you can plug the card into
- An Ethernet cable
- Your router, with a free Ethernet port
- Optional but recommended: a USB stick for the music

---

## Step 1 — Install Raspberry Pi Imager

On the laptop that has the SD card reader.

1. Go to **https://www.raspberrypi.com/software/**
2. Download **Raspberry Pi Imager for Windows** and run the installer.
3. Accept the defaults. It is about 30MB.

---

## Step 2 — Flash the operating system

Put the SD card in the reader and open Raspberry Pi Imager.

### 2a. The three buttons

**CHOOSE DEVICE** → pick `Raspberry Pi 5` or `Raspberry Pi 4`, whichever you have.

**CHOOSE OS** → `Raspberry Pi OS (other)` → **`Raspberry Pi OS Lite (64-bit)`**

> **Why Lite?** No desktop, no browser, no games. It boots in seconds and leaves
> the RAM and CPU for playing audio. You will never plug a monitor into this Pi
> — you will talk to it from your laptop. The current release is based on Debian
> **Trixie** (Debian 13); anything Imager offers you as "Lite (64-bit)" is fine.

**CHOOSE STORAGE** → your SD card.

> ⚠️ Read the size and drive letter carefully. Imager will happily erase an
> external hard drive if you pick the wrong one. If you are not sure, unplug
> every other USB drive first.

### 2b. The settings screen — this part matters

Click **NEXT**. It asks *"Would you like to apply OS customisation settings?"*
Click **EDIT SETTINGS**.

**GENERAL tab:**

| Field | Set it to | Why |
|---|---|---|
| Set hostname | `radiotower` | This becomes `radiotower.local`, the address you type in your browser. |
| Set username and password | username `ortis`, and a password you will remember | You need this to log in. Write it down. There is no recovery. |
| Configure wireless LAN | **Your Wi-Fi name + password** | Tick it even though you are using Ethernet. It is a free safety net if the cable ever fails. |
| Wireless LAN country | `ZA` | Legally required for the Wi-Fi radio to switch on. |
| Set locale settings | Time zone `Africa/Johannesburg` | **This one is not cosmetic.** The entire station schedule is computed from wall-clock time. A Pi with the wrong clock plays the wrong track. |

**SERVICES tab:**

| Field | Set it to |
|---|---|
| **Enable SSH** | ✅ **Tick it.** |
| | Choose **"Use password authentication"** |

> **SSH is how you will talk to the Pi.** Without this tick, a headless Pi is a
> brick with a blinking light. This is the single most commonly forgotten step.

**OPTIONS tab:** leave the defaults.

Click **SAVE**, then **YES** to apply customisation, then **YES** to erase the card.

### 2c. Wait

Writing plus verifying takes 5–15 minutes. When it says **"Write Successful"**,
click **CONTINUE**, but **leave the card in the reader** — you are not done with it.

---

## Step 3 — Copy Radio Tower onto the card

Windows will have re-detected the card and may show the format warning. **Cancel it.**

1. Open File Explorer. Find the drive named **`bootfs`** (usually a ~512MB drive,
   containing files like `config.txt`, `cmdline.txt`, `kernel8.img`).
2. Create a new folder on it called exactly **`radiotower`** (lowercase, one word).
3. Copy the **entire contents** of your Radio Tower project folder into it —
   `server`, `public`, `scripts`, `deploy`, `docs`, `pi`, `music`,
   `package.json`, `package-lock.json`, `BRIEF.md`, all of it.

   **Do not copy `node_modules`** if it exists. It is large, it is full of
   x86 files that are wrong for the Pi, and the installer rebuilds it anyway.

You should end up with `bootfs\radiotower\package.json` existing.

### Where to keep the music

`bootfs` is only ~512MB, so it is a fine place for a **handful of test tracks**
and a bad place for a real library.

- **Small test set now:** put a few MP3s in `bootfs\radiotower\music\`. The
  installer copies them onto the Pi's own storage and then you can delete them
  from the card.
- **Your real library:** put the MP3s on a **USB stick**, plug it into the Pi,
  and the installer will find it automatically and point the station at it.
  This is also the easiest way to add music later — unplug, load, replug.

Either way, read `music/README.md` for the tagging rules and the one live-station
warning.

4. **Eject the card properly** (right-click → Eject). Yanking it mid-write is the
   classic way to corrupt a fresh install.

---

## Step 4 — Wire it up and boot

1. SD card into the Pi.
2. **Ethernet cable: Pi → any LAN port on your router.** (Not the WAN/Internet
   port, which is usually a different colour and sits on its own.)
3. Power last. Always power last.

The green LED will flicker as it reads the card. **First boot takes 2–4 minutes**
— it resizes the filesystem and reboots itself once. Be patient; it looks stuck
and is not.

---

## Step 5 — Log in from your laptop

Open **Windows Terminal** or **PowerShell** and type:

```powershell
ssh ortis@radiotower.local
```

Use the username you chose in step 2b.

- First time it asks *"Are you sure you want to continue connecting?"* → type `yes`
- Then your password. **Nothing appears as you type** — no dots, no stars. That
  is normal Linux behaviour, not a broken keyboard. Type it and press Enter.

**If `radiotower.local` doesn't resolve**, your Windows install isn't doing mDNS.
Find the Pi's IP address instead: log into your router's admin page (usually
`192.168.0.1` or `192.168.1.1`), look at the connected-devices list for
`radiotower`, and use that number:

```powershell
ssh ortis@192.168.1.42
```

Still nothing? → `pi/NETWORK.md`, which covers this and the direct-to-laptop setup.

---

## Step 6 — One command

You are now typing on the Pi.

```bash
sudo bash /boot/firmware/radiotower/pi/install.sh
```

It takes 5–15 minutes and narrates every step. It will:

1. check the machine, the OS, the network and the free space
2. install Node.js 22
3. copy the app to `/opt/radio-tower` and install its two dependencies
4. find your music (USB stick first, then the copy on the card)
5. write `/etc/radio-tower.env`
6. install a systemd service so the station starts on every boot
7. wait for it to answer a health check, then print your URL

If it stops, it tells you which step failed and what to run by hand. Nothing it
does is magic — every step is a command you could type yourself.

---

## Step 7 — Listen

On your phone, on the same Wi-Fi:

```
http://radiotower.local:8080
```

Tap **Tune in**.

Now open it on a second device. **Both should be on the same second of the same
track.** That is the whole point of the project — no syncing, no websockets, just
two machines computing the same function of the clock.

---

## Day-to-day

```bash
sudo systemctl status radiotower      # is it alive?
sudo journalctl -u radiotower -f      # watch the logs (Ctrl-C to stop)
sudo systemctl restart radiotower     # restart
curl -X POST http://127.0.0.1:8080/api/rescan   # pick up new music right now
```

**Adding music:** put files in the music directory the installer reported, then
rescan. ⚠️ Do it when nobody is listening — see the warning in `music/README.md`.

**Updating the code:** copy the changed files into `/opt/radio-tower` and
`sudo systemctl restart radiotower`. Or re-run `install.sh` after refreshing the
`radiotower` folder on the SD card.

**Shutting down:** `sudo shutdown -h now`, *then* pull the power. Yanking the
plug on a running Pi eventually corrupts the SD card.

---

## Going public

Right now the station only works inside your house. To hand a stranger a URL:

```bash
sudo bash /opt/radio-tower/scripts/setup-tunnel.sh
```

That sets up a Cloudflare Tunnel — no port forwarding, works behind CGNAT, and
your home IP address stays private. `docs/DEPLOY.md` has the detail.

> ⚠️ **Read this before you do.** Cloudflare's Service-Specific Terms (updated
> 2 June 2026) reserve the right to limit CDN use for *"a disproportionate
> percentage of pictures, audio files, or other large files"* without a paid
> plan. A radio station is, by definition, a disproportionate percentage of audio
> files. In practice hobby-scale self-hosters do this constantly without trouble
> — but the decision is yours, not an agent's. The options are in
> `docs/ROADMAP.md` § "Needs a ruling from Ortis": accept the risk, use an
> unproxied (grey-cloud) hostname so the audio bypasses the CDN, or use
> Tailscale Funnel / a cheap VPS instead.

---

## What's in this folder

| File | What it's for |
|---|---|
| `README.md` | This. The full walkthrough. |
| `install.sh` | The one command from step 6. |
| `NETWORK.md` | Ethernet to the router, plugging the Pi straight into your laptop, static IPs, and what to do when you cannot find the Pi. |
| `TROUBLESHOOTING.md` | Symptom → cause → fix, in the order things actually go wrong. |
| `CHECKLIST.md` | One page, tick as you go. Print it or keep it open on your phone. |

---

**Sources:** [Raspberry Pi Software / Imager](https://www.raspberrypi.com/software/) ·
[Raspberry Pi OS Trixie headless notes](https://blog.geekfarm.org/command-line-only-install-for-headless-raspberry-pi-os-trixie.html) ·
[Headless setup guide 2026](https://raspberrytips.com/raspberry-pi-headless-setup/)
