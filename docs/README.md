# docs/ — which file answers which question

The index exists so an agent picks the *current* document instead of the first
one whose name looked right. If you add a doc, add a line here.

Nothing in this folder was moved to create this index. Paths cited in
`DECISIONS.md` and `WORKLOG.md` are still true — that history is append-only
(`BRIEF.md` rule, and `CLAUDE.md` "Conventions"), and a tidy that made it lie
would cost more than the tidiness is worth.

## Start here

| Question | File |
|---|---|
| I have been away for a month. Where do I start? | [`PICK-UP-AGAIN.md`](./PICK-UP-AGAIN.md) — **read this one page first** |
| What is this project and what must not change? | [`../BRIEF.md`](../BRIEF.md) — **the constitution** |
| How do listeners stay in sync? | [`ARCHITECTURE.md`](./ARCHITECTURE.md) |
| Why is the code like this? | [`DECISIONS.md`](./DECISIONS.md) — append-only |
| What should I build next? | [`ROADMAP.md`](./ROADMAP.md) — ranked |
| What did previous runs do? | [`WORKLOG.md`](./WORKLOG.md) — append-only |
| Is this still heading the right way? | [`PLANNING.md`](./PLANNING.md) |

## Current authorities

Where two documents overlap, this column says which one wins.

| Subject | Authority | Superseded / historical |
|---|---|---|
| Identity, mark, colour, navigation, the Zone tab | **[`DESIGN-BRIEF.md`](./DESIGN-BRIEF.md)** | `IDENTITY-OPTIONS.md` is the menu that was chosen *from*. Do not edit it to match the outcome |
| Deploying to the Pi | **[`../pi/README.md`](../pi/README.md)** (blank card) and [`DEPLOY.md`](./DEPLOY.md) | — |
| Plugging the tower in anywhere — unknown Wi-Fi, your domain, keeping it live | **[`../pi/anywhere/README.md`](../pi/anywhere/README.md)** and [`../pi/anywhere/DOMAIN.md`](../pi/anywhere/DOMAIN.md) | `../scripts/setup-tunnel.sh named` (interactive login on the Pi) is the older route to a domain |
| Moving the tower to a new Wi-Fi network | **[`../pi/NEW-NETWORK.md`](../pi/NEW-NETWORK.md)** — the card-edit route, no SSH needed | `../pi/NETWORK.md` §"Scenario C" is the older, SSH-only answer and assumes you can already reach the Pi |
| Why design asks did not land, and how to write the next one | **[`DESIGN-POSTMORTEM.md`](./DESIGN-POSTMORTEM.md)** | `prompts/PROMPT-cache-and-stage-defaults.md` Jobs 2–3 are superseded by it |
| Updating a Pi that is already running | **[`RUNBOOK-update-2026-08-19.md`](./RUNBOOK-update-2026-08-19.md)** | the bundle's own `UPDATE-ME.txt` is wrong in three ways — see §3 of the runbook |
| Where the project stood on 2026-08-19 | **[`guides/STATE-OF-THE-STATION-2026-08-19.md`](./guides/STATE-OF-THE-STATION-2026-08-19.md)** | `HANDOFF-2026-08-19.md` is a mid-day snapshot; its test counts were later found wrong (`DECISIONS.md` line 1402) |

## Historical snapshots — read for context, never as current state

Added 2026-09-02, when Arthur asked whether this project needed the same tidy-up as
`Documents/Administratif`. **The answer was no, and the reason is at the top of this file:**
`DECISIONS.md` and `WORKLOG.md` cite these paths, and both are append-only. Moving them would
turn true history into dangling links. What was missing was not tidiness — it was that one of
them appeared in no index at all. Fixed here.

| File | What it is | Superseded by |
|---|---|---|
| [`HANDOFF-2026-08-19.md`](./HANDOFF-2026-08-19.md) | Mid-day snapshot, 19 August. **Its test counts were later found wrong** (`DECISIONS.md` l. 1402) | [`guides/STATE-OF-THE-STATION-2026-08-19.md`](./guides/STATE-OF-THE-STATION-2026-08-19.md) |
| [`HANDOFF-2026-08-20.md`](./HANDOFF-2026-08-20.md) | End of a session that ran out of budget. Records the three visualiser prompts, two deployed to the Pi and one written but never run | Nothing — it is the **last** narrative state before the 28 August hold. Read it after `PICK-UP-AGAIN.md`, not instead of it |

## guides/ — how to do a thing

| | |
|---|---|
| [`START-HERE-CLAUDE-CODE.md`](./guides/START-HERE-CLAUDE-CODE.md) | **the paste-ready prompts** — verify the build, run the DJ, fix the library, clean the USB |
| [`SPONTANEOUS-EMISSIONS.md`](./guides/SPONTANEOUS-EMISSIONS.md) | change what's playing right now, from the DJ booth. Includes the Claude Code prompts |
| [`STATE-OF-THE-STATION-2026-08-19.md`](./guides/STATE-OF-THE-STATION-2026-08-19.md) | what today's runs did, and the measured answer to "the music sucks" |
| [`USB-CLEANUP.md`](./guides/USB-CLEANUP.md) | rebuilding the USB stick so the installer can't adopt the wrong library |

## prompts/ — the briefs that were actually pasted in

[`prompts/README.md`](./prompts/README.md) records which of the three have been
run and which are superseded. They moved here from the repo root on
2026-08-28; they are kept because the gap between what a brief *asked for* and
what the worklog records as *built* is itself worth being able to read.

## Assets

`identity-marks.png`, `visualizer-desktop.png`, `visualizer-mobile.png`,
`ARCHITECTURE-MAP.html`. Left in place — several are cited from the worklog by
that path.

## Elsewhere in the repo

| | |
|---|---|
| [`../dj/CLAUDE.md`](../dj/CLAUDE.md) | the DJ booth's brief. Standalone: `cd dj && claude` |
| [`../usb/README.md`](../usb/README.md) | the USB rebuild kit |
| [`../split/README.md`](../split/README.md) | cutting the long mixes into tracks — the highest-value fix to how the station sounds |
| [`../pi/`](../pi/) | blank-SD-card walkthrough, network notes, troubleshooting, `install.sh` |
| [`../.claude/`](../.claude/) | the project's own agents, skills and commands |
| `../archive/` | build debris kept rather than deleted: the old architecture PDF, the superseded SD-card zip |
