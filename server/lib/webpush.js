/**
 * Web Push with node:crypto and nothing else — what lets the tower tell a
 * listener's phone « someone wrote on the line » (Ortis, 2026-11-16).
 *
 * Three standards, each small enough to write out rather than take a third
 * runtime dependency for (the rule in CLAUDE.md; docs/DECISIONS.md 2026-11-16):
 *
 *   - RFC 8291, message encryption: the payload is encrypted to the keys the
 *     browser made when it subscribed (p256dh, auth), so the push service
 *     that carries it — Google's, Mozilla's, Apple's — cannot read it;
 *   - RFC 8188, the `aes128gcm` content coding it is wrapped in (one record);
 *   - RFC 8292, VAPID: a signed token that says which server is sending, so
 *     the push service accepts it without any account.
 *
 * tests/webpush.test.js checks the encryption against the worked example in
 * RFC 8291 (Appendix A), byte for byte.
 */
import crypto from 'node:crypto';

const CURVE = 'prime256v1';
export const b64u = (buf) => Buffer.from(buf).toString('base64url');
export const fromB64u = (s) => Buffer.from(String(s ?? ''), 'base64url');

/** A P-256 key pair as two base64url strings: the uncompressed public point (65 bytes) and the private scalar (32). */
export function generateKeys() {
  const ecdh = crypto.createECDH(CURVE);
  ecdh.generateKeys();
  return { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
}

const hkdf = (salt, ikm, info, length) => Buffer.from(crypto.hkdfSync('sha256', ikm, salt, info, length));

/** The content-encryption key and nonce both ends derive (RFC 8291 §3.3–3.4). */
function deriveKeys({ secret, auth, uaPublic, asPublic, salt }) {
  const ikm = hkdf(auth, secret, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic]), 32);
  return {
    key: hkdf(salt, ikm, Buffer.from('Content-Encoding: aes128gcm\0'), 16),
    nonce: hkdf(salt, ikm, Buffer.from('Content-Encoding: nonce\0'), 12),
  };
}

/** A subscription's two keys, checked: a 65-byte uncompressed point and a 16-byte secret. */
export function subscriptionKeys(keys) {
  const uaPublic = fromB64u(keys?.p256dh);
  const auth = fromB64u(keys?.auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4) throw new Error('p256dh is not an uncompressed P-256 point');
  if (auth.length !== 16) throw new Error('auth is not 16 bytes');
  return { uaPublic, auth };
}

/**
 * Encrypt `payload` for one subscription. Returns the request body: the aes128gcm header (salt, record size, the
 * sender's public key) and one encrypted record.
 * @param {string|Buffer} payload
 * @param {{p256dh: string, auth: string}} keys   from the browser's PushSubscription
 * @param {object} [o]  `salt` and `localKeys` are fixed only by the test vectors
 */
export function encrypt(payload, keys, { salt = crypto.randomBytes(16), localKeys = null, recordSize = 4096 } = {}) {
  const { uaPublic, auth } = subscriptionKeys(keys);
  const ecdh = crypto.createECDH(CURVE);
  if (localKeys) ecdh.setPrivateKey(fromB64u(localKeys.privateKey));
  else ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey();
  const { key, nonce } = deriveKeys({ secret: ecdh.computeSecret(uaPublic), auth, uaPublic, asPublic, salt });
  // One record: the text, then the delimiter that says « this is the last one » (RFC 8188 §2).
  const plain = Buffer.concat([Buffer.from(payload), Buffer.from([2])]);
  if (plain.length + 16 > recordSize) throw new Error(`payload too long for one record (${plain.length} bytes)`);
  const cipher = crypto.createCipheriv('aes-128-gcm', key, nonce);
  const record = Buffer.concat([cipher.update(plain), cipher.final(), cipher.getAuthTag()]);
  const header = Buffer.alloc(21);
  salt.copy(header, 0);
  header.writeUInt32BE(recordSize, 16);
  header[20] = asPublic.length;
  return Buffer.concat([header, asPublic, record]);
}

/** The other end, for the tests and the self-test: what a browser holding the subscription's private key reads. */
export function decrypt(body, { publicKey, privateKey, auth }) {
  const buf = Buffer.from(body);
  const salt = buf.subarray(0, 16);
  const idLen = buf[20];
  const asPublic = buf.subarray(21, 21 + idLen);
  const record = buf.subarray(21 + idLen);
  const ecdh = crypto.createECDH(CURVE);
  ecdh.setPrivateKey(fromB64u(privateKey));
  const { key, nonce } = deriveKeys({ secret: ecdh.computeSecret(asPublic), auth: fromB64u(auth), uaPublic: fromB64u(publicKey), asPublic, salt });
  const decipher = crypto.createDecipheriv('aes-128-gcm', key, nonce);
  decipher.setAuthTag(record.subarray(record.length - 16));
  const plain = Buffer.concat([decipher.update(record.subarray(0, record.length - 16)), decipher.final()]);
  let end = plain.length - 1;
  while (end >= 0 && plain[end] === 0) end--;
  if (plain[end] !== 2) throw new Error('not a final record');
  return plain.subarray(0, end);
}

/**
 * The Authorization header that tells a push service who is sending (RFC 8292): a token signed with the server's
 * key, good for twelve hours, for that push service only.
 */
export function vapidAuthorization(endpoint, { publicKey, privateKey, subject }, { now = Date.now(), lifeSeconds = 12 * 3600 } = {}) {
  const pub = fromB64u(publicKey);
  const key = crypto.createPrivateKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', d: privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  const head = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
  const claims = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + lifeSeconds, sub: subject }));
  const signature = crypto.sign('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${head}.${claims}.${b64u(signature)}, k=${publicKey}`;
}

/**
 * The push services browsers use. A subscription's endpoint is an address a stranger hands the tower and the
 * tower then calls: anything else — a private address, the tower itself, a cloud's metadata service — is refused.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/, // Chrome, Edge, Android
  /^(?:[a-z0-9-]+\.)*push\.services\.mozilla\.com$/, // Firefox
  /^(?:[a-z0-9-]+\.)*push\.apple\.com$/, // Safari, iPhone
  /^(?:[a-z0-9-]+\.)*notify\.windows\.com$/, // Edge (older)
];

/** Is this an endpoint the tower may call? `extraOrigins` (exact origins) is how the self-test names its stand-in. */
export function allowedEndpoint(endpoint, extraOrigins = []) {
  let u;
  try { u = new URL(String(endpoint)); } catch { return false; }
  if (String(endpoint).length > 1024 || u.username || u.password) return false;
  if (extraOrigins.includes(u.origin)) return true;
  return u.protocol === 'https:' && (u.port === '' || u.port === '443') && PUSH_HOSTS.some((re) => re.test(u.hostname));
}

/**
 * Send one notification. Resolves with the push service's status: 201 is accepted; 404 and 410 mean the
 * subscription is gone and should be forgotten.
 */
export async function send(subscription, payload, vapid, { ttlSeconds = 3600, urgency = 'normal', fetchImpl = globalThis.fetch, timeoutMs = 10_000 } = {}) {
  const res = await fetchImpl(subscription.endpoint, {
    method: 'POST',
    // Never follow a push service somewhere else: the allow-list was checked against this address only.
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Encoding': 'aes128gcm',
      TTL: String(ttlSeconds),
      Urgency: urgency,
      Authorization: vapidAuthorization(subscription.endpoint, vapid),
    },
    body: encrypt(payload, subscription.keys),
  });
  return res.status;
}
