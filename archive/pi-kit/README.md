# The Pi kit — kept for reference, not run

Moved here on 2026-11-10. Ortis, that day: « pi is retired yes », then « move the pi kit to a local
folder archive for reference ». The station has run on the Oracle server since 2026-10-08
(`docs/LIVE.md`, `deploy/cloud/`); nothing live reads anything in this folder.

| Here | Was at | What it is |
|---|---|---|
| `pi/` | `pi/` | the blank-SD-card walkthrough, `install.sh`, the network notes, `anywhere/` (unknown Wi-Fi, tunnel, watchdog), `wifi/` |
| `usb/` | `usb/` | rebuilding the USB stick the Pi read its music from |
| `split/` | `split/` | cutting long mixes into tracks with ffmpeg (offline; he now plans to cut them in Audition) |
| `scripts/setup-pi.sh`, `scripts/setup-tunnel.sh` | `scripts/` | the wrapper around `pi/install.sh`; the Cloudflare Tunnel set-up |
| `deploy/radiotower.service`, `deploy/cloudflared-config.yml` | `deploy/` | the Pi's systemd unit and tunnel config |
| `tests/pi-*.test.js` | `tests/` | the 51 tests that held the kit (installer guards, script syntax, Wi-Fi, the anywhere kit) |
| `claude-tooling-to-install/` | the repo's root | the `tower-roamer` and `tower-curator` agents, their skills and commands, written 2026-09-23 and never installed |

Inside, every file is as it was and the folders keep their places relative to each other, so the
kit's own cross-references (`scripts/setup-pi.sh` → `pi/install.sh`, the tests → `../pi/…`) still
point at the right files. What no longer holds is anything reaching the rest of the repository
(`../server`, `../package.json`): the tests here are not part of `npm test` and are not expected
to pass from this folder.

Older documents (`docs/DECISIONS.md`, `docs/WORKLOG.md`, `docs/PICK-UP-AGAIN.md`, the handoffs)
name these files by their old paths. They are history and were not rewritten: read `pi/…` there
as `archive/pi-kit/pi/…`.

To bring the kit back: `git mv` each row to where it was, and restore the shell-syntax line in
`scripts/build-test.sh` (`find scripts pi -name '*.sh'`). It was last green on 2026-11-10 at
commit `a514543`.

The removal was tried in a copy first (2026-11-10, `docs/plans/PLAN-chat-and-moods.md`, step 0):
with these files gone, every other unit test passed and the site built.
