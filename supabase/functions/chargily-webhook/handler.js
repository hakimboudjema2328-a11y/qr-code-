import { AppError, handle, isUuid, json, paymentReady, trustedCheckoutUrl } from '../_shared/common.js';
import { verifyChargilySignature } from '../_shared/crypto.js';
import { database, getOrder } from '../_shared/supabase.js';
import { reconcileOrder, retrieveChargilyCheckout } from '../_shared/chargily.js';
export async function webhookHandler(request, env) {
  return handle(async () => {
    if (request.method !== 'POST') throw new AppError(405, 'Méthode non autorisée.');
    if (!paymentReady(env)) throw new AppError(503, 'Paiement indisponible.');
    if (Number(request.headers.get('content-length') || 0) > 65000) throw new AppError(413, 'Requête trop volumineuse.');
    const body = await request.arrayBuffer();
    if (body.byteLength > 65000) throw new AppError(413, 'Requête trop volumineuse.');
    if (!await verifyChargilySignature(env.CHARGILY_SECRET_KEY, body, request.headers.get('signature'))) throw new AppError(403, 'Signature invalide.');
    let event; try { event = JSON.parse(new TextDecoder().decode(body)); } catch { throw new AppError(400, 'Requête invalide.'); }
    if (!['checkout.paid', 'checkout.failed', 'checkout.canceled'].includes(event?.type)) return json({ received: true });
    const checkout = await retrieveChargilyCheckout(env, event?.data?.id);
    const orderId = checkout?.metadata?.order_id;
    if (!isUuid(orderId)) throw new AppError(403, 'Commande de paiement invalide.');
    let order = await getOrder(env, orderId);
    if (!order) throw new AppError(503, 'Commande non encore enregistrée.');
    const matches = Number(checkout.amount) === order.amount_dzd && String(checkout.currency).toLowerCase() === 'dzd' &&
      typeof checkout.livemode === 'boolean' && checkout.livemode === (env.CHARGILY_MODE === 'live');
    if (!matches || (order.provider_checkout_id && order.provider_checkout_id !== checkout.id)) throw new AppError(403, 'Le paiement ne correspond pas à la commande.');
    // Course : le webhook peut arriver pendant la création de la session.
    // Seule une session récupérée et vérifiée chez Chargily peut être associée.
    if (!order.provider_checkout_id) {
      if (!trustedCheckoutUrl(checkout.checkout_url)) throw new AppError(403, 'Session de paiement invalide.');
      const rows = await database(env, `qr_studio_orders?id=eq.${orderId}&provider_checkout_id=is.null&status=in.(creating,error)`, { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: {
        status: 'pending', provider_checkout_id: checkout.id, provider_checkout_url: checkout.checkout_url, updated_at: new Date().toISOString()
      }});
      order = rows?.[0] || await getOrder(env, orderId);
      if (!order || order.provider_checkout_id !== checkout.id) throw new AppError(503, 'Commande non encore associée.');
    }
    await reconcileOrder(env, order, checkout);
    return json({ received: true });
  });
}
