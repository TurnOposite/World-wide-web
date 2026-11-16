/**
 * Web Push written with node:crypto (server/lib/webpush.js).
 *
 * What must hold:
 *   - the encryption is RFC 8291's, byte for byte: the worked example in the
 *     RFC's Appendix A comes out exactly, and decrypts back;
 *   - a fresh message is different every time, and only the subscriber's key reads it;
 *   - the VAPID token is one a push service can verify with the public key,
 *     for that service only, and expires;
 *   - the tower only ever calls a real push service — never an address a
 *     stranger made up (a private network, the tower itself).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import { encrypt, decrypt, generateKeys, vapidAuthorization, allowedEndpoint, send, fromB64u, b64u, subscriptionKeys } from '../server/lib/webpush.js';

// RFC 8291, Appendix A — « Intermediate Values for Encryption ».
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  asPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  asPublic: 'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  uaPrivate: 'q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94',
  uaPublic: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
};

test('RFC 8291, Appendix A: the worked example comes out byte for byte', () => {
  const body = encrypt(RFC.plaintext, { p256dh: RFC.uaPublic, auth: RFC.auth }, { salt: fromB64u(RFC.salt), localKeys: { privateKey: RFC.asPrivate } });
  assert.equal(b64u(body), RFC.body);
  assert.equal(b64u(body.subarray(21, 86)), RFC.asPublic, 'the header carries the sender\'s public key');
  assert.equal(body.readUInt32BE(16), 4096, 'and the record size');
});

test('…and the subscriber reads it back; nobody else does', () => {
  const read = decrypt(fromB64u(RFC.body), { publicKey: RFC.uaPublic, privateKey: RFC.uaPrivate, auth: RFC.auth });
  assert.equal(read.toString(), RFC.plaintext);
  const other = generateKeys();
  assert.throws(() => decrypt(fromB64u(RFC.body), { publicKey: other.publicKey, privateKey: other.privateKey, auth: RFC.auth }));
  assert.throws(() => decrypt(fromB64u(RFC.body), { publicKey: RFC.uaPublic, privateKey: RFC.uaPrivate, auth: b64u(crypto.randomBytes(16)) }), 'the auth secret is needed too');
  const tampered = fromB64u(RFC.body);
  tampered[tampered.length - 20] ^= 1;
  assert.throws(() => decrypt(tampered, { publicKey: RFC.uaPublic, privateKey: RFC.uaPrivate, auth: RFC.auth }), 'a changed byte is refused');
});

test('a message is encrypted afresh every time, whatever it says', () => {
  const ua = generateKeys();
  const keys = { p256dh: ua.publicKey, auth: b64u(crypto.randomBytes(16)) };
  const text = JSON.stringify({ title: 'Ada on the telegraph line', body: 'héllo 🌙 — '.repeat(8) });
  const one = encrypt(text, keys);
  const two = encrypt(text, keys);
  assert.notDeepEqual(one, two, 'a new salt and a new sender key each time');
  for (const body of [one, two]) assert.equal(decrypt(body, { ...ua, auth: keys.auth }).toString(), text);
  assert.throws(() => encrypt('x'.repeat(5000), keys), /too long/);
  assert.throws(() => subscriptionKeys({ p256dh: 'AAAA', auth: keys.auth }), /p256dh/);
  assert.throws(() => subscriptionKeys({ p256dh: ua.publicKey, auth: 'AAAA' }), /auth/);
});

test('VAPID: a token the push service can verify, for that service only, that expires', () => {
  const vapid = { ...generateKeys(), subject: 'https://station.example' };
  const now = Date.parse('2026-11-16T12:00:00Z');
  const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc123', vapid, { now });
  const m = /^vapid t=([\w-]+)\.([\w-]+)\.([\w-]+), k=([\w-]+)$/.exec(header);
  assert.ok(m, header);
  const [, head, claims, sig, k] = m;
  assert.equal(k, vapid.publicKey);
  assert.deepEqual(JSON.parse(fromB64u(head)), { typ: 'JWT', alg: 'ES256' });
  assert.deepEqual(JSON.parse(fromB64u(claims)), { aud: 'https://fcm.googleapis.com', exp: now / 1000 + 12 * 3600, sub: 'https://station.example' });
  const pub = fromB64u(vapid.publicKey);
  const key = crypto.createPublicKey({ format: 'jwk', key: { kty: 'EC', crv: 'P-256', x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) } });
  assert.equal(crypto.verify('sha256', Buffer.from(`${head}.${claims}`), { key, dsaEncoding: 'ieee-p1363' }, fromB64u(sig)), true);
  assert.equal(fromB64u(sig).length, 64, 'the raw r‖s form a JWT wants, not DER');
});

test('the tower only calls a real push service', () => {
  for (const ok of [
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/abc',
    'https://db5p.notify.windows.com/w/?token=abc',
  ]) assert.equal(allowedEndpoint(ok), true, ok);
  for (const bad of [
    'http://fcm.googleapis.com/fcm/send/abc', // not https
    'https://fcm.googleapis.com:8443/x', // another port
    'https://fcm.googleapis.com.evil.example/x',
    'https://evilpush.apple.com.example/x',
    'https://notpush.apple.com/x',
    'https://user:pw@fcm.googleapis.com/x',
    'http://127.0.0.1:8080/api/rescan',
    'http://169.254.169.254/opc/v2/instance/',
    'https://localhost/x',
    'file:///etc/passwd',
    'not a url',
    `https://fcm.googleapis.com/${'x'.repeat(1100)}`,
    '',
    null,
  ]) assert.equal(allowedEndpoint(bad), false, String(bad).slice(0, 60));
  assert.equal(allowedEndpoint('http://127.0.0.1:9999/push/1', ['http://127.0.0.1:9999']), true, 'the self-test names its stand-in by exact origin');
  assert.equal(allowedEndpoint('http://127.0.0.1:9998/push/1', ['http://127.0.0.1:9999']), false);
});

test('send: one POST the push service accepts — encrypted, signed, with a lifetime', async () => {
  const ua = generateKeys();
  const auth = b64u(crypto.randomBytes(16));
  const vapid = { ...generateKeys(), subject: 'https://station.example' };
  const got = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c)).on('end', () => { got.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks) }); res.writeHead(req.url.includes('gone') ? 410 : 201).end(); });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const status = await send({ endpoint: `${base}/push/1`, keys: { p256dh: ua.publicKey, auth } }, '{"title":"hi"}', vapid);
    assert.equal(status, 201);
    assert.equal(await send({ endpoint: `${base}/push/gone`, keys: { p256dh: ua.publicKey, auth } }, 'x', vapid), 410);
    const [req] = got;
    assert.equal(req.headers['content-encoding'], 'aes128gcm');
    assert.equal(req.headers.ttl, '3600');
    assert.match(req.headers.authorization, /^vapid t=[\w.-]+, k=[\w-]+$/);
    assert.equal(decrypt(req.body, { ...ua, auth }).toString(), '{"title":"hi"}');
  } finally { await new Promise((r) => server.close(r)); }
});
