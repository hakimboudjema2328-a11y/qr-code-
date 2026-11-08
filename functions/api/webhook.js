import { AppError, handle, json, paymentReady } from '../../server/common.js';
import { verifyChargilySignature } from '../../server/crypto.js';
import { database } from '../../server/supabase.js';
import { reconcileOrder, retrieveChargilyCheckout } from '../../server/chargily.js';
export const onRequestPost = ({ request, env }) => handle(async () => {
  if (!paymentReady(env)) throw new AppError(503, 'Paiement indisponible.');
  if (Number(request.headers.get('content-length') || 0) > 65000) throw new AppError(413, 'Requête trop volumineuse.');
  const body = await request.arrayBuffer();
  if (body.byteLength > 65000) throw new AppError(413, 'Requête trop volumineuse.');
  if (!await verifyChargilySignature(env.CHARGILY_SECRET_KEY, body, request.headers.get('signature'))) throw new AppError(403, 'Signature invalide.');
  let event; try { event = JSON.parse(new TextDecoder().decode(body)); } catch { throw new AppError(400, 'Requête invalide.'); }
  if (!['checkout.paid', 'checkout.failed', 'checkout.canceled'].includes(event?.type)) return json({ received: true });
  const id = event?.data?.id;
  const checkout = await retrieveChargilyCheckout(env, id);
  const rows = await database(env, `qr_studio_orders?payment_mode=eq.${env.CHARGILY_MODE}&provider_checkout_id=eq.${encodeURIComponent(id)}&select=*`);
  if (!rows?.[0]) throw new AppError(503, 'Commande non encore enregistrée.');
  await reconcileOrder(env, rows[0], checkout);
  return json({ received: true });
});
