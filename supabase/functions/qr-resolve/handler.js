import { dbReady, hasEncryptionKey, isUuid, siteOrigin } from '../_shared/common.js';
import { database } from '../_shared/supabase.js';
import { decryptSnapshot } from '../_shared/crypto.js';

const headers = {
  'Cache-Control': 'no-store, max-age=0',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
  'X-Robots-Tag': 'noindex, nofollow',
  'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"
};
function page(status, title, detail) {
  // Supabase deliberately serves function HTML as plain text for safety. Return
  // a readable message rather than HTML markup if a link cannot be opened.
  return new Response(`${title}\n\n${detail}\n\nMassify-qrcode`, {status,headers:{...headers,'Content-Type':'text/plain; charset=utf-8'}});
}
const missing=()=>page(404,'Ce QR n’est plus disponible.','Le lien a été supprimé, désactivé ou n’existe pas.');
const unavailable=()=>page(503,'Service momentanément indisponible.','Vérifiez votre connexion et réessayez dans quelques instants.');

// The identifier is deliberately unguessable (UUIDv4) and is the public link.
// No anonymous SQL access: only this endpoint calls the narrowly scoped service RPC.
export async function resolveQrHandler(request, env) {
  if (request.method !== 'GET') return new Response(null,{status:405,headers:{...headers,Allow:'GET'}});
  let id;
  try {
    const url=new URL(request.url);
    const match=url.pathname.match(/\/qr-resolve\/([0-9a-f-]+)\/?$/i);
    id=match?.[1];
  } catch { return missing(); }
  if (!isUuid(id)) return missing();
  if (!dbReady(env) || !hasEncryptionKey(env)) return unavailable();
  try {
    const rows=await database(env,'rpc/qr_resolve_client_qr',{method:'POST',body:{p_id:id}});
    const row=rows?.[0];
    if (!row) return missing();
    const snapshot=await decryptSnapshot(row.snapshot_ciphertext,row.snapshot_iv,env.ORDER_ENCRYPTION_KEY,row.id,row.user_id);
    if (!['url','whatsapp'].includes(snapshot?.type) || typeof snapshot.payload!=='string' || snapshot.payload.length>2500) return unavailable();
    const target=new URL(snapshot.payload);
    if (!['https:','http:'].includes(target.protocol) || !target.hostname || target.username || target.password) return unavailable();
    if (snapshot.type==='whatsapp' && (target.protocol!=='https:' || target.hostname!=='wa.me' || target.port)) return unavailable();
    // Prevent direct loops through the branded redirector.
    if (target.origin===siteOrigin(env) && /^\/r\/[0-9a-f-]+\/?$/i.test(target.pathname)) return unavailable();
    return new Response(null,{status:302,headers:{...headers,Location:target.href}});
  } catch (error) {
    console.error('QR resolution unavailable:',error?.name||'Error');
    return unavailable();
  }
}
