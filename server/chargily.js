import { AppError, trustedCheckoutUrl } from './common.js';
import { database } from './supabase.js';

function apiBase(env) {
  if (!['test', 'live'].includes(env.CHARGILY_MODE) || !env.CHARGILY_SECRET_KEY) throw new AppError(503, 'Chargily n’est pas configuré.');
  return env.CHARGILY_MODE === 'live' ? 'https://pay.chargily.net/api/v2' : 'https://pay.chargily.net/test/api/v2';
}
async function chargily(env, endpoint, body) {
  const response = await fetch(`${apiBase(env)}${endpoint}`, {
    method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${env.CHARGILY_SECRET_KEY}`, 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {})
  });
  if (!response.ok) throw new AppError(502, 'Chargily est momentanément indisponible.');
  try { return await response.json(); } catch { throw new AppError(502, 'Réponse de paiement invalide.'); }
}
export async function createChargilyCheckout(env, order, origin) {
  const checkout = await chargily(env, '/checkouts', {
    amount: order.amount_dzd, currency: 'dzd', locale: 'fr', chargily_pay_fees_allocation: 'merchant',
    description: 'QR Studio — création d’un QR code personnalisé',
    success_url: `${origin}/?payment=return&order=${order.id}`,
    failure_url: `${origin}/?payment=cancel&order=${order.id}`,
    webhook_endpoint: `${origin}/api/webhook`, metadata: { order_id: order.id }
  });
  if (!checkout.id || !/^[a-zA-Z0-9_-]{6,100}$/.test(checkout.id) || !trustedCheckoutUrl(checkout.checkout_url) ||
      Number(checkout.amount) !== order.amount_dzd || String(checkout.currency).toLowerCase() !== 'dzd' ||
      (typeof checkout.livemode !== 'boolean' || checkout.livemode !== (env.CHARGILY_MODE === 'live'))) {
    throw new AppError(502, 'La session de paiement reçue est invalide.');
  }
  return checkout;
}
export async function retrieveChargilyCheckout(env, id) {
  if (!/^[a-zA-Z0-9_-]{6,100}$/.test(id || '')) throw new AppError(400, 'Identifiant de paiement invalide.');
  return chargily(env, `/checkouts/${encodeURIComponent(id)}`);
}
export function checkoutMatches(env, order, checkout) {
  return checkout && order.payment_mode === env.CHARGILY_MODE && checkout.id === order.provider_checkout_id && checkout.metadata?.order_id === order.id &&
    Number(checkout.amount) === order.amount_dzd && String(checkout.currency).toLowerCase() === 'dzd' &&
    typeof checkout.livemode === 'boolean' && checkout.livemode === (env.CHARGILY_MODE === 'live');
}
export async function reconcileOrder(env, order, checkout = null) {
  if (!order.provider_checkout_id || order.status === 'paid') return order;
  checkout ||= await retrieveChargilyCheckout(env, order.provider_checkout_id);
  if (!checkoutMatches(env, order, checkout)) throw new AppError(403, 'Le paiement ne correspond pas à la commande.');
  const status = checkout.status === 'paid' ? 'paid' : ['failed', 'canceled'].includes(checkout.status) ? checkout.status : null;
  if (!status || status === order.status) return order;
  const patch = { status, updated_at: new Date().toISOString(), ...(status === 'paid' ? { paid_at: new Date().toISOString() } : {}) };
  const rows = await database(env, `qr_studio_orders?id=eq.${encodeURIComponent(order.id)}&status=neq.paid`, {
    method: 'PATCH', headers: { Prefer: 'return=representation' }, body: patch
  });
  return rows?.[0] || order;
}
