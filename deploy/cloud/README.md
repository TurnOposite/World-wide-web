# The tower in the cloud — Oracle "Always Free"

A free server that never sleeps, with room for the whole library: 200 GB of
disk and 10 TB of traffic a month. It runs exactly the code the Raspberry Pi
runs, serves the whole website itself, and takes new music from the laptop's
library bot. Chosen 2026-10-07 (`docs/DECISIONS.md`).

You do three things by hand: create the account, create the server (pasting
one script), and open two ports. The script does the rest on first boot.

## 1. The account (once)

<https://signup.cloud.oracle.com> — Account type **Individual**. **Home
region is permanent**: France Central (Paris) or Netherlands Northwest
(Amsterdam); avoid Frankfurt and London, the most crowded for free servers.
The card is an identity check (a ~€1 hold at most); you stay on the free tier.

## 2. The server (once, ~5 minutes)

cloud.oracle.com → ☰ → **Compute → Instances → Create instance**.

| Setting | Choose |
|---|---|
| Name | `radio-tower` |
| Image | **Change image → Ubuntu → Canonical Ubuntu 24.04** (not "Minimal") |
| Shape | **Change shape → Ampere → VM.Standard.A1.Flex**, 2 OCPUs, 12 GB. *If creation later says "Out of capacity": try again in an hour, or pick **AMD → VM.Standard.E2.1.Micro** (also free — the tower fits in it).* |
| Networking | leave the default (new virtual cloud network, public subnet), **Assign a public IPv4 address: Yes** |
| SSH keys | **Generate a key pair for me → Save private key.** Keep the file; it is only needed for repairs. |
| Boot volume | **Specify a custom boot volume size: 150 GB** (the free allowance is 200 GB in total) |
| Advanced options → Management | **Paste cloud-init script** → paste *your* `first-boot.sh` — the copy with your station key in it, not the one in this folder |

**Create.** When the state is **Running**, note the **Public IP address**.

## 3. Open the doors (once)

On the instance page: **Primary VNIC → Subnet → Security** (or **Security
lists**) → **Default Security List → Add Ingress Rules**, twice:

| Source CIDR | IP protocol | Destination port |
|---|---|---|
| `0.0.0.0/0` | TCP | `80` |
| `0.0.0.0/0` | TCP | `443` |

## 4. Listen

About ten minutes after creation, open

    https://<your IP with dashes instead of dots>.sslip.io/

— for `132.145.10.20` that is `https://132-145-10-20.sslip.io/`. The odd
name is free, needs no account, and gets a real HTTPS certificate. (Own
domain later? Point it at the IP and set `TOWER_HOST` — see `install.sh`.)

It plays nothing yet: the library is empty. On the laptop, put the address and
key in `library\tower.json`:

```json
{ "url": "https://132-145-10-20.sslip.io", "key": "your station key" }
```

then **Windows PowerShell**, in the `Radio Tower` folder:

```powershell
node library\bot.mjs publish
```

It sends only what the tower does not have yet, so stopping and starting
again is fine. From then on `watch.cmd` sends new songs up by itself, a minute
after it files them.

## 5. Keep it (recommended)

Oracle may reclaim an *Always Free* server it thinks is idle for a week, and
a radio with nobody listening uses very little. Upgrading the account to
**Pay As You Go** (☰ → Billing → Upgrade) stops that and costs nothing while
you stay inside the free shapes. Set a budget alert of €1 at the same time
(☰ → Billing → Budgets) so a mistake can never cost more than a coffee.

## If something is wrong

| Symptom | Look at |
|---|---|
| The address does not load at all | The two ingress rules (step 3). Then the install log: Instance → **Console connection → Launch Cloud Shell connection**, `sudo tail -50 /var/log/radio-tower-install.log` |
| "Your connection is not private" | The certificate is still being issued — give it two minutes |
| Loads, no music | The library is empty: `node library\bot.mjs publish` on the laptop |
| `publish` says the tower refused the key | `library\tower.json` key ≠ the one in your `first-boot.sh` |
| Want the key back | Cloud Shell connection, `sudo cat /srv/radio/TOWER.txt` |

The server updates its own code from GitHub every night at about 04:20 and
restarts only when something changed. The music and the settings are never
touched by an update.
