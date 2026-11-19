import { AppError, dbReady, isUuid } from './common.js';
import { currentUser } from './supabase.js';

export async function authAdmin(env, path, method = 'GET', body) {
  if (!dbReady(env)) throw new AppError(503, 'Authentification indisponible.');
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/admin/${path}`, {
    method, headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : {body: JSON.stringify(body)})
  });
  if (!response.ok) throw new AppError(503, 'Impossible de gérer le compte pour le moment.');
  if (response.status === 204) return null;
  try { return await response.json(); } catch { return null; }
}
export async function passwordSession(env, email, password) {
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
    method:'POST', headers:{apikey:env.SUPABASE_ANON_KEY, 'Content-Type':'application/json'}, body:JSON.stringify({email,password})
  });
  if (!response.ok) return {status:response.status, session:null};
  const session = await response.json();
  return {status:response.status,session};
}
export async function requireAdministrator(request, env) {
  const user = await currentUser(request, env);
  const token = request.headers.get('authorization');
  const response = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/qr_is_admin`, {
    method:'POST', headers:{apikey:env.SUPABASE_ANON_KEY, Authorization:token, 'Content-Type':'application/json'}, body:'{}'
  });
  if (!response.ok) throw new AppError(503, 'Vérification des droits administrateur indisponible.');
  if (await response.json() !== true) throw new AppError(403, 'Accès réservé à l’administrateur.');
  return user;
}
export async function requireClient(request, env) {
  const user = await currentUser(request, env); // authentification vérifiée auprès de Supabase
  const match = /^Bearer ([^\s]+)$/.exec(request.headers.get('authorization') || '');
  let claims;
  try {
    const payload=match[1].split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    claims=JSON.parse(atob(payload.padEnd(Math.ceil(payload.length/4)*4,'=')));
  } catch { throw new AppError(401, 'Session invalide.'); }
  const version=claims?.app_metadata?.qr_access_version, session=claims?.session_id;
  if (claims?.sub !== user.id || !isUuid(version) || !isUuid(session)) throw new AppError(403, 'Accès client indisponible.');
  // RLS vérifie la version et l'existence effective de auth.sessions.
  const url=`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/qr_studio_clients?user_id=eq.${encodeURIComponent(user.id)}&select=user_id,client_name,plan_name,expires_at,is_active`;
  const response=await fetch(url,{headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${match[1]}`}});
  if (!response.ok) throw new AppError(503, 'Vérification du compte indisponible.');
  const clients=await response.json();
  if (!clients?.[0]) throw new AppError(403, 'Accès désactivé ou session terminée. Contactez-nous.');
  return {user,client:clients[0],version,session};
}
