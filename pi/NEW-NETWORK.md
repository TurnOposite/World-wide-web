# Moving the tower to a new Wi-Fi network

**The short version:** put the SD card in your laptop, edit one text file,
put it back, power on. You never SSH in, and you never need a monitor.

This exists because of a specific trap. A Pi that only knows one Wi-Fi
network becomes unreachable the moment that network stops existing — and the
usual way to tell it about a new network is to SSH in, which needs the network
you no longer have. If you are reading this after a house move, or with a
router you will never see again, this is the page you want.

> **Don't know the network in advance?** Since 2026-09-23 you don't need to:
> when nothing on this list is in range, the tower makes a **Radio Tower
> Setup** Wi-Fi and you pick the router from your phone —
> [`anywhere/README.md`](anywhere/README.md), "A Wi-Fi you've never seen".

> **Don't know the network in advance?** Since 2026-09-23 you don't need to:
> when nothing on this list is in range, the tower makes a **Radio Tower
> Setup** Wi-Fi and you pick the router from your phone —
> [`anywhere/README.md`](anywhere/README.md), "A Wi-Fi you've never seen".

---

## The procedure

### 1. Power the Pi down and take the card out

Pull the power only after `sudo shutdown -h now` if you can still reach it.
If you cannot reach it, pulling the plug is acceptable — the station holds no
state worth losing (the schedule is derived from the clock, not stored).

### 2. Put the card in a computer

You will see **one** partition, a small FAT32 one. Windows calls it `bootfs`
and gives it a drive letter. macOS mounts it as `bootfs` too. Ignore any
warning about the card needing to be formatted — that is Windows failing to
read the *other*, Linux partition, and it is not broken. **Do not let it
format anything.**

### 3. Edit `radiotower-wifi.txt`

On the card you will find `radiotower-wifi.txt.example`. Copy it to
`radiotower-wifi.txt` (same folder, name it exactly that) and open it in
Notepad or TextEdit. The whole format is one network per line:

```
My New Router | thepassword
```

Everything before the `|` is the network name, everything after it is the
password. Put the network you actually want on the first line — when several
are in range, the tower prefers whichever is listed highest.

A phone hotspot on the second line is worth having. It means you can always
reach the tower by turning tethering on, wherever the two of you are.

### 4. Put the card back and power on

Give it a minute. Then:

```
http://radiotower.local:8080
```

If that name doesn't resolve, find the Pi's address on your router's admin
page (look for a device called `radiotower`) and use `http://<that-ip>:8080`.
`pi/NETWORK.md` has the longer version of finding it.

---

## When there is no router at all

The tower can broadcast its own Wi-Fi instead of joining one. Uncomment this
line in `radiotower-wifi.txt`:

```
HOTSPOT = Radio Tower | towerpassword
```

If none of the listed networks can be reached, the Pi comes up as an access
point with that name. Join it from a phone and open:

```
http://10.42.0.1:8080
```

There is no internet on that network — it is the tower and whoever joins it.
Which, for a radio station, is enough. This is what makes the thing portable:
a Pi, a power bank, and a room full of people who can all hear the same track
at the same second with no infrastructure whatsoever.

The password must be **at least 8 characters** or WPA refuses it, and the
script will tell you so rather than coming up unprotected.

---

## What is actually happening

| | |
|---|---|
| `/boot/firmware/radiotower-wifi.txt` | the file you edit. On the FAT32 partition precisely so a Windows machine can write it |
| `/usr/local/sbin/radiotower-network` | reads that file and turns each line into a NetworkManager profile |
| `radiotower-network.service` | runs it on **every** boot, before the station starts |

Every boot, not just the first — so one card can move between houses as often
as you like, and re-editing the file is always enough.

Because it runs before `radiotower.service`, the station starts with an
address already in hand, which is what makes `radiotower.local` resolve on the
first try rather than after a wait.

If it fails, the station still starts. Being on the wrong network is not a
reason to also be silent — a tower on Ethernet, or on a network it already
knew, should not be taken down by a Wi-Fi file it could not parse.

---

## Checking it by hand

Once you are back in over SSH:

```bash
sudo radiotower-network --status     # what it read, and what is connected now
sudo radiotower-network --dry-run    # the exact nmcli plan, changes nothing
sudo radiotower-network              # apply it again
journalctl -u radiotower-network     # what happened on the last boot
```

`--dry-run` is the one to reach for when a network refuses to connect and you
want to see what the file actually parsed to, rather than what you meant.

---

## Doing it without the file

If you can already reach the Pi, you never needed any of this:

```bash
sudo nmcli device wifi list
sudo nmcli device wifi connect "YourSSID" password "yourpassword"
```

That is also the escape hatch for the one case the file cannot express: a
password containing a `|`.

---

## Two honest warnings

**The passwords are readable.** The boot partition is FAT32, which has no
file permissions, so anyone who puts the card in a computer can read them.
That is the direct cost of being able to fix the network without logging in.
Once the tower has booted successfully, NetworkManager has stored the network
itself and you can delete the lines — it will keep reconnecting without them.

**The parser and the plan are tested; the radio is not.** `tests/pi-wifi.test.js`
drives this script in `--dry-run` on every self-test run and checks the
parsing, the priority ordering, the Windows line-ending case and the
`nmcli` plan it produces. What no test on a laptop can prove is that `nmcli`
accepts those arguments on the Pi in front of you and that the hotspot comes
up. **Try it once while you can still reach the Pi another way** — add your
phone's hotspot as a second line, confirm the tower joins it, and then you
know the mechanism works before you need it to.
