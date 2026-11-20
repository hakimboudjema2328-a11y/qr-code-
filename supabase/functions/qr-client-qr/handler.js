import { AppError, hasEncryptionKey, isUuid, json, readJson, siteOrigin, userEndpoint } from '../_shared/common.js';
import { requireClient } from '../_shared/auth-api.js';
import { database } from '../_shared/supabase.js';
import { encryptSnapshot, decryptSnapshot } from '../_shared/crypto.js';
import { normalizeSnapshot, renderQr } from '../_shared/qr.js';
const labels={url:'Lien web',text:'Texte',whatsapp:'WhatsApp',wifi:'Wi-Fi',email:'E-mail',phone:'Téléphone',sms:'SMS',contact:'Contact'};
const dynamicTypes=new Set(['url','whatsapp']);
function dynamicLink(env,id){return `${siteOrigin(env)}/r/${id}`}
async function existing(env,id,userId){
  const rows=await database(env,`qr_studio_client_qrs?id=eq.${encodeURIComponent(id)}&user_id=eq.${encodeURIComponent(userId)}&select=id,is_dynamic,snapshot_ciphertext,snapshot_iv`);
  return rows?.[0]||null;
}
async function svgFor(env,row,userId){
  const snapshot=await decryptSnapshot(row.snapshot_ciphertext,row.snapshot_iv,env.ORDER_ENCRYPTION_KEY,row.id,userId);
  return renderQr(snapshot,{payloadOverride:row.is_dynamic?dynamicLink(env,row.id):''});
}
export async function clientQrHandler(request,env){
  return userEndpoint(request,env,async()=>{
    if (!hasEncryptionKey(env)) throw new AppError(503,'Création momentanément indisponible.');
    const access=await requireClient(request,env),body=await readJson(request),uid=access.user.id;
    if (!isUuid(body.id)) throw new AppError(400,'Identifiant du QR invalide.');
    if (body.action==='export') {
      const row=await existing(env,body.id,uid);
      if (!row) throw new AppError(404,'QR code introuvable.');
      return json({id:row.id,...await svgFor(env,row,uid)});
    }
    if (body.action==='delete') {
      const result=await database(env,'rpc/qr_delete_client_qr',{method:'POST',body:{p_id:body.id,p_user_id:uid,p_version:access.version,p_session:access.session}});
      if (result==='account_unavailable') throw new AppError(403,'Accès désactivé ou session terminée. Contactez-nous.');
      if (result==='not_found') throw new AppError(404,'QR code introuvable.');
      if (result!=='ok') throw new AppError(503,'Suppression temporairement indisponible.');
      return json({id:body.id,deleted:true});
    }
    if (body.action==='create') {
      const found=await existing(env,body.id,uid);
      if (found) return json({id:found.id,...await svgFor(env,found,uid)});
      let snapshot,rendered,isDynamic;
      try {
        snapshot=normalizeSnapshot(body.draft);isDynamic=dynamicTypes.has(snapshot.type);
        if (snapshot.type==='url') {
          const target=new URL(snapshot.payload);
          if (target.origin===siteOrigin(env) && /^\/r\/[0-9a-f-]+\/?$/i.test(target.pathname)) throw Error('Un lien QR Massify ne peut pas être la destination d’un autre QR.');
        }
        rendered=renderQr(snapshot,{payloadOverride:isDynamic?dynamicLink(env,body.id):''});
      } catch(e){throw new AppError(400,e?.message||'QR code invalide.')}
      let title=typeof body.title==='string'?body.title.replace(/[\r\n\t]/g,' ').trim():'';
      if (!title) title=labels[snapshot.type]||'QR code';
      if (title.length>80) throw new AppError(400,'Le nom du QR est trop long.');
      const crypt=await encryptSnapshot(snapshot,env.ORDER_ENCRYPTION_KEY,body.id,uid);
      const result=await database(env,'rpc/qr_create_client_qr_v2',{method:'POST',body:{
        p_id:body.id,p_user_id:uid,p_version:access.version,p_session:access.session,p_title:title,p_qr_type:snapshot.type,p_ciphertext:crypt.snapshot_ciphertext,p_iv:crypt.snapshot_iv,p_dynamic:isDynamic
      }});
      if (result==='quota_reached') throw new AppError(409,'Votre limite de QR est atteinte. Supprimez un QR ou contactez-nous.');
      if (result==='expired') throw new AppError(403,'Votre abonnement a expiré. Contactez-nous pour le renouveler.');
      if (result==='account_unavailable') throw new AppError(403,'Accès désactivé ou session terminée. Contactez-nous.');
      if (result==='rate_limited') throw new AppError(429,'Trop de créations à la fois. Réessayez dans une minute.');
      if (result==='exists') {const row=await existing(env,body.id,uid);if (!row) throw new AppError(503,'QR temporairement indisponible.');return json({id:row.id,...await svgFor(env,row,uid)})}
      if (result!=='ok') throw new AppError(503,'Création temporairement indisponible.');
      return json({id:body.id,...rendered});
    }
    throw new AppError(400,'Action inconnue.');
  });
}
