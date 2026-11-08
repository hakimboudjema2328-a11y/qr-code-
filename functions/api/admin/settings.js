import { AppError, checkOrigin, handle, json, paymentReady, readJson } from '../../../server/common.js';
import { adminUser, database } from '../../../server/supabase.js';
export const onRequestPatch = ({ request, env }) => handle(async () => {
  checkOrigin(request, env); await adminUser(request, env);
  const body = await readJson(request, 5000);
  const amount = body.price_dzd === null || body.price_dzd === '' ? null : Number(body.price_dzd);
  if (amount !== null && (!Number.isSafeInteger(amount) || amount < 1 || amount > 10_000_000)) throw new AppError(400, 'Indiquez un prix entier positif en dinars.');
  if (typeof body.checkout_enabled !== 'boolean') throw new AppError(400, 'Paramètre de vente invalide.');
  if (body.checkout_enabled && (!amount || !paymentReady(env))) throw new AppError(400, 'Définissez d’abord un prix et configurez Supabase, Chargily et l’adresse du site.');
  const announcement = typeof body.announcement === 'string' ? body.announcement.trim().slice(0, 180) : '';
  const supportEmail = typeof body.support_email === 'string' ? body.support_email.trim().slice(0, 254) : '';
  if (supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) throw new AppError(400, 'Adresse e-mail de support invalide.');
  const rows = await database(env, 'qr_studio_settings?id=eq.1', { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: {
    price_dzd: amount, checkout_enabled: body.checkout_enabled, announcement, support_email: supportEmail, updated_at: new Date().toISOString()
  }});
  if (!rows?.[0]) throw new AppError(503, 'Paramètres non initialisés.');
  return json({ settings: rows[0] });
});
