# When it doesn't work

Ordered roughly by how often each one actually happens.

---

## Nothing happens when I power the Pi on

**No LEDs at all** → power supply or cable. Use the official Pi PSU. A phone
charger that "fits" is the number one cause of Pi problems and it never looks
like a power problem — it looks like random crashes.

**Red LED on, green LED never flickers** → the Pi cannot read the SD card.
Re-flash it. If it fails twice, the card is bad; cheap cards fail constantly.

**Green flickers then stops, nothing on the network** → it booted but couldn't
get an address, or SSH is off. See the next two sections.

---

## `ssh: Could not resolve hostname radiotower.local`

Your laptop can't do mDNS, or the Pi isn't up. In order:

1. Wait. **First boot takes 2–4 minutes** and includes a self-reboot.
2. Find the IP from your router's admin page and SSH to that instead.
3. `pi/NETWORK.md` § "Making radiotower.local work".

---

## `Connection refused` or `Connection timed out` on SSH

Almost always: **you forgot to tick "Enable SSH"** in Raspberry Pi Imager's
Services tab.

There is no way to switch it on remotely — that's the point of it. Fix it one of
two ways:

- **Re-flash**, and this time tick the box. Fastest, and you lose nothing since
  the card is fresh.
- **Or** put the card back in your laptop and create an empty file named exactly
  `ssh` (no extension) in the root of the `bootfs` partition. Windows will fight
  you about the extension — use `cmd`:
  ```cmd
  echo. > D:\ssh
  del D:\ssh.txt
  ```
  (Replace `D:` with your `bootfs` drive letter.) Then boot again.

---

## `Permission denied (publickey,password)`

Wrong username or password. The username is whatever you typed in Imager's
General tab, **not** `pi` unless you chose that.

There is no password recovery. If you can't remember it, re-flash — it takes
15 minutes and you've lost nothing yet.

---

## The installer says "no internet"

It refuses to continue because `npm install` genuinely cannot work offline.

```bash
ip -brief address        # do you have an address that isn't 169.254.x.x?
ip route | grep default  # is there a default route?
ping -c3 1.1.1.1         # raw connectivity
ping -c3 google.com      # DNS
```

- Address is `169.254.x.x` → nothing is giving out DHCP. You're plugged into the
  WAN port, or straight into a laptop without ICS. See `pi/NETWORK.md` § B1.
- `1.1.1.1` works but `google.com` doesn't → DNS.
  `sudo nmcli con mod "Wired connection 1" ipv4.dns "1.1.1.1,8.8.8.8" && sudo nmcli con up "Wired connection 1"`

---

## The installer says it can't find the app at /boot/firmware/radiotower

```bash
ls /boot/firmware/
```

- Folder isn't there → you copied it to the wrong partition, or to the card's
  root instead of into a `radiotower` folder. It must be
  `bootfs\radiotower\package.json`.
- Folder is there but empty → Windows was still writing when you pulled the card.
  Always eject properly.
- Name is `Radiotower` or `radio-tower` → Linux is case-sensitive and picky.
  Exactly `radiotower`.

---

## npm install fails

Run it by hand to see the real error:

```bash
cd /opt/radio-tower && sudo npm install --omit=dev
```

- **`ENOSPC` / no space left** → `df -h`. Expand the filesystem:
  `sudo raspi-config --expand-rootfs && sudo reboot`
- **Network timeouts** → weak Wi-Fi. Use the cable.
- **`EACCES`** → you dropped the `sudo`.

---

## The station starts but says "Dead air"

No audio files found. Check what it's looking at:

```bash
grep MUSIC_DIR /etc/radio-tower.env
ls -la /mnt/music
```

- Directory is empty → add music, then
  `curl -X POST http://127.0.0.1:8080/api/rescan`
- Files are there but not seen → permissions. The service runs as `radiotower`,
  which needs read access:
  ```bash
  sudo chmod a+rx /mnt/music
  sudo find /mnt/music -type f -exec chmod a+r {} \;
  sudo systemctl restart radiotower
  ```
- Files are there and readable → unsupported format. Check the extension against
  the list in `music/README.md`. `.wma` and `.aiff` are not supported.

---

## "Warming up" and it stays that way

The first scan reads metadata from every file. On a big library over USB 2.0
this genuinely takes minutes. Watch it:

```bash
sudo journalctl -u radiotower -f
```

If there's no progress at all after ten minutes, something is wrong with the
drive — `dmesg | tail -30` will usually show USB errors.

---

## Audio stutters or cuts out

1. **Power.** Again. An underpowered Pi throttles.
   `vcgencmd get_throttled` — anything other than `throttled=0x0` means a power
   or heat problem.
2. **Wi-Fi.** Use the Ethernet cable.
3. **Slow SD card.** Test it: `sudo hdparm -t /dev/mmcblk0`. Under ~20MB/s and
   the card is the bottleneck.
4. **Too many listeners.** Check your actual upload speed — every listener is a
   separate audio stream out of your house.

---

## Everyone hears a different part of the song

The whole design says this can't happen — unless the clocks disagree.

```bash
timedatectl
```

You want `System clock synchronized: yes` and `NTP service: active`. If not:

```bash
sudo timedatectl set-ntp true
sudo systemctl restart systemd-timesyncd
```

Also check the time zone is `Africa/Johannesburg` (`sudo raspi-config` →
Localisation). And confirm the listener's *own* device clock is right — the
player corrects for skew, but a phone that's an hour off is beyond saving.

---

## The music jumped to a completely different song for everyone

**This is a known bug, not a mystery.** Adding or removing one track re-deals the
entire programme — by hours, not seconds. If you dropped a file into the music
folder within the last 30 minutes, that's what happened.

Roadmap item #5. Until it's fixed: **add music when nobody is listening.**

---

## It doesn't come back after a reboot

```bash
sudo systemctl is-enabled radiotower    # should say "enabled"
sudo systemctl enable radiotower        # if it doesn't
```

If it's enabled but fails on boot, it's probably starting before the USB drive
mounts. Check with `sudo journalctl -u radiotower -b` and look at the first
error. The fix is a `RequiresMountsFor=` line in the unit — worth filing on the
roadmap if it bites you.

---

## Starting over

Nothing here is precious. Re-flash the card and run through `pi/README.md` again
— you'll do it in 20 minutes the second time. The only thing you'd lose is
`/etc/radio-tower.env`, which the installer regenerates.

**The one thing to preserve:** if the station has ever been public, keep
`STATION_EPOCH` identical. Changing it re-deals the entire programme for good.
Copy the line out of `/etc/radio-tower.env` before you wipe anything.

---

## Getting help from the coding agent

Capture the evidence first — a paste of real output beats a description:

```bash
sudo journalctl -u radiotower -n 100 --no-pager > /tmp/tower.log
curl -s http://127.0.0.1:8080/api/health
uname -a; node -v; free -h; df -h /
```

Then hand it over and say what you expected instead.
