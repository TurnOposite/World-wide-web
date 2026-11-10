---
description: Check or set up Radio Tower's go-anywhere kit — known Wi-Fi, setup hotspot, your domain, watchdog — and say plainly what works and what only the real Pi can prove.
---

Use the `tower-roamer` agent for this.

1. Read `pi/anywhere/README.md`.
2. Run `node --test tests/pi-anywhere.test.js tests/pi-wifi.test.js` and report
   the counts.
3. If Ortis gave a situation ("I'm at X", "no Wi-Fi password", "new domain"),
   answer with the one path from the README that fits. Hand over any command
   with its shell named on the first line.
4. If he has the SD card in the laptop, offer `pi/anywhere/prepare-card.ps1`
   (RUN THIS IN: Windows PowerShell), and read `radiotower-status.txt` from
   `bootfs` if it's there.
5. Finish with one line per way online (Ethernet / known Wi-Fi / unknown
   Wi-Fi / domain): works, untested on hardware, or not set up.

$ARGUMENTS
