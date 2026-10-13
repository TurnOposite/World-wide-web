#!/usr/bin/env bash
# Radio Tower — daily code update on the cloud tower (installed as
# /usr/local/bin/radio-tower-update by deploy/cloud/install.sh, run by
# radio-tower-update.timer). Pulls the branch the tower was installed from;
# restarts only when the code actually changed, so a quiet day is a no-op.
# The music and the settings are never touched.
#
# Four rules (docs/DECISIONS.md 2026-10-13):
#   - Only code whose self-test passed on GitHub goes on air. A commit CI
#     failed, or has not finished, waits for a later night; a commit CI never
#     ran on (only the DJ's control.json changed) goes ahead.
#   - What is on air is the commit recorded in DEPLOYED, not whatever git
#     holds: an update that failed half-way (npm, the network) is retried the
#     next night instead of being taken for done.
#   - After the restart the station must answer. If it does not, the previous
#     commit goes back on air and the new one is set aside (REJECTED) until a
#     newer commit arrives — no nightly outage retrying the same mistake.
#   - The updater keeps itself current: after a good update this file is
#     re-installed from the repository.
#
# Every outside command can be swapped (TOWER_*), which is how
# tests/cloud-update.test.js drives it without a server.
set -euo pipefail

APP="${TOWER_APP:-/opt/radio-tower}"
DEPLOYED="${TOWER_DEPLOYED:-/srv/radio/deployed-commit}"
REJECTED="${TOWER_REJECTED:-/srv/radio/rejected-commit}"
SELF="${TOWER_UPDATER:-/usr/local/bin/radio-tower-update}"
HEALTH="${TOWER_HEALTH:-http://127.0.0.1:8080/api/health}"
API="${TOWER_CI_API:-https://api.github.com}"
WORKFLOW="${TOWER_CI_WORKFLOW:-self-test}"
NPM="${TOWER_NPM:-npm}"
SYSTEMCTL="${TOWER_SYSTEMCTL:-systemctl}"
CURL="${TOWER_CURL:-curl}"
TRIES="${TOWER_HEALTH_TRIES:-30}"
WAIT="${TOWER_HEALTH_WAIT:-2}"

say() { echo "radio-tower: $*"; }
short() { printf '%.7s' "$1"; }

cd "$APP"
branch="$(git rev-parse --abbrev-ref HEAD)"
git fetch --quiet --depth 1 origin "$branch"
target="$(git rev-parse "origin/$branch")"
current="$(cat "$DEPLOYED" 2>/dev/null || git rev-parse HEAD)"

if [ "$target" = "$current" ]; then
  say "already up to date ($(short "$target"))"
  exit 0
fi
if [ "$target" = "$(cat "$REJECTED" 2>/dev/null || true)" ]; then
  say "$(short "$target") did not come up last time — waiting for a newer commit"
  exit 0
fi

# GitHub's verdict on a commit: success | failure | pending | none | unknown.
# "none": no self-test run exists for it (CI ignores control.json-only pushes).
verdict() {
  local repo json
  repo="$(git remote get-url origin | sed -E 's#^(https://github\.com/|git@github\.com:)##; s#\.git$##')"
  json="$("$CURL" -fsS --max-time 20 -H 'Accept: application/vnd.github+json' \
    "$API/repos/$repo/actions/runs?head_sha=$1&per_page=20" 2>/dev/null)" || { echo unknown; return; }
  printf '%s' "$json" | WORKFLOW="$WORKFLOW" node -e '
    let raw = "";
    process.stdin.on("data", (c) => { raw += c; }).on("end", () => {
      let runs;
      try { runs = JSON.parse(raw).workflow_runs; } catch { return console.log("unknown"); }
      if (!Array.isArray(runs)) return console.log("unknown");
      const ours = runs.filter((r) => r.name === process.env.WORKFLOW)
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || (b.run_attempt || 0) - (a.run_attempt || 0));
      if (!ours.length) return console.log("none");
      const last = ours[0];
      if (last.status !== "completed") return console.log("pending");
      console.log(last.conclusion === "success" ? "success" : "failure");
    });'
}

if [ "${TOWER_SKIP_CI:-0}" = 1 ]; then
  ci=skipped
else
  ci="$(verdict "$target")"
fi
case "$ci" in
  success|skipped) ;;
  none) say "no self-test ran on $(short "$target") (only control.json changed?) — updating" ;;
  unknown) say "could not read GitHub's verdict on $(short "$target") — updating anyway" ;;
  *)
    say "not updating to $(short "$target"): its self-test is $ci on GitHub — staying on $(short "$current")"
    exit 0
    ;;
esac

# Each step chained with &&: errexit does not apply inside a function called
# from an `if`, so a failure has to be passed up by hand.
build() {
  git reset --quiet --hard "$1" &&
    "$NPM" ci --omit=dev --no-audit --no-fund &&
    SITE_TOWER='' SITE_DIST="$APP/dist-tower" node scripts/site-build.mjs
}
answers() {
  local i
  for ((i = 0; i < TRIES; i++)); do
    "$CURL" -fsS --max-time 3 "$HEALTH" >/dev/null 2>&1 && return 0
    sleep "$WAIT"
  done
  return 1
}
say "updating $(short "$current") → $(short "$target")"

# A build that fails (npm, the network) says nothing against the commit: the
# station keeps running what it runs — nothing was restarted — the files go
# back to match it, and tomorrow night tries again.
if ! build "$target"; then
  say "could not build $(short "$target") — the station keeps $(short "$current"); trying again tomorrow"
  build "$current" || say "…and could not rebuild $(short "$current") either: the station runs, but do not restart it before this is fixed"
  exit 1
fi

if "$SYSTEMCTL" restart radio-tower && answers; then
  echo "$target" > "$DEPLOYED"
  say "on air: $(short "$target")"
  # Last, and in one line: bash is reading this very file.
  install -m 755 "$APP/deploy/cloud/update.sh" "$SELF" || say "could not refresh $SELF"; exit 0
fi

# Built, restarted, silent: this commit is the problem. Set it aside.
echo "$target" > "$REJECTED"
say "$(short "$target") did not come up — going back to $(short "$current")"
if build "$current" && "$SYSTEMCTL" restart radio-tower && answers; then
  say "back on air: $(short "$current")"
else
  say "the station is not answering — journalctl -u radio-tower -n 50"
fi
exit 1
