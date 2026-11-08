export class AppError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export function json(value, status = 200) {
  return new Response(JSON.stringify(value), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff'
  }});
}
export async function handle(fn) {
  try { return await fn(); }
  catch (err) {
    if (err instanceof AppError) return json({ error: err.message }, err.status);
    console.error('Erreur interne API', err?.name || 'Error');
    return json({ error: 'Service temporairement indisponible. Réessayez plus tard.' }, 503);
  }
}
export async function readJson(request, limit = 350_000) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new AppError(415, 'Format JSON requis.');
  const length = Number(request.headers.get('content-length') || 0);
  if (length > limit) throw new AppError(413, 'Fichier trop volumineux.');
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > limit) throw new AppError(413, 'Fichier trop volumineux.');
  try { const value = JSON.parse(raw); if (!value || Array.isArray(value) || typeof value !== 'object') throw 0; return value; }
  catch { throw new AppError(400, 'Requête invalide.'); }
}
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
export function siteOrigin(env) {
  try {
    const u = new URL(env.PUBLIC_SITE_URL);
    if (u.protocol !== 'https:' || u.username || u.password || u.pathname !== '/' || u.search || u.hash) throw 0;
    return u.origin;
  } catch { throw new AppError(503, 'L’adresse HTTPS du site n’est pas configurée.'); }
}
export function validSupabaseUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash; }
  catch { return false; }
}
export function publicAuthReady(env) { return validSupabaseUrl(env.SUPABASE_URL) && !!env.SUPABASE_ANON_KEY; }
export function dbReady(env) { return publicAuthReady(env) && !!env.SUPABASE_SERVICE_ROLE_KEY; }
export function hasEncryptionKey(env) {
  try { return typeof env.ORDER_ENCRYPTION_KEY === 'string' && atob(env.ORDER_ENCRYPTION_KEY.trim()).length === 32; } catch { return false; }
}
export function paymentReady(env) {
  if (!dbReady(env) || !hasEncryptionKey(env) || !env.CHARGILY_SECRET_KEY || !['test', 'live'].includes(env.CHARGILY_MODE)) return false;
  try { siteOrigin(env); return true; } catch { return false; }
}
export function trustedCheckoutUrl(value) {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && ['pay.chargily.net', 'pay.chargily.dz', 'pay.chargily.com'].includes(u.hostname); }
  catch { return false; }
}
export function checkOrigin(request, env) {
  const origin = request.headers.get('origin');
  if (origin && origin !== siteOrigin(env)) throw new AppError(403, 'Origine non autorisée.');
}
