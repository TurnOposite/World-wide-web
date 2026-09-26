# Runbook — deploying the 2026-08-19 update from USB

**Paste the block in §2 into Claude Code on the Pi.** It is written to be run by
an agent with a shell, not typed by hand. It supersedes `UPDATE-ME.txt` inside
the bundle, which has one wrong instruction (see §3).

---

## 1. USB or SD card?

**Just plug the USB in.** You never write to the SD card by hand.

The SD card holds the OS and the live install at `/opt/radio-tower`. The USB is
only a courier: you mount it, copy the zip off, and `install.sh` rsyncs the new
code onto the SD card for you. Nothing about this update needs the card removed,
reflashed, or touched.

**But this particular stick is booby-trapped**, and it is worth understanding why
rather than just following the workaround.

`pi/install.sh` step 5 ("Finding your music") scans `/media/*/*` and `/mnt/*` for
audio files. If it finds any, it repoints `MUSIC_DIR` at that location:

```bash
for M in /media/*/* /mnt/*; do
  C=$(count_audio "$M")
  if [[ "$C" -gt 0 ]]; then
    MUSIC_DIR="$M"; FOUND=$C; break
  fi
done
```

This USB carries **515 MP3s** (`E:\Music`, 42; `E:\Behold the backkup`, 471). So
if you mount it at `/mnt/usb` and run the installer, the installer decides your
music library *is the USB stick* — which you then unplug, and the station goes to
dead air.

**Two things that do NOT save you:**

- Setting `MUSIC_DIR` explicitly. `MUSIC_DIR="${MUSIC_DIR:-/mnt/music}"` sets the
  default, then the scan **overwrites it anyway**. The loop only skips a path if
  it is *already* equal to `MUSIC_DIR`. An explicit value is not respected.
- Assuming `/etc/radio-tower.env` will protect you. It genuinely does — step 6
  leaves an existing env file alone — but that is a side effect, not a guard, and
  it is one `rm` away from not being true. Check it, don't trust it.

**The fix used below:** mount the stick somewhere the scan does not look
(`/root/usbsrc`, not under `/mnt` or `/media`), copy the zip off, and unmount it
before the installer runs. Then there is nothing to misdetect. This is more
robust than remembering a flag.

---

## 2. The prompt

Paste this whole block into Claude Code on the Pi.

```text
Deploy the Radio Tower update from the USB stick. Work carefully and stop at the
first thing that looks wrong — I am not watching, and a broken station is worse
than an undeployed update.

Context you need:
- The bundle is radiotower-update-2026-08-19.zip on a USB stick. It unzips flat
  (server/ public/ scripts/ tests/ pi/ docs/). Code only, no music.
- The live install is /opt/radio-tower, service `radiotower`, env
  /etc/radio-tower.env.
- CRITICAL: this USB stick also carries ~515 MP3s. pi/install.sh step 5 scans
  /media/*/* and /mnt/* for audio and repoints MUSIC_DIR at whatever it finds.
  Setting MUSIC_DIR explicitly does NOT prevent this — the scan overwrites it.
  So the stick must be mounted OUTSIDE /mnt and /media, and unmounted before
  the installer runs.

Do this:

1. PRE-FLIGHT. Print, and stop if any is surprising:
   - `systemctl is-active radiotower` and `curl -s localhost:8080/api/health`
   - `grep MUSIC_DIR /etc/radio-tower.env`  (if this file does not exist, STOP
     and tell me — the installer would generate a new one pointing at the USB)
   - `lsblk -f` to identify the stick's partition. Do not assume /dev/sda1.

2. MOUNT OUTSIDE THE SCAN PATH and get the zip off:
     sudo mkdir -p /root/usbsrc
     sudo mount -o ro /dev/<the partition you found> /root/usbsrc
     mkdir -p ~/rt-update && cd ~/rt-update
     unzip -o /root/usbsrc/radiotower-update-2026-08-19.zip
     sudo umount /root/usbsrc
   Verify the unzip landed scripts/build-test.sh before unmounting.
   Confirm nothing audio-bearing is left mounted: `ls /mnt /media/*` .

3. BACK UP FIRST — the installer does a bare `rsync -a --delete` onto
   /opt/radio-tower and creates NO backup of its own, despite what the bundle's
   UPDATE-ME.txt claims. There is no rollback unless you make one:
     sudo systemctl stop radiotower
     sudo rsync -a --delete /opt/radio-tower/ /opt/radio-tower.bak/
     sudo cp /etc/radio-tower.env /etc/radio-tower.env.bak
   Confirm the backup is non-empty before continuing.

4. PROVE THE NEW CODE before installing it:
     cd ~/rt-update && npm install
     bash scripts/build-test.sh --no-browser
   This must exit 0. If it does not: do NOT install. Restart the old service
   (`sudo systemctl start radiotower`), show me the failure, and stop.

5. INSTALL:
     cd ~/rt-update && sudo bash scripts/setup-pi.sh
   setup-pi.sh restarts the service itself — no separate restart needed.

6. VERIFY, and actually read the output rather than just running it:
     grep MUSIC_DIR /etc/radio-tower.env     # must be UNCHANGED from step 1
     cd /opt/radio-tower && npm run healthcheck
     npm run scan                            # track count + anything skipped
   The track count must match what it was before. If MUSIC_DIR moved or the
   count collapsed, roll back immediately:
     sudo systemctl stop radiotower
     sudo rsync -a --delete /opt/radio-tower.bak/ /opt/radio-tower/
     sudo cp /etc/radio-tower.env.bak /etc/radio-tower.env
     sudo systemctl start radiotower

7. Tell me the Pi's LAN IP so I can open http://<ip>:8080 on my phone, and
   report: tests before/after, track count before/after, and whether MUSIC_DIR
   moved.

8. HOUSEKEEPING in the project folder on my laptop's copy — delete the two
   leftovers you spotted: the 0-byte radiotower-update-2026-08-19.zip and the
   stray 1.5MB temp file ziMEwVaZ, both in the project root. They are build
   debris; the real bundle is the one on the USB.

Do not weaken or skip the self-test to get through this.
```

---

## 3. What was wrong in the bundle's `UPDATE-ME.txt`

Recorded so it is fixed at the source rather than worked around forever:

1. **The rollback instruction is fiction.** It says to restore from
   `/opt/radio-tower.bak/`. `pi/install.sh:145` is a bare `rsync -a --delete`
   and never creates that directory. Following the runbook as written would
   leave you with no rollback at the exact moment you needed one.
2. **The mount line dropped the `mkdir -p /mnt/usb`** when it was summarised
   into chat, so the mount fails outright.
3. **It mounts under `/mnt`**, which is precisely where the installer's music
   scan looks. See §1.

Fixes are ranked as **roadmap #25**.
