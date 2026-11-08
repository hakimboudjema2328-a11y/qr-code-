import { AppError, checkOrigin, handle, isUuid, json, paymentReady, readJson, siteOrigin, trustedCheckoutUrl } from '../../server/common.js';
import { currentUser, database, getSettings } from '../../server/supabase.js';
import { encryptSnapshot } from '../../server/crypto.js';
import { createChargilyCheckout } from '../../server/chargily.js';
import { normalizeSnapshot, renderSvg } from '../../shared/qr.js';
export const onRequestPost = ({ request, env }) => handle(async () => {
  if (!paymentReady(env)) throw new AppError(503, 'Le paiement n’est pas encore configuré.');
  checkOrigin(request, env);
  const user = await currentUser(request, env);
  const body = await readJson(request);
  if (!isUuid(body.attemptId)) throw new AppError(400, 'Identifiant de commande invalide.');
  const previous = await database(env, `qr_studio_orders?payment_mode=eq.${env.CHARGILY_MODE}&user_id=eq.${encodeURIComponent(user.id)}&attempt_id=eq.${encodeURIComponent(body.attemptId)}&select=id,status,provider_checkout_url`);
  if (previous?.[0]) {
    const order = previous[0];
    if (order.status === 'pending' && trustedCheckoutUrl(order.provider_checkout_url)) return json({ id: order.id, checkoutUrl: order.provider_checkout_url });
    if (order.status === 'paid') return json({ id: order.id, paid: true });
    throw new AppError(409, 'Une commande est déjà en cours. Consultez « Mes QR codes ».');
  }
  let snapshot;
  try { snapshot = normalizeSnapshot(body.draft); renderSvg(snapshot); }
  catch (err) { throw new AppError(400, err?.message || 'QR code invalide.'); }
  const settings = await getSettings(env);
  if (!settings.checkout_enabled || !Number.isInteger(settings.price_dzd) || settings.price_dzd < 1) throw new AppError(503, 'Les commandes sont momentanément désactivées.');
  const orderId = crypto.randomUUID();
  const encrypted = await encryptSnapshot(snapshot, env.ORDER_ENCRYPTION_KEY, orderId, user.id);
  const order = { id: orderId, user_id: user.id, customer_email: user.email, attempt_id: body.attemptId, status: 'creating', amount_dzd: settings.price_dzd, currency: 'dzd', payment_mode: env.CHARGILY_MODE, qr_type: snapshot.type, ...encrypted };
  await database(env, 'qr_studio_orders', { method: 'POST', headers: { Prefer: 'return=minimal' }, body: order });
  try {
    const checkout = await createChargilyCheckout(env, order, siteOrigin(env));
    const rows = await database(env, `qr_studio_orders?id=eq.${orderId}&status=eq.creating`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: {
      status: 'pending', provider_checkout_id: checkout.id, provider_checkout_url: checkout.checkout_url, updated_at: new Date().toISOString()
    }});
    if (!rows?.[0]) throw new AppError(503, 'La commande n’a pas pu être enregistrée.');
    return json({ id: orderId, checkoutUrl: checkout.checkout_url });
  } catch (error) {
    try { await database(env, `qr_studio_orders?id=eq.${orderId}&status=eq.creating`, { method: 'PATCH', body: { status: 'error', updated_at: new Date().toISOString() } }); } catch {}
    throw error;
  }
});
