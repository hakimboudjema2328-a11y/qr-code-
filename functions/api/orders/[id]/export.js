import { AppError, handle, isUuid } from '../../../../server/common.js';
import { currentUser, getOrder } from '../../../../server/supabase.js';
import { decryptSnapshot } from '../../../../server/crypto.js';
import { renderSvg } from '../../../../shared/qr.js';
export const onRequestGet = ({ request, env, params }) => handle(async () => {
  const user = await currentUser(request, env);
  if (!isUuid(params.id)) throw new AppError(400, 'Commande invalide.');
  const order = await getOrder(env, params.id, user.id);
  if (!order) throw new AppError(404, 'Commande introuvable.');
  if (order.status !== 'paid') throw new AppError(403, 'Le téléchargement sera disponible après confirmation du paiement.');
  const snapshot = await decryptSnapshot(order.snapshot_ciphertext, order.snapshot_iv, env.ORDER_ENCRYPTION_KEY, order.id, user.id);
  const svg = renderSvg(snapshot);
  return new Response(svg, { headers: { 'Content-Type': 'image/svg+xml; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:" } });
});
