# Radio Tower — SD card checklist

One page. Tick as you go.

## Before you start
- [ ] Raspberry Pi 4 or 5
- [ ] Official USB-C power supply *(not a phone charger)*
- [ ] microSD card, 32GB+
- [ ] SD card reader on the laptop
- [ ] Ethernet cable
- [ ] Free LAN port on the router

## Flash
- [ ] Raspberry Pi Imager installed — https://www.raspberrypi.com/software/
- [ ] Device: Raspberry Pi 5 (or 4)
- [ ] OS: **Raspberry Pi OS Lite (64-bit)**
- [ ] Storage: the SD card *(check the size — twice)*
- [ ] EDIT SETTINGS → General:
  - [ ] Hostname `radiotower`
  - [ ] Username + password *(written down somewhere)*
  - [ ] Wi-Fi SSID + password *(safety net)*
  - [ ] Wi-Fi country `ZA`
  - [ ] Time zone **`Africa/Johannesburg`** ← the schedule depends on this
- [ ] EDIT SETTINGS → Services:
  - [ ] **Enable SSH** ✅ ← most-forgotten step
  - [ ] Password authentication
- [ ] SAVE → YES → YES
- [ ] "Write Successful"

## Copy
- [ ] Cancel the "format this disk" popup — **never Format**
- [ ] Open the drive named `bootfs`
- [ ] New folder: `radiotower` *(exact, lowercase)*
- [ ] Copy the whole project in — **not `node_modules`**
- [ ] `bootfs\radiotower\package.json` exists
- [ ] A few MP3s in `bootfs\radiotower\music\` *(or on a USB stick)*
- [ ] Eject the card properly

## Boot
- [ ] Card in the Pi
- [ ] Ethernet → router **LAN** port *(not WAN)*
- [ ] Power **last**
- [ ] Wait 2–4 minutes *(it reboots itself once — normal)*

## Install
- [ ] `ssh ortis@radiotower.local` → `yes` → password *(nothing shows as you type)*
- [ ] `sudo bash /boot/firmware/radiotower/pi/install.sh`
- [ ] Wait 5–15 min
- [ ] It prints a URL

## Listen
- [ ] `http://radiotower.local:8080` on your phone
- [ ] Tap **Tune in**
- [ ] Open on a second device — **same second of the same track**

## Later
- [ ] Reserve a static IP on the router
- [ ] Read the Cloudflare warning in `pi/README.md` § Going public
- [ ] `sudo bash /opt/radio-tower/scripts/setup-tunnel.sh`

**Stuck?** → `pi/TROUBLESHOOTING.md` · **Network?** → `pi/NETWORK.md`
