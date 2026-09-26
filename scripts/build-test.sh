#!/usr/bin/env bash
#
# Radio Tower — full self-test.
#
# This is the script the build agent runs to answer "is the platform still
# working?". It goes further than `npm test`: it boots a real server against a
# generated music library, exercises the HTTP surface with curl, and — if a
# browser is available — drives the actual player.
#
#   bash scripts/build-test.sh              # everything
#   bash scripts/build-test.sh --no-browser # skip the browser stage
#   bash scripts/build-test.sh --keep       # leave the server running
#
# Exit code 0 = the tower is sound. Non-zero = something is broken; the output
# says what.

set -uo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$PWD"

PORT="${TEST_PORT:-8199}"
FIXTURE_DIR="$(mktemp -d)"
KEEP=0
DO_BROWSER=1
SERVER_PID=""
FAILURES=0
STAGE=0

for arg in "$@"; do
  case "$arg" in
    --no-browser) DO_BROWSER=0 ;;
    --keep) KEEP=1 ;;
  esac
done

# ---------------------------------------------------------------- reporting --
green() { printf '\033[0;32m%s\033[0m' "$1"; }
red()   { printf '\033[0;31m%s\033[0m' "$1"; }
dim()   { printf '\033[2m%s\033[0m' "$1"; }

stage() { STAGE=$((STAGE+1)); printf '\n\033[1;33m[%d] %s\033[0m\n' "$STAGE" "$1"; }
ok()    { printf '  %s %s\n' "$(green '✓')" "$1"; }
bad()   { printf '  %s %s\n' "$(red '✗')" "$1"; FAILURES=$((FAILURES+1)); }
info()  { printf '  %s\n' "$(dim "$1")"; }

cleanup() {
  if [[ -n "$SERVER_PID" && $KEEP -eq 0 ]]; then
    kill "$SERVER_PID" 2>/dev/null || true
    wait "$SERVER_PID" 2>/dev/null || true
  fi
  [[ $KEEP -eq 0 ]] && rm -rf "$FIXTURE_DIR"
}
trap cleanup EXIT

printf '\n\033[1m  Radio Tower — self test\033[0m\n'
info "$(date -u '+%Y-%m-%dT%H:%M:%SZ')  ·  $ROOT"

# ------------------------------------------------------- 1. static analysis --
stage "Toolchain and syntax"

if command -v node >/dev/null 2>&1; then
  NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
  if [[ "$NODE_MAJOR" -ge 22 ]]; then ok "node $(node -v)"; else bad "node $(node -v) — need >= 22 (Node 20 reached end of life 2026-04-30)"; fi
else
  bad "node is not installed"; exit 1
fi

SYNTAX_FAIL=0
while IFS= read -r f; do
  node --check "$f" 2>/dev/null || { bad "syntax error in $f"; SYNTAX_FAIL=1; }
done < <(find server public scripts tests -name '*.js' -o -name '*.mjs' 2>/dev/null | grep -v node_modules)
[[ $SYNTAX_FAIL -eq 0 ]] && ok "all JavaScript parses"

# The Pi installers (pi/install.sh, scripts/setup-pi.sh) never had even a
# syntax check — see roadmap #0, "259 lines of untested shell standing
# between Ortis and a working station". This won't catch most of what could
# go wrong there (that needs root or a real Pi; tests/pi-install.test.js
# covers what's testable without either), but a bad edit that doesn't even
# parse should never reach him silently.
SHELL_SYNTAX_FAIL=0
while IFS= read -r f; do
  bash -n "$f" 2>/dev/null || { bad "syntax error in $f"; SHELL_SYNTAX_FAIL=1; }
done < <(find scripts pi -name '*.sh' 2>/dev/null)
[[ $SHELL_SYNTAX_FAIL -eq 0 ]] && ok "all shell scripts parse"

if [[ -d node_modules ]]; then
  ok "dependencies installed"
else
  info "installing dependencies…"
  npm install --no-audit --no-fund >/dev/null 2>&1 && ok "dependencies installed" || bad "npm install failed"
fi

# --------------------------------------------------------- 2. unit + api ----
stage "Test suite"
TEST_OUT="$(npm test 2>&1)"
# node:test's default reporter is version- and TTY-dependent: some
# combinations emit TAP ("# pass N" / "# fail N"), current Node (confirmed:
# v24.19.0, non-TTY, piped) emits the "spec" reporter's summary instead,
# whose marker is the Unicode glyph U+2139 ("info source") rather than "#".
# Matching only the TAP form made this stage report "test suite failed" on a
# suite that was actually 129/129, unconditionally, on this Node version -- a
# false negative baked into the check itself, not a real failure. awk instead
# of `grep -P '\K'` here on purpose: this sandbox's grep refuses `-P` outside
# a locale it recognises as UTF-8 even when LC_CTYPE=C.UTF-8 is set, and awk
# needs no Unicode-aware matching at all -- "fail N" / "pass N" at end of
# line is enough regardless of what marker byte(s) precede it.
FAIL_COUNT="$(awk '/ fail [0-9]+$/{n=$NF} END{print n}' <<<"$TEST_OUT")"
if [[ "$FAIL_COUNT" == "0" ]]; then
  PASSED="$(awk '/ pass [0-9]+$/{n=$NF} END{print n}' <<<"$TEST_OUT")"
  ok "${PASSED} tests passed"
else
  bad "test suite failed"
  grep -E 'not ok|AssertionError|fail [0-9]' <<<"$TEST_OUT" | head -20 | sed 's/^/      /'
fi

# ------------------------------------------------------ 3. live server run --
stage "Live server"

if command -v ffmpeg >/dev/null 2>&1; then
  for spec in "01 Carrier Wave:220:9" "02 Night Shift:277:12" "03 Tower Light:330:7" "04 Low Band:165:15"; do
    IFS=':' read -r name freq dur <<<"$spec"
    ffmpeg -hide_banner -loglevel error -y -f lavfi -i "sine=frequency=${freq}:duration=${dur}" \
      -metadata "title=${name#* }" -metadata "artist=Self Test" -metadata "album=Fixtures" \
      -b:a 128k "$FIXTURE_DIR/${name}.mp3" 2>/dev/null
  done
  ok "generated $(ls "$FIXTURE_DIR" | wc -l) fixture tracks"
else
  info "ffmpeg missing — running against an empty library"
fi

json() { curl -fsS "http://127.0.0.1:$PORT$1" 2>/dev/null; }

# field <key> [key...]  — walk a JSON object from stdin. Prints '' for a
# missing or null value so callers can test with [[ -n ... ]].
field() {
  python3 -c '
import sys, json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
for k in sys.argv[1:]:
    if d is None: break
    try:
        d = d[int(k)] if isinstance(d, list) else d[k]
    except (KeyError, IndexError, TypeError, ValueError):
        d = None
        break
print("" if d is None else d)
' "$@" 2>/dev/null
}

# STATION_KEY is set here so the browser stage can exercise the queue editor.
# In production leaving it unset is the safe default (the write endpoints
# return 503 and the editor hides itself); the self-test is the one place we
# want the other branch covered. QUEUE_LOCK_SECONDS=20 against 7-15s fixture
# tracks guarantees both states are present at once: the next slot is always
# inside the fence, and later ones are always outside it.
MUSIC_DIR="$FIXTURE_DIR" \
CACHE_FILE="$FIXTURE_DIR/.cache/library.json" \
PORT="$PORT" \
AUTO_RESCAN_MINUTES=0 \
STATION_NAME="Self Test Tower" \
STATION_KEY="selftest-key" \
QUEUE_LOCK_SECONDS=20 \
  node server/index.js > "$FIXTURE_DIR/server.log" 2>&1 &
SERVER_PID=$!

# The port now opens before the first scan finishes (that's the point of
# roadmap #2 — a large library no longer leaves the site unreachable while it
# scans). So "the port answers" and "the station is ready to test" are no
# longer the same moment: wait past the `scanning` warm-up state too, or the
# checks below race the fixture scan and fail intermittently depending on how
# fast metadata parsing happens to run.
# The budget here was 40 x 0.25s = 10 seconds, which is a performance
# assumption rather than a correctness one — and on 2026-08-19 it stopped
# holding. Importing `express` and `music-metadata` takes 12-13s when the repo
# sits on a mounted (9p) filesystem, versus 0.20s on local disk, so the server
# had not finished `import`ing before the loop gave up. It passed intermittently
# only because a preceding `npm test` left the page cache warm. Same lesson as
# tests/boot.test.js: a readiness wait should wait for readiness, and a Pi Zero
# 2 W reading node_modules off an SD card deserves the same patience.
#
# Cheap on a genuine failure regardless: a server that dies is noticed straight
# away rather than after the full budget.
SERVER_READY=0
for i in $(seq 1 240); do
  if ! kill -0 "$SERVER_PID" 2>/dev/null; then
    bad "server process exited during startup"
    sed 's/^/      /' "$FIXTURE_DIR/server.log"
    exit 1
  fi
  PROBE="$(curl -fsS "http://127.0.0.1:$PORT/api/health" 2>/dev/null)"
  if [[ -n "$PROBE" ]] && [[ "$(field status <<<"$PROBE")" != "scanning" ]]; then
    SERVER_READY=1
    break
  fi
  sleep 0.5
done
if [[ $SERVER_READY -eq 0 ]]; then
  bad "server never became healthy within 120s"
  sed 's/^/      /' "$FIXTURE_DIR/server.log"
  exit 1
fi
ok "server up on :$PORT (pid $SERVER_PID)"

# --------------------------------------------------------- 4. HTTP surface --
stage "HTTP surface"

HEALTH="$(json /api/health)"
[[ "$(field ok <<<"$HEALTH")" == "True" ]] && ok "/api/health reports ok" || bad "/api/health not ok: $HEALTH"
TRACKS="$(field tracks <<<"$HEALTH")"
info "library: ${TRACKS} tracks, cycle $(field cycleSeconds <<<"$HEALTH")s, rss $(field memoryMb <<<"$HEALTH")MB"

STATION="$(json /api/station)"
TRACK_ID="$(field onAir id <<<"$STATION")"
if [[ -n "$TRACK_ID" ]]; then
  ok "/api/station has something on air ($(field onAir title <<<"$STATION"))"
else
  bad "/api/station reports dead air"
fi

grep -q 'relPath' <<<"$STATION" && bad "filesystem paths leaked in /api/station" || ok "no filesystem paths in the payload"

# Sync check: two reads a second apart must advance, not restart.
O1="$(field onAir offset <<<"$(json /api/station)")"
sleep 1.2
S2="$(json /api/station)"
O2="$(field onAir offset <<<"$S2")"
if [[ -n "$O1" && -n "$O2" ]]; then
  ADVANCED="$(python3 -c "print('yes' if 0.8 < ($O2 - $O1) < 2.5 or $O2 < $O1 else 'no')" 2>/dev/null)"
  [[ "$ADVANCED" == "yes" ]] && ok "station clock advances in real time (${O1}s → ${O2}s)" \
                             || bad "station clock is wrong (${O1}s → ${O2}s)"
fi

# Determinism: the same instant must always resolve the same way.
DET="$(node -e "
process.env.MUSIC_DIR='$FIXTURE_DIR';
const {Station}=await import('./server/lib/schedule.js');
const {scanLibrary}=await import('./server/lib/library.js');
const {tracks}=await scanLibrary({musicDir:'$FIXTURE_DIR',useCache:false});
if(!tracks.length){console.log('skip');process.exit(0)}
const e=Date.parse('2026-01-01T00:00:00Z');
const a=new Station(tracks,{epoch:e}), b=new Station(tracks.slice(),{epoch:e});
let bad=0;
for(let t=0;t<20000;t+=7){const x=a.at(e+t*1000),y=b.at(e+t*1000);
  if(x.track.id!==y.track.id||Math.abs(x.offset-y.offset)>1e-9)bad++;}
console.log(bad===0?'ok':'diverged '+bad);
" --input-type=module 2>/dev/null)"
case "$DET" in
  ok)   ok "schedule is deterministic across 2857 sample instants" ;;
  skip) info "determinism check skipped (no fixtures)" ;;
  *)    bad "schedule diverged between instances: $DET" ;;
esac

# Range streaming.
if [[ -n "$TRACK_ID" ]]; then
  CODE="$(curl -s -o /dev/null -w '%{http_code}' -H 'Range: bytes=100-199' "http://127.0.0.1:$PORT/api/track/$TRACK_ID/stream")"
  [[ "$CODE" == "206" ]] && ok "range requests return 206" || bad "range request returned $CODE, expected 206"

  LEN="$(curl -s -o /dev/null -w '%{size_download}' -H 'Range: bytes=100-199' "http://127.0.0.1:$PORT/api/track/$TRACK_ID/stream")"
  [[ "$LEN" == "100" ]] && ok "ranged body is exactly the bytes asked for" || bad "ranged body was $LEN bytes, expected 100"

  CODE="$(curl -s -o /dev/null -w '%{http_code}' -H 'Range: bytes=99999999-' "http://127.0.0.1:$PORT/api/track/$TRACK_ID/stream")"
  [[ "$CODE" == "416" ]] && ok "out-of-range request returns 416" || bad "out-of-range returned $CODE, expected 416"
fi

# Security.
CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/api/track/..%2F..%2F..%2Fetc%2Fpasswd/stream")"
[[ "$CODE" =~ ^(400|404)$ ]] && ok "path traversal is refused ($CODE)" || bad "traversal returned $CODE"

CODE="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$PORT/")"
[[ "$CODE" == "200" ]] && ok "player page is served" || bad "player page returned $CODE"

# ---------------------------------------------------------- 5. performance --
stage "Performance"
if command -v curl >/dev/null 2>&1; then
  TOTAL=0
  for _ in $(seq 1 20); do
    T="$(curl -s -o /dev/null -w '%{time_total}' "http://127.0.0.1:$PORT/api/station")"
    TOTAL="$(python3 -c "print($TOTAL + $T)")"
  done
  AVG_MS="$(python3 -c "print(round($TOTAL/20*1000, 1))")"
  UNDER="$(python3 -c "print('yes' if $AVG_MS < 100 else 'no')")"
  [[ "$UNDER" == "yes" ]] && ok "/api/station averages ${AVG_MS}ms over 20 calls" \
                          || bad "/api/station is slow: ${AVG_MS}ms average"
fi
RSS="$(field memoryMb <<<"$(json /api/health)")"
if [[ -n "$RSS" ]]; then
  [[ "$RSS" -lt 250 ]] && ok "resident memory ${RSS}MB (fits a Pi Zero 2 W)" || bad "resident memory ${RSS}MB is high for a Pi"
fi

# ------------------------------------------------------------- 6. browser ----
if [[ $DO_BROWSER -eq 1 ]]; then
  stage "Browser"
  if node -e "import('playwright').then(()=>process.exit(0)).catch(()=>process.exit(1))" 2>/dev/null; then
    # Playwright pins an exact Chromium revision per release and refuses to
    # launch anything else. A machine can easily have a perfectly good
    # Chromium on disk — a different Playwright install's download, a system
    # package — under a version that doesn't match. Rather than re-download,
    # look for one and hand it to browser-smoke.mjs as TOWER_BROWSER_EXECUTABLE.
    # First hit wins; if nothing is found Playwright falls back to its own
    # managed download path, so this is additive, not a requirement.
    if [[ -z "${TOWER_BROWSER_EXECUTABLE:-}" ]]; then
      for candidate in \
        "${CHROME_PATH:-}" \
        "${PLAYWRIGHT_BROWSERS_PATH:-}/chromium"/*/chrome-linux/chrome \
        "${PLAYWRIGHT_BROWSERS_PATH:-}"/chromium-*/chrome-linux/chrome \
        "${PLAYWRIGHT_BROWSERS_PATH:-}"/chromium_headless_shell-*/chrome-linux/headless_shell \
        /opt/pw-browsers/chromium-*/chrome-linux/chrome \
        /opt/pw-browsers/chromium_headless_shell-*/chrome-linux/headless_shell \
        "$HOME"/.cache/ms-playwright/chromium-*/chrome-linux/chrome \
        "$HOME"/.cache/ms-playwright/chromium_headless_shell-*/chrome-linux/headless_shell \
        /usr/bin/chromium-browser /usr/bin/chromium /usr/bin/google-chrome \
      ; do
        [[ -x "$candidate" ]] && { export TOWER_BROWSER_EXECUTABLE="$candidate"; break; }
      done
    fi
    [[ -n "${TOWER_BROWSER_EXECUTABLE:-}" ]] && info "using browser: $TOWER_BROWSER_EXECUTABLE"

    if node scripts/browser-smoke.mjs "http://127.0.0.1:$PORT" 2>&1 | sed 's/^/  /'; then
      ok "player drives correctly in a real browser"
    else
      bad "browser smoke test failed"
    fi
  else
    info "playwright not installed — skipping (npm i -D playwright to enable)"
  fi
fi

# ------------------------------------------------------------------ verdict --
stage "Verdict"
if [[ $FAILURES -eq 0 ]]; then
  printf '  %s the tower is sound\n\n' "$(green '✓')"
  exit 0
else
  printf '  %s %d check(s) failed\n\n' "$(red '✗')" "$FAILURES"
  exit 1
fi
