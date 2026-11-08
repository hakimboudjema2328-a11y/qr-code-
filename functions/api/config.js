import { dbReady, handle, json, paymentReady, publicAuthReady } from '../../server/common.js';
import { getSettings } from '../../server/supabase.js';
export const onRequestGet = ({ env }) => handle(async () => {
  let settings = null;
  if (dbReady(env)) { try { settings = await getSettings(env); } catch { /* Preview remains usable without DB setup. */ } }
  return json({
    supabase: publicAuthReady(env) ? { url: env.SUPABASE_URL, anonKey: env.SUPABASE_ANON_KEY } : null,
    priceDzd: Number.isInteger(settings?.price_dzd) && settings.price_dzd > 0 ? settings.price_dzd : null,
    salesEnabled: !!settings?.checkout_enabled && Number.isInteger(settings?.price_dzd) && settings.price_dzd > 0 && paymentReady(env),
    paymentMode: settings?.checkout_enabled && paymentReady(env) ? env.CHARGILY_MODE : null,
    announcement: settings?.announcement || '', supportEmail: settings?.support_email || ''
  });
});
