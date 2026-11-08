import { handle, json, trustedCheckoutUrl } from '../../../server/common.js';
import { currentUser, database } from '../../../server/supabase.js';
export const onRequestGet = ({ request, env }) => handle(async () => {
  const user = await currentUser(request, env);
  if (!['test', 'live'].includes(env.CHARGILY_MODE)) return json({ orders: [] });
  const rows = await database(env, `qr_studio_orders?payment_mode=eq.${env.CHARGILY_MODE}&user_id=eq.${encodeURIComponent(user.id)}&select=id,qr_type,status,amount_dzd,currency,created_at,paid_at,provider_checkout_url&order=created_at.desc&limit=100`);
  return json({ orders: (rows || []).map(row => ({ ...row, provider_checkout_url: row.status === 'pending' && trustedCheckoutUrl(row.provider_checkout_url) ? row.provider_checkout_url : null })) });
});
