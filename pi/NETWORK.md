# Getting the Pi on the network

Three scenarios, in order of how much you'll like them.

---

## Scenario A — Pi plugged into the router (recommended)

**This is what you said you're doing, and it's the right choice.**

```
   [ Pi 4/5 ] --Ethernet--> [ Router LAN port ]
                                    |
                            [ your Wi-Fi ] --> phone, laptop
```

**Why it's better than Wi-Fi for this project:** no dropouts mid-track, no
2.4GHz congestion when the microwave runs, lower CPU (the Wi-Fi driver is not
free on a Pi), and a stable IP address. A radio station that stutters is a
broken radio station.

### Setup

Nothing to do. Plug the cable into any **LAN** port — not the WAN/Internet port,
which is usually a different colour and sits alone at one end. The Pi asks your
router for an address over DHCP and gets one within seconds of booting.

### Finding it

```powershell
ssh ortis@radiotower.local
```

If that name doesn't resolve, in order of effort:

1. **Router admin page.** `http://192.168.0.1` or `http://192.168.1.1` in a
   browser. Look for "Attached Devices", "DHCP Clients" or "Device List". You
   want the row named `radiotower`.
2. **Scan the network** from PowerShell:
   ```powershell
   arp -a | Select-String "192.168"
   ```
   Or install [Advanced IP Scanner](https://www.advanced-ip-scanner.com/) and
   look for a device whose manufacturer is "Raspberry Pi Trading".
3. **Plug in a monitor and keyboard** once, log in, and run `hostname -I`.

### Give it a permanent address (do this once you're happy)

Otherwise the IP can change after a power cut and your bookmarks break.

**Best way — from the router.** Find "DHCP Reservation" / "Static Lease" /
"Address Reservation" in your router's admin page, and bind the Pi's MAC address
to a fixed IP. Get the MAC with:

```bash
ip link show eth0 | grep ether
```

The router stays in charge, which means nothing can collide.

**Alternative — from the Pi.** Raspberry Pi OS uses NetworkManager now:

```bash
sudo nmcli con mod "Wired connection 1" \
  ipv4.method manual \
  ipv4.addresses 192.168.1.50/24 \
  ipv4.gateway 192.168.1.1 \
  ipv4.dns "1.1.1.1,8.8.8.8"
sudo nmcli con up "Wired connection 1"
```

Pick an address **outside your router's DHCP pool** (often `.100`–`.200`), or
two devices will eventually fight over it.

---

## Scenario B — Pi plugged straight into your laptop

Useful when there's no router nearby, or you're working on the Pi from a desk.
Modern Pi Ethernet ports auto-detect cable type, so a normal cable works — you
do **not** need a crossover cable.

```
   [ Pi 4/5 ] --Ethernet--> [ Laptop Ethernet port ]
                                    |
                            [ Laptop Wi-Fi ] --> internet
```

There's a catch: **nothing is handing out IP addresses.** Your router isn't in
the picture. Two ways to fix it.

### B1 — Windows Internet Connection Sharing (what you want)

This makes your laptop act as the Pi's router *and* gives it internet, which the
installer needs to download Node.js.

1. Press `Win+R`, type `ncpa.cpl`, press Enter. You'll see your network adapters.
2. Right-click your **Wi-Fi** adapter → **Properties** → **Sharing** tab.
3. Tick **"Allow other network users to connect through this computer's Internet
   connection."**
4. In the dropdown below, choose your **Ethernet** adapter.
5. OK. Windows sets the Ethernet adapter to `192.168.137.1` and starts a small
   DHCP server on it.
6. Plug in the Pi and power it on. It'll get something like `192.168.137.x`.

Find it:

```powershell
arp -a | Select-String "192.168.137"
ssh ortis@radiotower.local        # usually works too
```

> **Gotcha:** ICS resets itself after some Windows updates and after the laptop
> sleeps with the cable unplugged. If the Pi stops appearing, untick and re-tick
> the sharing box.

### B2 — Link-local, no internet

If you skip ICS, both machines fall back to self-assigned `169.254.x.x`
addresses. You can SSH in via `radiotower.local`, but **the Pi has no internet**,
so `install.sh` will stop at the "no internet" check — by design, because
`npm install` cannot work offline.

Use this only for poking at an already-installed Pi, never for the first install.

### The best of both

Plug the Pi into the router (Scenario A) **and** configure Wi-Fi in Raspberry Pi
Imager. Then it's reachable either way and the cable becomes optional.

---

## Scenario C — Wi-Fi only

Works, and it's the fallback if you ticked "Configure wireless LAN" during
flashing. Expect occasional buffering under load. Fine for testing, not what
you'd want for the station you hand to a stranger.

Change networks later, **if you can already reach the Pi**:

```bash
sudo nmcli device wifi list
sudo nmcli device wifi connect "YourSSID" password "yourpassword"
```

> **If you cannot reach the Pi — which is the usual case after a house move —
> see [`NEW-NETWORK.md`](./NEW-NETWORK.md).** You edit one text file on the SD
> card from any laptop and boot. No SSH, no monitor. That page also covers
> making the tower broadcast its own Wi-Fi so it works with no router at all.

---

## Making `radiotower.local` work

That address is **mDNS** (also called Bonjour or Avahi). The Pi announces itself;
your device has to be listening.

| Device | Works out of the box? |
|---|---|
| iPhone / iPad / Mac | Yes, always |
| Android 12+ | Usually |
| Windows 11 | Usually |
| Windows 10 | Sometimes — install [Bonjour Print Services](https://support.apple.com/kb/DL999) if not |
| Linux | Yes if `avahi-daemon` is running |

`install.sh` installs `avahi-daemon` on the Pi, which is the half you control.
The other half is the client device. **mDNS does not cross network segments** —
if your phone is on a "Guest" Wi-Fi and the Pi is on the main LAN, it will never
work. Put them on the same network.

When in doubt, use the raw IP. It always works.

---

## Which port?

The station listens on **8080** by default, on all interfaces (`HOST=0.0.0.0`),
so anything on your LAN can reach it. Change it in `/etc/radio-tower.env` and
`sudo systemctl restart radiotower`.

Ports below 1024 (like 80) need extra privileges the service deliberately does
not have. If you want `http://radiotower.local` with no `:8080`, don't run the
app as root — redirect instead:

```bash
sudo apt install -y nftables
sudo nft add table ip nat
sudo nft 'add chain ip nat prerouting { type nat hook prerouting priority -100 ; }'
sudo nft add rule ip nat prerouting tcp dport 80 redirect to :8080
```

Or just leave it. Once the Cloudflare Tunnel is up, the public URL has no port
number anyway.

---

## Quick diagnostics, on the Pi

```bash
ip -brief address              # what addresses do I have?
ip route | grep default        # do I have a way out?
ping -c3 1.1.1.1               # is the internet reachable?
ping -c3 google.com            # is DNS working? (if this fails but ^ works, it's DNS)
nmcli device status            # what does NetworkManager think?
sudo systemctl status avahi-daemon    # is .local advertising running?
ss -tlnp | grep 8080           # is the station actually listening?
```
