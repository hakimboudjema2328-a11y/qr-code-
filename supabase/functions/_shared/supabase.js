import { AppError, dbReady, publicAuthReady } from './common.js';

export async function database(env, path, options = {}) {
  if (!dbReady(env)) throw new AppError(503, 'La base de données n’est pas configurée.');
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/${path}`, {
    method: options.method || 'GET', headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json', ...(options.headers || {})
    }, ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) })
  });
  if (!response.ok) {
    if (response.status === 409) throw new AppError(409, 'Cette opération existe déjà.');
    throw new AppError(503, 'La base de données est temporairement indisponible.');
  }
  if (response.status === 204) return null;
  try { return await response.json(); } catch { return null; }
}
export async function currentUser(request, env) {
  if (!publicAuthReady(env)) throw new AppError(503, 'La connexion n’est pas encore configurée.');
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '');
  if (!match) throw new AppError(401, 'Connectez-vous pour continuer.');
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, Authorization: `Bearer ${match[1]}` }
  });
  if (!response.ok) throw new AppError(401, 'Votre session a expiré. Reconnectez-vous.');
  const user = await response.json();
  if (!user.id || !user.email || !user.email_confirmed_at) throw new AppError(403, 'Confirmez votre adresse e-mail avant de continuer.');
  return { id: user.id, email: user.email };
}
export async function adminUser(request, env) {
  const user = await currentUser(request, env);
  if (!env.ADMIN_USER_ID || user.id !== env.ADMIN_USER_ID.trim()) throw new AppError(403, 'Accès réservé à l’administrateur.');
  return user;
}
export async function getSettings(env) {
  const rows = await database(env, 'qr_studio_settings?id=eq.1&select=id,price_dzd,checkout_enabled,payment_mode,announcement,support_email');
  if (!rows?.[0]) throw new AppError(503, 'Les paramètres du site ne sont pas initialisés.');
  return rows[0];
}
export async function getOrder(env, id, userId = null) {
  if (!['test', 'live'].includes(env.CHARGILY_MODE)) return null;
  const filter = `id=eq.${encodeURIComponent(id)}&payment_mode=eq.${env.CHARGILY_MODE}` + (userId ? `&user_id=eq.${encodeURIComponent(userId)}` : '');
  const rows = await database(env, `qr_studio_orders?${filter}&select=*`);
  return rows?.[0] || null;
}
