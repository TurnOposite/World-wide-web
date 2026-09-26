/**
 * HTTP range streaming.
 *
 * Browsers seek by asking for byte ranges, and the player *always* seeks —
 * that is how a listener joins the station mid-track. So 206 Partial Content
 * has to be correct or the whole sync illusion falls apart on Safari.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const MIME = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.flac': 'audio/flac',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
};

export function mimeFor(file) {
  return MIME[path.extname(file).toLowerCase()] || 'application/octet-stream';
}

/** Parse a single-range `Range` header. Returns null for absent/unsupported forms. */
export function parseRange(header, size) {
  if (!header || typeof header !== 'string') return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const [, startRaw, endRaw] = m;
  if (startRaw === '' && endRaw === '') return null;

  let start;
  let end;
  if (startRaw === '') {
    // Suffix range: last N bytes.
    const suffix = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return { unsatisfiable: true };
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(startRaw, 10);
    end = endRaw === '' ? size - 1 : Number.parseInt(endRaw, 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start >= size || start < 0 || end < start) return { unsatisfiable: true };
  return { start, end: Math.min(end, size - 1) };
}

/** Stream a file to an Express response, honouring Range. */
export async function sendAudio(req, res, absPath, { cacheSeconds = 3600 } = {}) {
  let stat;
  try {
    stat = await fsp.stat(absPath);
  } catch {
    res.status(404).json({ error: 'not_found' });
    return;
  }

  const size = stat.size;
  const type = mimeFor(absPath);
  const etag = `"${stat.size.toString(16)}-${Math.round(stat.mtimeMs).toString(16)}"`;

  res.setHeader('Content-Type', type);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('ETag', etag);
  res.setHeader('Cache-Control', `public, max-age=${cacheSeconds}`);

  if (req.headers['if-none-match'] === etag && !req.headers.range) {
    res.status(304).end();
    return;
  }

  const range = parseRange(req.headers.range, size);

  if (range?.unsatisfiable) {
    res.setHeader('Content-Range', `bytes */${size}`);
    res.status(416).end();
    return;
  }

  if (!range) {
    res.setHeader('Content-Length', size);
    if (req.method === 'HEAD') return res.status(200).end();
    fs.createReadStream(absPath).on('error', () => res.destroy()).pipe(res);
    return;
  }

  const { start, end } = range;
  res.status(206);
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);
  if (req.method === 'HEAD') return res.end();
  fs.createReadStream(absPath, { start, end }).on('error', () => res.destroy()).pipe(res);
}

export default { sendAudio, parseRange, mimeFor };
