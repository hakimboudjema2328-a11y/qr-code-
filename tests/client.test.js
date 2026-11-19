import assert from 'node:assert/strict';
import { makeCode, normalizeCode, clientEmail } from '../supabase/functions/_shared/client-code.js';
import { clientAuthHandler } from '../supabase/functions/qr-client-auth/handler.js';
import { clientAdminHandler } from '../supabase/functions/qr-client-admin/handler.js';
import { clientQrHandler } from '../supabase/functions/qr-client-qr/handler.js';
import { DEFAULT_STYLE } from '../supabase/functions/_shared/qr.js';

const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', adminId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',version='cccccccc-cccc-4ccc-8ccc-cccccccccccc',sid='dddddddd-dddd-4ddd-8ddd-dddddddddddd', qrId='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const env={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'server-private',PUBLIC_SITE_URL:'https://qr.example',ORDER_ENCRYPTION_KEY:btoa('a'.repeat(32)),CLIENT_RATE_PEPPER:btoa('b'.repeat(32))};
const response=(obj,status=200)=>new Response(obj===null?null:JSON.stringify(obj),{status,headers:{'content-type':'application/json'}});
const jwt=(id=uid,ver=version)=>[btoa('{}'),btoa(JSON.stringify({sub:id,session_id:sid,app_metadata:{qr_access_version:ver}})).replace(/=/g,''),'eA'].join('.');
const req=(body,token=jwt(),origin='https://qr.example')=>new Request('https://mock.supabase.co/functions/v1/test',{method:'POST',headers:{'content-type':'application/json',origin,authorization:'Bearer '+token},body:JSON.stringify(body)});
const clientDraft={type:'url',content:{url:'https://example.com/secret'},style:{...DEFAULT_STYLE}};

Deno.test('codes secrets longs, normalisés et identités synthétiques déterministes',async()=>{
 const a=makeCode(),b=makeCode();assert.notEqual(a,b);assert.equal(normalizeCode(a).length,26);assert.equal(normalizeCode(a.toLowerCase().replaceAll('-',' ')),normalizeCode(a));assert.equal(normalizeCode('ABC'), '');assert.equal(await clientEmail(a),await clientEmail(a.toLowerCase()));assert.match(await clientEmail(a),/@clients\.qr-studio\.invalid$/);
});
Deno.test('connexion client : réponse minimale, droits et limitation',async()=>{
 const orig=globalThis.fetch,code=makeCode();let allow=true,active=true,correct=true;
 globalThis.fetch=async(url,opts={})=>{const u=new URL(url);if(u.pathname.endsWith('/rpc/qr_client_login_allow'))return response(allow);if(u.pathname.endsWith('/auth/v1/token'))return correct?response({access_token:'client-token',refresh_token:'refresh-token',user:{id:uid,email_confirmed_at:'2026',app_metadata:{qr_access_version:version}}}):response({},400);if(u.pathname.endsWith('/qr_studio_clients'))return response([{is_active:active,access_version:version}]);throw Error('unexpected')};
 try{let r=await clientAuthHandler(req({code}),env);assert.equal(r.status,200);assert.deepEqual(await r.json(),{access_token:'client-token',refresh_token:'refresh-token'});correct=false;r=await clientAuthHandler(req({code}),env);assert.equal(r.status,401);correct=true;active=false;r=await clientAuthHandler(req({code}),env);assert.equal(r.status,401);active=true;allow=false;r=await clientAuthHandler(req({code}),env);assert.equal(r.status,429);r=await clientAuthHandler(req({code},jwt(),'https://evil.example'),env);assert.equal(r.status,403)}finally{globalThis.fetch=orig}
});
Deno.test('seul un administrateur crée un client et reçoit le code une fois',async()=>{
 const orig=globalThis.fetch;let isAdmin=true,createdBody=null,stored=null;
 globalThis.fetch=async(url,opts={})=>{const u=new URL(url),body=opts.body?JSON.parse(opts.body):null;
  if(u.pathname.endsWith('/auth/v1/user'))return response({id:adminId,email:'admin@example.com',email_confirmed_at:'2026'});
  if(u.pathname.endsWith('/rpc/qr_is_admin'))return response(isAdmin);
  if(u.pathname.endsWith('/auth/v1/admin/users')&&opts.method==='POST'){createdBody=body;return response({id:uid})}
  if(u.pathname.endsWith('/qr_studio_clients')&&opts.method==='POST'){stored=body;return response(null,204)}
  throw Error('unexpected '+u.pathname)};
 try{let r=await clientAdminHandler(req({action:'create',client_name:'Client test',expires_at:null},jwt(adminId),'https://appassets.androidplatform.net'),env);assert.equal(r.status,200);const data=await r.json();assert.equal(data.client_name,'Client test');assert.equal(normalizeCode(data.code),createdBody.password);assert.equal(await clientEmail(data.code),createdBody.email);assert.ok(!('email' in data));assert.ok(!('code' in stored));assert.equal(stored.user_id,uid);isAdmin=false;r=await clientAdminHandler(req({action:'create',client_name:'X'},jwt(adminId)),env);assert.equal(r.status,403)}finally{globalThis.fetch=orig}
});
Deno.test('QR : accès au seul propriétaire, expiration bloquant seulement les créations et chiffrement',async()=>{
 const orig=globalThis.fetch;let account=true,expiry=false,stored=null;
 globalThis.fetch=async(url,opts={})=>{const u=new URL(url),body=opts.body?JSON.parse(opts.body):null;
  if(u.pathname.endsWith('/auth/v1/user'))return response({id:uid,email:'synthetic@example.invalid',email_confirmed_at:'2026'});
  if(u.pathname.endsWith('/qr_studio_clients'))return response(account?[{user_id:uid,client_name:'Client',plan_name:'',is_active:true,expires_at:null}]:[]);
  if(u.pathname.endsWith('/qr_studio_client_qrs'))return response(stored?[stored]:[]);
  if(u.pathname.endsWith('/rpc/qr_create_client_qr')){if(expiry)return response('expired');stored={id:body.p_id,snapshot_ciphertext:body.p_ciphertext,snapshot_iv:body.p_iv};return response('ok')}
  throw Error('unexpected '+u.pathname)};
 try{let r=await clientQrHandler(req({action:'create',id:qrId,title:'Ma page',draft:clientDraft}),env);assert.equal(r.status,200);let result=await r.json();assert.match(result.svg,/^<svg/);assert.ok(!stored.snapshot_ciphertext.includes('example.com'));expiry=true;r=await clientQrHandler(req({action:'export',id:qrId}),env);assert.equal(r.status,200);assert.match((await r.json()).svg,/^<svg/);stored=null;r=await clientQrHandler(req({action:'create',id:qrId,draft:clientDraft}),env);assert.equal(r.status,403);assert.match((await r.json()).error,/expiré/);account=false;r=await clientQrHandler(req({action:'export',id:qrId}),env);assert.equal(r.status,403);account=true;r=await clientQrHandler(req({action:'export',id:qrId},jwt(adminId)),env);assert.equal(r.status,403)}finally{globalThis.fetch=orig}
});
