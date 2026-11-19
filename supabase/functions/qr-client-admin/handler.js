import { AppError, dbReady, isUuid, json, readJson, userEndpoint } from '../_shared/common.js';
import { database } from '../_shared/supabase.js';
import { authAdmin, passwordSession, requireAdministrator } from '../_shared/auth-api.js';
import { clientEmail, makeCode, normalizeCode } from '../_shared/client-code.js';
function cleanName(value) {
  if (typeof value !== 'string') throw new AppError(400, 'Indiquez le nom du client.');
  const name=value.replace(/[\r\n\t]/g,' ').trim();
  if (!name || name.length > 80) throw new AppError(400,'Le nom doit contenir entre 1 et 80 caractères.');
  return name;
}
function cleanPhone(value) {
  if (!value) return '';
  if (typeof value !== 'string' || value.length > 30 || !/^[+0-9 ()-]+$/.test(value)) throw new AppError(400,'Numéro de téléphone invalide.');
  return value.trim();
}
function cleanExpiry(value) {
  if (value === null || value === '' || value === undefined) return null;
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) throw new AppError(400,'Date de fin invalide.');
  const date=new Date(value);
  if (date.getUTCFullYear()<2000 || date.getUTCFullYear()>2200) throw new AppError(400,'Date de fin invalide.');
  return date.toISOString();
}
async function cancelAllSessions(env,email,code) {
  const {session}=await passwordSession(env,email,normalizeCode(code));
  if (!session?.access_token) throw new AppError(503,'Renouvellement du code impossible pour le moment.');
  const r=await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/logout?scope=global`,{
    method:'POST', headers:{apikey:env.SUPABASE_ANON_KEY,Authorization:`Bearer ${session.access_token}`}
  });
  if (!r.ok) throw new AppError(503,'Impossible de fermer les anciennes sessions.');
}
export async function clientAdminHandler(request,env) {
  return userEndpoint(request,env,async()=>{
    if (!dbReady(env)) throw new AppError(503,'Service administrateur indisponible.');
    await requireAdministrator(request,env);
    const body=await readJson(request,4096);
    if (body.action==='create') {
      const client_name=cleanName(body.client_name),phone=cleanPhone(body.phone),expires_at=cleanExpiry(body.expires_at);
      let plan_id=null,plan_name='';
      if (body.plan_id) {
        if (!isUuid(body.plan_id)) throw new AppError(400,'Abonnement invalide.');
        const plans=await database(env,`qr_studio_plans?id=eq.${encodeURIComponent(body.plan_id)}&select=id,name`);
        if (!plans?.[0]) throw new AppError(400,'Abonnement introuvable.');
        plan_id=plans[0].id;plan_name=plans[0].name;
      }
      const code=makeCode(),version=crypto.randomUUID(),email=await clientEmail(code);
      let user;
      try {
        user=await authAdmin(env,'users','POST',{email,password:normalizeCode(code),email_confirm:true,app_metadata:{qr_access_version:version}});
        if (!isUuid(user?.id)) throw new AppError(503,'Création du compte impossible.');
        await database(env,'qr_studio_clients',{method:'POST',headers:{Prefer:'return=minimal'},body:{user_id:user.id,client_name,phone,plan_id,plan_name,expires_at,access_version:version}});
      } catch(e) {
        if (isUuid(user?.id)) {try {await authAdmin(env,`users/${user.id}`,'DELETE')} catch { /* Le compte orphelin ne dispose d'aucun accès. */ }}
        throw e;
      }
      return json({user_id:user.id,client_name,code});
    }
    if (body.action==='reset_code') {
      if (!isUuid(body.user_id)) throw new AppError(400,'Client invalide.');
      const id=body.user_id;
      const rows=await database(env,`qr_studio_clients?user_id=eq.${id}&select=user_id,client_name,access_version`);
      if (!rows?.[0]) throw new AppError(404,'Client introuvable.');
      const old=rows[0].access_version,version=crypto.randomUUID(),code=makeCode(),email=await clientEmail(code);
      const updated=await database(env,`qr_studio_clients?user_id=eq.${id}&access_version=eq.${old}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:{access_version:version,updated_at:new Date().toISOString()}});
      if (!updated?.length) throw new AppError(409,'Une autre modification est en cours. Réessayez.');
      try {
        const current=await authAdmin(env,`users/${id}`);
        await authAdmin(env,`users/${id}`,'PUT',{email,password:normalizeCode(code),email_confirm:true,app_metadata:{...(current?.app_metadata||{}),qr_access_version:version}});
        await cancelAllSessions(env,email,code);
      } catch(e) {
        // Échec partiel : désactiver le compte plutôt que risquer un ancien accès.
        try {await database(env,`qr_studio_clients?user_id=eq.${id}&access_version=eq.${version}`,{method:'PATCH',body:{is_active:false,updated_at:new Date().toISOString()}})} catch {}
        throw new AppError(503,'Renouvellement incomplet : compte désactivé par sécurité. Réessayez puis réactivez-le.');
      }
      return json({user_id:id,client_name:rows[0].client_name,code});
    }
    throw new AppError(400,'Action inconnue.');
  },{allowApp:true});
}
