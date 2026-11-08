import { AppError, dbReady, isUuid, json, readJson, userEndpoint } from '../_shared/common.js';
import { database } from '../_shared/supabase.js';

// L'e-mail d'administration reste côté serveur. Auth gère le mot de passe et
// produit la session ; aucune clé service-role ni aucun e-mail n'est renvoyé.
export async function adminAuthHandler(request, env) {
  return userEndpoint(request, env, async () => {
    const email = (env.ADMIN_EMAIL || '').trim();
    if (!dbReady(env) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new AppError(503, 'Connexion administrateur non configurée.');
    const body = await readJson(request, 4096);
    const password = body.password;
    if (typeof password !== 'string' || password.length < 8 || password.length > 256) throw new AppError(401, 'Mot de passe incorrect.');
    const allowed = await database(env, 'rpc/qr_admin_login_allow', { method: 'POST', body: {} });
    if (allowed !== true) throw new AppError(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
    const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: env.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    if (!response.ok) {
      if (response.status === 429) throw new AppError(429, 'Trop de tentatives. Réessayez plus tard.');
      throw new AppError(401, 'Mot de passe incorrect.');
    }
    const session = await response.json();
    if (!isUuid(session?.user?.id) || !session.user.email_confirmed_at || !session.access_token || !session.refresh_token) throw new AppError(401, 'Connexion impossible.');
    const admin = await database(env, `qr_studio_admins?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id`);
    if (!admin?.length) throw new AppError(403, 'Accès administrateur non autorisé.');
    try { await database(env, 'rpc/qr_admin_login_reset', { method: 'POST', body: {} }); } catch { /* La session reste valide ; le limiteur se réinitialisera. */ }
    return json({ access_token: session.access_token, refresh_token: session.refresh_token });
  }, { allowApp: true });
}
