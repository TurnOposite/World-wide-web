import fsp from 'node:fs/promises';
import path from 'node:path';

/**
 * Silent MPEG-1 Layer III frames (128 kbit/s, 44.1 kHz): enough for the scanner to read a duration, so a test
 * that only needs a library — not real sound — runs where ffmpeg is not installed. Untagged, so the artist comes
 * from an "Artist - Title" file name.
 */
export async function silentMp3(file, seconds) {
  const frame = Buffer.alloc(417);
  frame.writeUInt32BE(0xfffb9064, 0);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  await fsp.writeFile(file, Buffer.concat(Array(Math.round((seconds * 44100) / 1152)).fill(frame)));
}
