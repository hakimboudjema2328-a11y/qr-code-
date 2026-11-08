const test = (name, fn) => Deno.test(name, fn);
import assert from 'node:assert/strict';
import { createHmac, randomBytes } from 'node:crypto';
import { DEFAULT_STYLE, exampleSnapshot, hasGoodContrast, normalizeSnapshot, renderSvg } from '../supabase/functions/_shared/qr.js';
import { decryptSnapshot, encryptSnapshot, verifyChargilySignature } from '../supabase/functions/_shared/crypto.js';

const draft = (type, content, style = DEFAULT_STYLE) => ({ type, content, style });
test('Wi-Fi escaping and standards-compliant terminator', () => {
  const result = normalizeSnapshot(draft('wifi', { wifiName: 'Café; salon', wifiPassword: 'a,b:c\\d', wifiSecurity: 'WPA', hidden: true }));
  assert.equal(result.payload, 'WIFI:T:WPA;S:Café\\; salon;P:a\\,b\\:c\\\\d;H:true;;');
});
test('only safe web links are allowed, with sufficient contrast', () => {
  assert.throws(() => normalizeSnapshot(draft('url', { url: 'javascript:alert(1)' })), /adresse web valide/);
  assert.throws(() => normalizeSnapshot(draft('url', { url: 'https://example.com' }, { ...DEFAULT_STYLE, foreground: '#ffffff' })), /contraste/);
  assert.equal(hasGoodContrast('#24203f', '#ffffff'), true);
  assert.equal(hasGoodContrast('#ffffff', '#24203f'), false);
});
test('the free preview encodes only a sample and escapes the caption', () => {
  const a = draft('url', { url: 'https://customer-a.example/secret' }, { ...DEFAULT_STYLE, label: '<script>x</script>' });
  const b = draft('url', { url: 'https://customer-b.example/another' }, { ...DEFAULT_STYLE, label: '<script>x</script>' });
  const preview = renderSvg(a, { preview: true });
  assert.equal(preview, renderSvg(b, { preview: true }));
  assert.ok(preview.includes('&lt;SCRIPT&gt;'));
  assert.ok(!preview.includes('<SCRIPT>'));
  assert.notEqual(renderSvg(a), renderSvg(b));
});
test('rejected logos cannot inject active SVG or external references', () => {
  assert.throws(() => normalizeSnapshot(draft('url', { url: 'https://example.com' }, { ...DEFAULT_STYLE, logo: 'data:image/svg+xml;base64,AAAA' })), /logo/);
  assert.throws(() => normalizeSnapshot({ type: 'url', content: {}, style: null }), /invalides/);
});
test('AES-GCM binds encrypted data to the order and user', async () => {
  const secret = randomBytes(32).toString('base64');
  const snapshot = normalizeSnapshot(exampleSnapshot());
  const encrypted = await encryptSnapshot(snapshot, secret, 'order-a', 'user-a');
  assert.ok(!encrypted.snapshot_ciphertext.includes('example.com'));
  assert.deepEqual(await decryptSnapshot(encrypted.snapshot_ciphertext, encrypted.snapshot_iv, secret, 'order-a', 'user-a'), snapshot);
  await assert.rejects(decryptSnapshot(encrypted.snapshot_ciphertext, encrypted.snapshot_iv, secret, 'order-b', 'user-a'));
});
test('Chargily signature covers the exact raw request bytes', async () => {
  const key = 'test_secret'; const raw = new TextEncoder().encode('{"type": "checkout.paid"}');
  const signature = createHmac('sha256', key).update(raw).digest('hex');
  assert.equal(await verifyChargilySignature(key, raw, signature), true);
  assert.equal(await verifyChargilySignature(key, new TextEncoder().encode('{"type":"checkout.paid"}'), signature), false);
  assert.equal(await verifyChargilySignature(key, raw, 'wrong'), false);
});


test('un réseau Wi-Fi ouvert efface tout ancien mot de passe', () => {
  const result = normalizeSnapshot(draft('wifi', { wifiName: 'Réseau', wifiPassword: 'secret-ancien', wifiSecurity: 'nopass', hidden: false }));
  assert.equal(result.content.wifiPassword, '');
  assert.ok(!result.payload.includes('secret-ancien'));
});
