export const EMPTY_CONFIG = { supabase: null, priceDzd: null, salesEnabled: false, paymentMode: null, announcement: '', supportEmail: '' };
export async function getConfig() {
  try {
    const response = await fetch('/api/config', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok || !(response.headers.get('content-type') || '').includes('application/json')) return EMPTY_CONFIG;
    return { ...EMPTY_CONFIG, ...(await response.json()) };
  } catch { return EMPTY_CONFIG; }
}
export async function api(path, { token, method = 'GET', body, responseType = 'json' } = {}) {
  const response = await fetch(path, { method, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}), cache: 'no-store' });
  if (!response.ok) {
    let message = 'Une erreur est survenue. Réessayez plus tard.';
    try { const data = await response.json(); if (data.error) message = data.error; } catch {}
    throw new Error(message);
  }
  return responseType === 'text' ? response.text() : response.json();
}
export function money(value) { return Number.isFinite(value) ? `${new Intl.NumberFormat('fr-DZ').format(value)} DA` : 'À définir'; }
export function formatDate(value) { return value ? new Intl.DateTimeFormat('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)) : '—'; }
export function saveFile(blob, name) {
  const url = URL.createObjectURL(blob); const link = document.createElement('a');
  link.href = url; link.download = name; document.body.appendChild(link); link.click(); link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}
export async function downloadQr(token, id, format) {
  const svg = await api(`/api/orders/${encodeURIComponent(id)}/export`, { token, responseType: 'text' });
  if (format === 'svg') { saveFile(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }), `qr-studio-${id.slice(0, 8)}.svg`); return; }
  const blobUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('Impossible de créer le PNG.')); image.src = blobUrl; });
    const canvas = document.createElement('canvas'); canvas.width = 1600; canvas.height = Math.round(1600 * image.naturalHeight / image.naturalWidth);
    const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('Le navigateur ne peut pas générer le PNG.');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!png) throw new Error('Impossible de créer le PNG.');
    saveFile(png, `qr-studio-${id.slice(0, 8)}.png`);
  } finally { URL.revokeObjectURL(blobUrl); }
}
export function validCheckoutUrl(value) {
  try { const url = new URL(value); return url.protocol === 'https:' && ['pay.chargily.net', 'pay.chargily.dz', 'pay.chargily.com'].includes(url.hostname); }
  catch { return false; }
}
