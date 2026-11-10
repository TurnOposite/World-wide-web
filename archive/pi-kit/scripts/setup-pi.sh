#!/usr/bin/env bash
#
# Radio Tower — compatibility wrapper. The real installer is pi/install.sh.
#
# This used to be a second, separate installer with its own copy of the same
# logic — and it had already started to drift from pi/install.sh (a stale
# Node-version guard, a different default service user, no HTTP-based network
# check). See docs/DECISIONS.md 2026-08-18, "Reconciling the two Pi
# installers", for the comparison and why this direction won rather than the
# other way around. Keeping two installers that could disagree again was the
# actual risk, not which one survived.
#
# What changed for you: nothing, if you already run this as
#   sudo bash scripts/setup-pi.sh
# from an already-cloned or already-copied checkout on the Pi — that is
# exactly what this now does, just via pi/install.sh's better-tested code
# path (it also runs a few more sanity checks: model, architecture, free
# disk space, and a real HTTP reachability check instead of ICMP ping).
#
# Setting up a brand-new Pi from a blank SD card? Start at pi/README.md
# instead — it is the from-scratch, no-prior-Pi-experience walkthrough this
# script was never designed to be.

set -euo pipefail
SRC_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# PAYLOAD_DIR is pi/install.sh's name for "where is the app payload" — for
# this wrapper's use case (already on the Pi, already a checkout) that is
# simply this repo's own root. Every other variable (APP_DIR, MUSIC_DIR,
# SERVICE_USER, NODE_MAJOR, PORT, ENV_FILE, SYSTEMD_UNIT_PATH) already uses
# the same name in both scripts, so anything already exported for the old
# setup-pi.sh keeps working unchanged.
export PAYLOAD_DIR="${PAYLOAD_DIR:-$SRC_DIR}"

exec bash "$SRC_DIR/pi/install.sh"
