import QRCode from 'qrcode/lib/core/qrcode.js';

export const QR_TYPES = ['url', 'text', 'whatsapp', 'wifi', 'email', 'phone', 'sms', 'contact'];
export const DEFAULT_STYLE = Object.freeze({
  foreground: '#24203f', background: '#ffffff', dots: 'rounded', corner: 'rounded',
  frame: true, label: 'SCANNEZ-MOI', logo: ''
});
export const DEFAULT_DRAFT = Object.freeze({
  type: 'url',
  content: { url: 'https://', text: '', phone: '', message: '', email: '', subject: '', wifiName: '', wifiPassword: '', wifiSecurity: 'WPA', hidden: false, name: '', company: '', website: '' },
  style: { ...DEFAULT_STYLE }
});

const HEX = /^#[0-9a-f]{6}$/i;
const COLOR_TYPES = new Set(['square', 'rounded', 'dots']);
const CORNERS = new Set(['square', 'rounded', 'circle']);
const exact = (v, max = 500) => {
  if (typeof v !== 'string') return '';
  if (v.length > max) throw new Error('Un champ est trop long. Réduisez son contenu.');
  return v;
};
const simple = (v, max = 500) => exact(v, max).trim();
const wifiEscape = (v) => String(v).replace(/([\\;,:"])/g, '\\$1');
const vcardEscape = (v) => String(v).replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/([,;])/g, '\\$1');

function luminance(color) {
  const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16) / 255)
    .map(v => v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}
export function contrastRatio(a, b) {
  if (!HEX.test(a) || !HEX.test(b)) return 0;
  const [l1, l2] = [luminance(a), luminance(b)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}
export function hasGoodContrast(a, b) {
  return HEX.test(a) && HEX.test(b) && luminance(a) < luminance(b) && contrastRatio(a, b) >= 4;
}
function normaliseUrl(value, label = 'adresse web') {
  let url;
  try { url = new URL(value); } catch { throw new Error(`Saisissez une ${label} valide commençant par https:// ou http://.`); }
  if (!['https:', 'http:'].includes(url.protocol) || !url.hostname || url.username || url.password) {
    throw new Error(`Saisissez une ${label} valide commençant par https:// ou http://.`);
  }
  return url.toString();
}
function phoneNumber(value, withPlus = true) {
  let cleaned = value.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = '+' + cleaned.slice(2);
  if (!/^\+?\d{8,15}$/.test(cleaned)) throw new Error('Saisissez un numéro valide avec indicatif international.');
  return withPlus ? cleaned : cleaned.replace(/^\+/, '');
}
function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254;
}

// Seules les propriétés autorisées sont conservées. La même validation s'applique dans le navigateur et sur le serveur.
export function normalizeSnapshot(input, { enforceContrast = true } = {}) {
  if (!input || !QR_TYPES.includes(input.type) || !input.content || typeof input.content !== 'object' || !input.style || typeof input.style !== 'object') {
    throw new Error('Les données du QR code sont invalides.');
  }
  const raw = input.content || {};
  const content = {};
  const type = input.type;
  let payload;
  switch (type) {
    case 'url':
      content.url = normaliseUrl(simple(raw.url, 900)); payload = content.url; break;
    case 'text':
      content.text = simple(raw.text, 900); if (!content.text) throw new Error('Ajoutez votre texte.'); payload = content.text; break;
    case 'whatsapp': {
      content.phone = phoneNumber(simple(raw.phone, 30), false);
      content.message = simple(raw.message, 300);
      payload = `https://wa.me/${content.phone}${content.message ? `?text=${encodeURIComponent(content.message)}` : ''}`;
      break;
    }
    case 'phone':
      content.phone = phoneNumber(simple(raw.phone, 30)); payload = `tel:${content.phone}`; break;
    case 'sms':
      content.phone = phoneNumber(simple(raw.phone, 30)); content.message = simple(raw.message, 300);
      payload = `SMSTO:${content.phone}:${content.message}`; break;
    case 'email': {
      content.email = simple(raw.email, 254); content.subject = simple(raw.subject, 120); content.message = simple(raw.message, 300);
      if (!validEmail(content.email)) throw new Error('Saisissez une adresse e-mail valide.');
      const params = new URLSearchParams();
      if (content.subject) params.set('subject', content.subject);
      if (content.message) params.set('body', content.message);
      payload = `mailto:${content.email}${params.size ? `?${params}` : ''}`;
      break;
    }
    case 'wifi':
      content.wifiName = exact(raw.wifiName, 100);
      content.wifiSecurity = ['WPA', 'WEP', 'nopass'].includes(raw.wifiSecurity) ? raw.wifiSecurity : 'WPA';
      content.wifiPassword = content.wifiSecurity === 'nopass' ? '' : exact(raw.wifiPassword, 100);
      content.hidden = raw.hidden === true;
      if (!content.wifiName.trim()) throw new Error('Indiquez le nom du réseau Wi-Fi.');
      if (content.wifiSecurity !== 'nopass' && !content.wifiPassword) throw new Error('Indiquez le mot de passe Wi-Fi.');
      payload = `WIFI:T:${content.wifiSecurity};S:${wifiEscape(content.wifiName)};P:${content.wifiSecurity === 'nopass' ? '' : wifiEscape(content.wifiPassword)};H:${content.hidden};;`;
      break;
    case 'contact': {
      content.name = simple(raw.name, 100); content.phone = simple(raw.phone, 30); content.email = simple(raw.email, 254);
      content.company = simple(raw.company, 100); content.website = simple(raw.website, 300);
      if (!content.name) throw new Error('Indiquez le nom du contact.');
      if (content.phone) content.phone = phoneNumber(content.phone);
      if (content.email && !validEmail(content.email)) throw new Error('Saisissez une adresse e-mail valide.');
      if (content.website) content.website = normaliseUrl(content.website);
      payload = ['BEGIN:VCARD', 'VERSION:3.0', `FN:${vcardEscape(content.name)}`,
        content.company && `ORG:${vcardEscape(content.company)}`, content.phone && `TEL:${content.phone}`,
        content.email && `EMAIL:${content.email}`, content.website && `URL:${vcardEscape(content.website)}`, 'END:VCARD'].filter(Boolean).join('\n');
      break;
    }
    default: throw new Error('Type de QR code inconnu.');
  }
  if (new TextEncoder().encode(payload).length > 700) throw new Error('Le contenu est trop long. Réduisez-le pour un QR code plus fiable.');
  const source = input.style;
  const style = {
    foreground: HEX.test(source.foreground || '') ? source.foreground.toLowerCase() : DEFAULT_STYLE.foreground,
    background: HEX.test(source.background || '') ? source.background.toLowerCase() : DEFAULT_STYLE.background,
    dots: COLOR_TYPES.has(source.dots) ? source.dots : DEFAULT_STYLE.dots,
    corner: CORNERS.has(source.corner) ? source.corner : DEFAULT_STYLE.corner,
    frame: source.frame === true,
    label: simple(source.label, 28) || 'SCANNEZ-MOI',
    logo: typeof source.logo === 'string' ? source.logo : ''
  };
  if (enforceContrast && !hasGoodContrast(style.foreground, style.background)) throw new Error('Choisissez un QR foncé sur un fond clair avec davantage de contraste.');
  if (style.logo && (!/^data:image\/(png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(style.logo) || style.logo.length > 270000)) {
    throw new Error('Le logo doit être un PNG, JPG ou WebP de 200 Ko maximum.');
  }
  return { type, content, style, payload };
}

function escapeXml(value) {
  return String(value).replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]);
}

/** Generate the same styles for the dummy preview and the paid, server-side SVG export. */
export function renderSvg(raw, { preview = false } = {}) {
  const snapshot = normalizeSnapshot(raw, { enforceContrast: !preview });
  const payload = preview ? 'https://example.com/qr-studio-preview' : snapshot.payload;
  const { style } = snapshot;
  const matrix = QRCode.create(payload, { errorCorrectionLevel: 'H' }).modules;
  const count = matrix.size;
  const unit = 10;
  const quiet = 4 * unit;
  const size = count * unit + quiet * 2;
  const captionHeight = style.frame ? 5.6 * unit : 0;
  const totalHeight = size + captionHeight;
  const parts = [`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${totalHeight}" viewBox="0 0 ${size} ${totalHeight}" role="img" aria-label="QR code${preview ? ' exemple' : ''}">`,
    `<rect width="${size}" height="${totalHeight}" fill="${style.background}"/>`, `<g fill="${style.foreground}">`];
  const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= count - 7) || (r >= count - 7 && c < 7);
  for (let row = 0; row < count; row++) for (let col = 0; col < count; col++) {
    if (!matrix.get(row, col) || isFinder(row, col)) continue;
    const x = quiet + col * unit, y = quiet + row * unit;
    if (style.dots === 'dots') parts.push(`<circle cx="${x + 5}" cy="${y + 5}" r="4.95"/>`);
    else parts.push(`<rect x="${x}" y="${y}" width="${unit}" height="${unit}" rx="${style.dots === 'rounded' ? 2.4 : 0}"/>`);
  }
  parts.push('</g>');
  const positions = [[0, 0], [count - 7, 0], [0, count - 7]];
  for (const [col, row] of positions) {
    const x = quiet + col * unit, y = quiet + row * unit;
    const outer = style.corner === 'circle' ? 35 : style.corner === 'rounded' ? 14 : 0;
    const middle = style.corner === 'circle' ? 25 : style.corner === 'rounded' ? 8 : 0;
    const inner = style.corner === 'circle' ? 15 : style.corner === 'rounded' ? 5 : 0;
    parts.push(`<rect x="${x}" y="${y}" width="70" height="70" rx="${outer}" fill="${style.foreground}"/>`,
      `<rect x="${x + 10}" y="${y + 10}" width="50" height="50" rx="${middle}" fill="${style.background}"/>`,
      `<rect x="${x + 20}" y="${y + 20}" width="30" height="30" rx="${inner}" fill="${style.foreground}"/>`);
  }
  if (style.logo) {
    const s = Math.min(count * unit * 0.16, 80), p = (size - s) / 2;
    parts.push(`<rect x="${p - 5}" y="${p - 5}" width="${s + 10}" height="${s + 10}" rx="8" fill="${style.background}"/>`,
      `<image href="${style.logo}" x="${p}" y="${p}" width="${s}" height="${s}" preserveAspectRatio="xMidYMid meet"/>`);
  }
  if (style.frame) {
    const fontSize = Math.min(17, (size - 28) / Math.max(1, style.label.length) * 1.4);
    parts.push(`<text x="${size / 2}" y="${size + 23}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="${fontSize}" letter-spacing="1.2" fill="${style.foreground}">${escapeXml(style.label.toUpperCase())}</text>`);
  }
  if (preview) {
    parts.push(`<g><rect x="${size * 0.12}" y="${size * 0.46}" width="${size * 0.76}" height="${size * 0.12}" rx="6" fill="#ffffff" fill-opacity="0.96"/>`,
      `<text x="${size / 2}" y="${size * 0.535}" text-anchor="middle" font-family="Arial,sans-serif" font-weight="700" font-size="${size * 0.038}" letter-spacing="2" fill="#5948d8">APERÇU</text></g>`);
  }
  parts.push('</svg>');
  return parts.join('');
}
export function exampleSnapshot(style = DEFAULT_STYLE) {
  return { type: 'url', content: { url: 'https://example.com/qr-studio-preview' }, style };
}
