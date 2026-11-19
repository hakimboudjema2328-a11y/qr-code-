import { AppError } from './common.js';
const alphabet = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function normalizeCode(value) {
  if (typeof value !== 'string' || value.length > 80) return '';
  const code = value.toUpperCase().replace(/[\s-]/g, '');
  return /^[0123456789ABCDEFGHJKMNPQRSTVWXYZ]{26}$/.test(code) ? code : '';
}
export function makeCode() {
  // 128 bits aléatoires, alphabet sans caractères ambigus et groupes lisibles.
  const bits = Array.from(crypto.getRandomValues(new Uint8Array(16)), x => x.toString(2).padStart(8, '0')).join('') + '00';
  const code = bits.match(/.{5}/g).map(x => alphabet[parseInt(x, 2)]).join('');
  return code.match(/.{1,4}/g).join('-');
}
const hex = bytes => Array.from(new Uint8Array(bytes), b => b.toString(16).padStart(2, '0')).join('');
export async function clientEmail(code) {
  const normal = normalizeCode(code);
  if (!normal) throw new AppError(400, 'Code client invalide.');
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('qr-studio-client-v1:' + normal));
  return 'c-' + hex(digest).slice(0, 48) + '@clients.qr-studio.invalid';
}
export async function rateBucket(request, pepper) {
  let secret;
  try { secret = Uint8Array.from(atob(pepper || ''), c => c.charCodeAt(0)); if (secret.length !== 32) throw 0; }
  catch { throw new AppError(503, 'Connexion client temporairement indisponible.'); }
  // Les adresses IP ne sont pas stockées : HMAC non réversible côté base.
  const ip = (request.headers.get('cf-connecting-ip') || request.headers.get('x-forwarded-for')?.split(',')[0] || 'unknown').trim().slice(0, 128);
  const key = await crypto.subtle.importKey('raw', secret, {name:'HMAC', hash:'SHA-256'}, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode('qr-client-rate-v1:' + ip)));
}
