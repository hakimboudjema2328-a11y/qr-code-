const test = (name, fn) => Deno.test(name, fn);
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DEFAULT_STYLE, exampleSnapshot, hasGoodContrast, normalizeSnapshot, renderQr, renderSvg } from '../supabase/functions/_shared/qr.js';
import QRCode from 'npm:qrcode@1.5.4/lib/core/qrcode.js';
import { decryptSnapshot, encryptSnapshot } from '../supabase/functions/_shared/crypto.js';

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
test('AES-GCM binds encrypted data to the QR and user', async () => {
  const secret = randomBytes(32).toString('base64');
  const snapshot = normalizeSnapshot(exampleSnapshot());
  const encrypted = await encryptSnapshot(snapshot, secret, 'order-a', 'user-a');
  assert.ok(!encrypted.snapshot_ciphertext.includes('example.com'));
  assert.deepEqual(await decryptSnapshot(encrypted.snapshot_ciphertext, encrypted.snapshot_iv, secret, 'order-a', 'user-a'), snapshot);
  await assert.rejects(decryptSnapshot(encrypted.snapshot_ciphertext, encrypted.snapshot_iv, secret, 'order-b', 'user-a'));
});
test('un réseau Wi-Fi ouvert efface tout ancien mot de passe', () => {
  const result = normalizeSnapshot(draft('wifi', { wifiName: 'Réseau', wifiPassword: 'secret-ancien', wifiSecurity: 'nopass', hidden: false }));
  assert.equal(result.content.wifiPassword, '');
  assert.ok(!result.payload.includes('secret-ancien'));
});

test('la taille du logo est bornée et les anciens QR gardent leur rendu', () => {
  const logo = 'data:image/png;base64,AAAA';
  for (const size of [8, 16, 22]) {
    const result = normalizeSnapshot(draft('url', { url: 'https://example.com/scan' }, { ...DEFAULT_STYLE, logo, logoSize: size }));
    assert.equal(result.style.logoSize, size);
    assert.equal(renderQr(result).logoSizeRequested, size);
  }
  for (const size of [0, 7, 23, 100, 16.5, null, '16']) {
    assert.throws(() => normalizeSnapshot(draft('url', { url: 'https://example.com' }, { ...DEFAULT_STYLE, logoSize: size })), /taille du logo/);
  }
  const { logoSize: _omitted, ...legacyStyle } = { ...DEFAULT_STYLE, logo };
  const old = draft('url', { url: 'https://example.com/ancien' }, legacyStyle);
  assert.equal(Object.hasOwn(normalizeSnapshot(old).style, 'logoSize'), false);
  const { svg, logoSizeApplied } = renderQr(old);
  const width = Number(svg.match(/^<svg[^>]*width="([\d.]+)"/)[1]);
  const expected = Math.min((width - 80) * 0.16, 80);
  assert.ok(svg.includes(`width="${expected}" height="${expected}" preserveAspectRatio`));
  assert.equal(logoSizeApplied, null);
});

test('le logo reste centré sans masquer les motifs QR réservés, même pour un contenu dense', () => {
  const logo = 'data:image/png;base64,AAAA';
  for (const length of [12, 50, 80, 150, 300, 500, 680]) for (const requested of [8, 16, 22]) {
    const url = 'https://exemple.com/' + 'x'.repeat(length);
    const { svg, logoSizeApplied, logoSizeRequested } = renderQr(draft('url', { url }, { ...DEFAULT_STYLE, logo, logoSize: requested }));
    assert.equal(logoSizeRequested, requested);
    assert.ok(logoSizeApplied >= 8 && logoSizeApplied <= requested);
    const width = Number(svg.match(/^<svg[^>]*width="([\d.]+)"/)[1]);
    const image = svg.match(/<image href="[^"]+" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/);
    assert.ok(image, 'logo présent');
    const [, x, y, side, height] = image.map((value, i) => i ? Number(value) : value);
    assert.equal(x, y); assert.equal(side, height);
    assert.ok(Math.abs(x + side / 2 - width / 2) < 0.0001, 'logo centré');
    const count = (width - 80) / 10, version = (count - 17) / 4;
    const matrix = QRCode.create(url, { errorCorrectionLevel: 'H', version }).modules;
    const first = Math.max(0, Math.floor((x - 5 - 40) / 10));
    const end = Math.min(count, Math.ceil((x + side + 5 - 40) / 10));
    for (let r = first; r < end; r++) for (let c = first; c < end; c++) {
      assert.equal(Boolean(matrix.isReserved(r, c)), false, `motif réservé masqué : version ${version}, taille ${requested}`);
    }
  }
});
