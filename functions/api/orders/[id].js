import { AppError, handle, isUuid, json, trustedCheckoutUrl } from '../../../server/common.js';
import { currentUser, getOrder } from '../../../server/supabase.js';
import { reconcileOrder } from '../../../server/chargily.js';
export const onRequestGet = ({ request, env, params }) => handle(async () => {
  const user = await currentUser(request, env);
  if (!isUuid(params.id)) throw new AppError(400, 'Commande invalide.');
  let order = await getOrder(env, params.id, user.id);
  if (!order) throw new AppError(404, 'Commande introuvable.');
  if (order.status === 'pending' && order.provider_checkout_id) {
    try { order = await reconcileOrder(env, order); } catch { /* A later retry/webhook may resolve it. Never trust the redirect. */ }
  }
  return json({ order: { id: order.id, qr_type: order.qr_type, status: order.status, amount_dzd: order.amount_dzd, created_at: order.created_at, paid_at: order.paid_at,
    provider_checkout_url: order.status === 'pending' && trustedCheckoutUrl(order.provider_checkout_url) ? order.provider_checkout_url : null } });
});
