import assert from 'node:assert/strict';
import { adminAuthHandler } from '../supabase/functions/qr-admin-auth/handler.js';
const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const env={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'service-secret',PUBLIC_SITE_URL:'https://qr.example',ADMIN_EMAIL:'owner@example.com'};
const req=(password,origin='https://qr.example')=>new Request('https://mock.supabase.co/functions/v1/qr-admin-auth',{method:'POST',headers:{'content-type':'application/json','origin':origin},body:JSON.stringify({password})});
function mocks({allow=true,valid=true,isAdmin=true}={}){
 let calls=[];return {calls,fetch:async(url,opts={})=>{
  const u=new URL(url),body=opts.body?JSON.parse(opts.body):{};calls.push({path:u.pathname,body});
  const response=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
  if(u.pathname.endsWith('/rpc/qr_admin_login_allow'))return response(allow);
  if(u.pathname.endsWith('/rpc/qr_admin_login_reset'))return response(null);
  if(u.pathname.endsWith('/auth/v1/token'))return valid?response({access_token:'access',refresh_token:'refresh',user:{id:adminId,email:'owner@example.com',email_confirmed_at:'2026-01-01'}}):response({},400);
  if(u.pathname.endsWith('/qr_studio_admins'))return response(isAdmin?[{user_id:adminId}]:[]);
  throw Error('Unexpected request');
 }};
}
Deno.test('connexion admin au mot de passe seul avec rôle vérifié et e-mail non renvoyé',async()=>{
 const orig=globalThis.fetch,m=mocks();globalThis.fetch=m.fetch;try{
  const r=await adminAuthHandler(req('password-example','https://appassets.androidplatform.net'),env);assert.equal(r.status,200);const body=await r.json();assert.deepEqual(body,{access_token:'access',refresh_token:'refresh'});assert.ok(!JSON.stringify(body).includes(env.ADMIN_EMAIL));assert.equal(m.calls.find(x=>x.path.endsWith('/auth/v1/token')).body.email,env.ADMIN_EMAIL);
 }finally{globalThis.fetch=orig}
});
Deno.test('mauvais mot de passe, absence du rôle et limite de tentatives échouent fermés',async()=>{
 const orig=globalThis.fetch;try{
  let m=mocks({valid:false});globalThis.fetch=m.fetch;let r=await adminAuthHandler(req('password-example'),env);assert.equal(r.status,401);assert.ok(!JSON.stringify(await r.json()).includes(env.ADMIN_EMAIL));
  m=mocks({isAdmin:false});globalThis.fetch=m.fetch;r=await adminAuthHandler(req('password-example'),env);assert.equal(r.status,403);
  m=mocks({allow:false});globalThis.fetch=m.fetch;r=await adminAuthHandler(req('password-example'),env);assert.equal(r.status,429);assert.equal(m.calls.some(x=>x.path.endsWith('/auth/v1/token')),false);
  r=await adminAuthHandler(req('password-example','https://evil.example'),env);assert.equal(r.status,403);
 }finally{globalThis.fetch=orig}
});
