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

// Env vars stay in Edge Functions; no service-role or payment key reaches a web app.
export function environment() {
  const names = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'PUBLIC_SITE_URL', 'ORDER_ENCRYPTION_KEY', 'CHARGILY_SECRET_KEY', 'CHARGILY_MODE', 'ALLOWED_DEV_ORIGIN', 'ADMIN_EMAIL'];
  return Object.fromEntries(names.map(name => [name, Deno.env.get(name) || '']));
}

export async function userEndpoint(request, env, run, { allowApp = false } = {}) {
  let cors = {};
  try {
    const origin = request.headers.get('origin');
    const allowed = [siteOrigin(env), env.ALLOWED_DEV_ORIGIN, allowApp ? 'https://appassets.androidplatform.net' : null].filter(Boolean);
    if (origin && !allowed.includes(origin)) throw new AppError(403, 'Origine non autorisée.');
    cors = {
      'Access-Control-Allow-Origin': origin || siteOrigin(env),
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin'
    };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') throw new AppError(405, 'Méthode non autorisée.');
    const result = await run();
    for (const [key, value] of Object.entries(cors)) result.headers.set(key, value);
    return result;
  } catch (err) {
    const status = err instanceof AppError ? err.status : 503;
    if (!(err instanceof AppError)) console.error('Edge Function error:', err?.name || 'Error');
    const response = json({ error: err instanceof AppError ? err.message : 'Service temporairement indisponible.' }, status);
    for (const [key, value] of Object.entries(cors)) response.headers.set(key, value);
    return response;
  }
}
