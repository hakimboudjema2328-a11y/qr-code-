import { AppError } from './common.js';
const enc = new TextEncoder();
function bytesToBase64(bytes) {
  let out = '';
  for (let i = 0; i < bytes.length; i += 0x8000) out += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(out);
}
function base64ToBytes(value) {
  const binary = atob(value); return Uint8Array.from(binary, c => c.charCodeAt(0));
}
async function aesKey(secret) {
  try {
    const bytes = base64ToBytes(secret.trim());
    if (bytes.length !== 32) throw 0;
    return await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } catch { throw new AppError(503, 'La clé de chiffrement n’est pas configurée.'); }
}
export async function encryptSnapshot(snapshot, secret, orderId, userId) {
  const key = await aesKey(secret); const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: enc.encode(`${orderId}:${userId}`) }, key, enc.encode(JSON.stringify(snapshot)));
  return { snapshot_ciphertext: bytesToBase64(new Uint8Array(encrypted)), snapshot_iv: bytesToBase64(iv) };
}
export async function decryptSnapshot(ciphertext, iv, secret, orderId, userId) {
  try {
    const key = await aesKey(secret);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(iv), additionalData: enc.encode(`${orderId}:${userId}`) }, key, base64ToBytes(ciphertext));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch { throw new AppError(503, 'La création ne peut pas être déchiffrée.'); }
}
