import { AppError, dbReady, isUuid, json, readJson, userEndpoint } from '../_shared/common.js';
import { database } from '../_shared/supabase.js';
import { clientEmail, normalizeCode, rateBucket } from '../_shared/client-code.js';
import { passwordSession } from '../_shared/auth-api.js';
export async function clientAuthHandler(request, env) {
  return userEndpoint(request, env, async () => {
    if (!dbReady(env)) throw new AppError(503, 'Connexion client indisponible.');
    const body=await readJson(request, 2048), code=normalizeCode(body.code);
    if (!code) throw new AppError(401, 'Code incorrect ou compte indisponible.');
    const bucket=await rateBucket(request,env.CLIENT_RATE_PEPPER);
    const allowed=await database(env,'rpc/qr_client_login_allow',{method:'POST',body:{p_bucket:bucket}});
    if (allowed !== true) throw new AppError(429, 'Trop de tentatives. Réessayez dans 15 minutes.');
    const {status,session}=await passwordSession(env,await clientEmail(code),code);
    if (!session) throw new AppError(status===429?429:401,status===429?'Trop de tentatives. Réessayez plus tard.':'Code incorrect ou compte indisponible.');
    if (!isUuid(session.user?.id) || !session.access_token || !session.refresh_token || !session.user.email_confirmed_at) throw new AppError(401,'Code incorrect ou compte indisponible.');
    const rows=await database(env,`qr_studio_clients?user_id=eq.${encodeURIComponent(session.user.id)}&select=is_active,access_version`);
    if (!rows?.[0]?.is_active || rows[0].access_version !== session.user.app_metadata?.qr_access_version) throw new AppError(401,'Code incorrect ou compte indisponible.');
    return json({access_token:session.access_token,refresh_token:session.refresh_token});
  });
}
