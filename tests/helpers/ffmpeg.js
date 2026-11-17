/**
 * ffmpeg for the tests that make real audio, found once and in one place (docs/TESTS-REVIEW.md, section 5).
 *
 * Where: $FFMPEG (the executable itself), else `ffmpeg` on PATH.
 *
 * Missing, the tests that need it skip, and `npm test` says so before it starts (run as a script, this file prints
 * the warning). Under CI, or with REQUIRE_FFMPEG set, missing is a failure instead: a skip there is a green that
 * tested nothing. Before 2026-11-17 each of five files looked for it on its own, and 28 tests skipped silently on
 * a laptop without it on PATH.
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);

export const FFMPEG = process.env.FFMPEG || 'ffmpeg';
export const hasFfmpeg = await run(FFMPEG, ['-version']).then(() => true, () => false);
/** The reason a test gives when it skips — `{ skip: NO_FFMPEG }` or `t.skip(NO_FFMPEG)`; false when ffmpeg is here. */
export const NO_FFMPEG = !hasFfmpeg && `ffmpeg not found (${FFMPEG}): set FFMPEG to its path, or put it on PATH`;

const required = process.env.CI ? 'CI' : process.env.REQUIRE_FFMPEG ? 'REQUIRE_FFMPEG' : '';
if (!hasFfmpeg && required) throw new Error(`${NO_FFMPEG} — and ${required} is set, so the tests that need real audio may not skip.`);

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1] && !hasFfmpeg) {
  process.stderr.write(`\n  !! ${NO_FFMPEG}.\n  !! The tests that make real audio (the server, the API, the bot, the tower) will SKIP, not pass.\n\n`);
}
