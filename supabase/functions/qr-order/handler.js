import { AppError, isUuid, json, readJson, trustedCheckoutUrl, userEndpoint } from '../_shared/common.js';
import { currentUser, getOrder } from '../_shared/supabase.js';
import { reconcileOrder } from '../_shared/chargily.js';
import { decryptSnapshot } from '../_shared/crypto.js';
import { renderSvg } from '../_shared/qr.js';
export async function orderHandler(request, env) {
  return userEndpoint(request, env, async () => {
    const user = await currentUser(request, env);
    const body = await readJson(request, 8000);
    if (!isUuid(body.id)) throw new AppError(400, 'Commande invalide.');
    let order = await getOrder(env, body.id, user.id);
    if (!order) throw new AppError(404, 'Commande introuvable.');
    if (body.action === 'status') {
      let verification = order.status === 'paid' ? 'already_paid' : 'not_available';
      if (order.status !== 'paid' && order.provider_checkout_id) {
        try { order = await reconcileOrder(env, order); verification = 'checked'; }
        catch { verification = 'unavailable'; /* Ne jamais présenter cet échec comme une vérification réussie. */ }
      }
      return json({ verification, order: { id: order.id, qr_type: order.qr_type, status: order.status, amount_dzd: order.amount_dzd, created_at: order.created_at, paid_at: order.paid_at,
        provider_checkout_url: order.status === 'pending' && trustedCheckoutUrl(order.provider_checkout_url) ? order.provider_checkout_url : null } });
    }
    if (body.action === 'export') {
      if (order.status !== 'paid') throw new AppError(403, 'Le téléchargement sera disponible après confirmation du paiement.');
      const snapshot = await decryptSnapshot(order.snapshot_ciphertext, order.snapshot_iv, env.ORDER_ENCRYPTION_KEY, order.id, user.id);
      return json({ svg: renderSvg(snapshot) });
    }
    throw new AppError(400, 'Action inconnue.');
  });
}
