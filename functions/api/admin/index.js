import { handle, json, paymentReady } from '../../../server/common.js';
import { adminUser, database, getSettings } from '../../../server/supabase.js';
export const onRequestGet = ({ request, env }) => handle(async () => {
  const user = await adminUser(request, env);
  const mode = ['test', 'live'].includes(env.CHARGILY_MODE) ? env.CHARGILY_MODE : null;
  const [settings, orders] = await Promise.all([getSettings(env), mode ? database(env, `qr_studio_orders?payment_mode=eq.${mode}&select=id,customer_email,status,amount_dzd,currency,qr_type,created_at,paid_at&order=created_at.desc&limit=200`) : Promise.resolve([])]);
  return json({ user, settings, orders: orders || [], ready: paymentReady(env), mode: env.CHARGILY_MODE || null });
});
