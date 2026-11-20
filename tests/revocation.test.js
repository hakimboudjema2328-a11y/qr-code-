import assert from 'node:assert/strict';
import { clientQrHandler } from '../supabase/functions/qr-client-qr/handler.js';
import { clientAdminHandler } from '../supabase/functions/qr-client-admin/handler.js';
import { resolveQrHandler } from '../supabase/functions/qr-resolve/handler.js';
import { encryptSnapshot } from '../supabase/functions/_shared/crypto.js';
import { DEFAULT_STYLE, normalizeSnapshot, renderQr } from '../supabase/functions/_shared/qr.js';

const uid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', admin='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', version='cccccccc-cccc-4ccc-8ccc-cccccccccccc', session='dddddddd-dddd-4ddd-8ddd-dddddddddddd', id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const env={SUPABASE_URL:'https://mock.supabase.co',SUPABASE_ANON_KEY:'public',SUPABASE_SERVICE_ROLE_KEY:'private',PUBLIC_SITE_URL:'https://massify.example',ORDER_ENCRYPTION_KEY:btoa('x'.repeat(32))};
const json=(x,status=200)=>new Response(x===null?null:JSON.stringify(x),{status,headers:{'Content-Type':'application/json'}});
const jwt=(user=uid)=>[btoa('{}'),btoa(JSON.stringify({sub:user,session_id:session,app_metadata:{qr_access_version:version}})).replace(/=/g,''),'eA'].join('.');
const post=(body,user=uid)=>new Request('https://mock.supabase.co/functions/v1/test',{method:'POST',headers:{'Content-Type':'application/json',Origin:'https://massify.example',Authorization:'Bearer '+jwt(user)},body:JSON.stringify(body)});
const get=(value=id)=>new Request('https://mock.supabase.co/functions/v1/qr-resolve/'+value);
const draft=(type='url',content={url:'https://example.com/ma-page'})=>({type,content,style:{...DEFAULT_STYLE}});

Deno.test('le résolveur ne renvoie que des redirections HTTP non mises en cache',async()=>{
 const orig=globalThis.fetch;const snapshot=normalizeSnapshot(draft());const crypt=await encryptSnapshot(snapshot,env.ORDER_ENCRYPTION_KEY,id,uid);let active=true;
 globalThis.fetch=async(url,opts={})=>{assert.ok(String(url).endsWith('/rpc/qr_resolve_client_qr'));assert.deepEqual(JSON.parse(opts.body),{p_id:id});return json(active?[{id,user_id:uid,...crypt}]:[])};
 try{
  let r=await resolveQrHandler(get(),env);assert.equal(r.status,302);assert.equal(r.headers.get('location'),'https://example.com/ma-page');assert.match(r.headers.get('cache-control'),/no-store/);assert.equal(r.headers.get('referrer-policy'),'no-referrer');assert.equal(await r.text(),'');
  active=false;r=await resolveQrHandler(get(),env);assert.equal(r.status,404);assert.match(await r.text(),/n’est plus disponible/);
  assert.equal((await resolveQrHandler(get('invalid'),env)).status,404);
  assert.equal((await resolveQrHandler(new Request(get().url,{method:'POST'}),env)).status,405);
 }finally{globalThis.fetch=orig}
});

Deno.test('le résolveur refuse les contenus non HTTP ou altérés',async()=>{
 const orig=globalThis.fetch;let crypt=await encryptSnapshot({type:'url',payload:'javascript:alert(1)'},env.ORDER_ENCRYPTION_KEY,id,uid);
 globalThis.fetch=async()=>json([{id,user_id:uid,...crypt}]);
 try{
  let r=await resolveQrHandler(get(),env);assert.equal(r.status,503);assert.equal(r.headers.get('location'),null);
  crypt=await encryptSnapshot({type:'url',payload:'https://massify.example/r/'+id},env.ORDER_ENCRYPTION_KEY,id,uid);r=await resolveQrHandler(get(),env);assert.equal(r.status,503);
  crypt=await encryptSnapshot({type:'whatsapp',payload:'https://evil.example/'},env.ORDER_ENCRYPTION_KEY,id,uid);r=await resolveQrHandler(get(),env);assert.equal(r.status,503);
 }finally{globalThis.fetch=orig}
});

Deno.test('création : liens et WhatsApp désactivables, Wi-Fi natif, limite et propriété imposées',async()=>{
 const orig=globalThis.fetch;let stored=null,quota=false,deleteOwner='',lastBody;
 globalThis.fetch=async(url,opts={})=>{const u=new URL(url),body=opts.body?JSON.parse(opts.body):null;
  if(u.pathname.endsWith('/auth/v1/user'))return json({id:uid,email:'client@example.invalid',email_confirmed_at:'2026'});
  if(u.pathname.endsWith('/qr_studio_clients'))return json([{user_id:uid,is_active:true}]);
  if(u.pathname.endsWith('/qr_studio_client_qrs'))return json(stored?[stored]:[]);
  if(u.pathname.endsWith('/rpc/qr_create_client_qr_v2')){lastBody=body;if(quota)return json('quota_reached');stored={id:body.p_id,is_dynamic:body.p_dynamic,snapshot_ciphertext:body.p_ciphertext,snapshot_iv:body.p_iv};return json('ok')}
  if(u.pathname.endsWith('/rpc/qr_delete_client_qr')){deleteOwner=body.p_user_id;return json('not_found')}
  throw Error('unexpected '+u.pathname);
 };
 try{
  for(const [type,content,expected] of [['url',{url:'https://example.com/ma-page'},true],['whatsapp',{phone:'+213555123456',message:'Bonjour'},true],['wifi',{wifiName:'Salon',wifiPassword:'secret',wifiSecurity:'WPA'},false]]){
   stored=null;const r=await clientQrHandler(post({action:'create',id,draft:draft(type,content)}),env);assert.equal(r.status,200);assert.equal(lastBody.p_dynamic,expected);assert.equal(lastBody.p_user_id,uid);assert.ok(!lastBody.p_ciphertext.includes('secret'));
   const body=await r.json(),want=renderQr(normalizeSnapshot(draft(type,content)),{payloadOverride:expected?`${env.PUBLIC_SITE_URL}/r/${id}`:''});assert.equal(body.svg,want.svg);
   const repeat=await clientQrHandler(post({action:'export',id}),env);assert.equal((await repeat.json()).svg,body.svg);
  }
  stored=null;quota=true;let r=await clientQrHandler(post({action:'create',id,draft:draft()}),env);assert.equal(r.status,409);assert.match((await r.json()).error,/limite/i);
  r=await clientQrHandler(post({action:'delete',id,user_id:admin}),env);assert.equal(r.status,404);assert.equal(deleteOwner,uid);
  quota=false;r=await clientQrHandler(post({action:'create',id,draft:draft('url',{url:`${env.PUBLIC_SITE_URL}/r/${id}?x=1`})}),env);assert.equal(r.status,400);
 }finally{globalThis.fetch=orig}
});

Deno.test('suppression administrateur : désactivation avant Auth, protection admin et échec sûr',async()=>{
 const orig=globalThis.fetch;let events=[],isAdmin=true,targetIsAdmin=false,authFails=false;
 globalThis.fetch=async(url,opts={})=>{const u=new URL(url);events.push((opts.method||'GET')+' '+u.pathname);
  if(u.pathname.endsWith('/auth/v1/user'))return json({id:admin,email:'admin@example.com',email_confirmed_at:'2026'});
  if(u.pathname.endsWith('/rpc/qr_is_admin'))return json(isAdmin);
  if(u.pathname.endsWith('/qr_studio_admins'))return json(targetIsAdmin?[{user_id:uid}]:[]);
  if(u.pathname.endsWith('/qr_studio_clients')&&opts.method==='PATCH'){assert.equal(JSON.parse(opts.body).is_active,false);return json([{user_id:uid}])}
  if(u.pathname.endsWith('/auth/v1/admin/users/'+uid)&&opts.method==='DELETE')return json(authFails?{}:null,authFails?503:204);
  throw Error('unexpected '+u.pathname);
 };
 try{
  let r=await clientAdminHandler(post({action:'delete',user_id:uid},admin),env);assert.equal(r.status,200);assert.ok(events.findIndex(x=>x.startsWith('PATCH '))<events.findIndex(x=>x.startsWith('DELETE ')));
  events=[];authFails=true;r=await clientAdminHandler(post({action:'delete',user_id:uid},admin),env);assert.equal(r.status,503);assert.match((await r.json()).error,/désactivé.*incomplète/i);assert.ok(events.some(x=>x.startsWith('PATCH ')));
  events=[];authFails=false;targetIsAdmin=true;r=await clientAdminHandler(post({action:'delete',user_id:uid},admin),env);assert.equal(r.status,403);assert.ok(!events.some(x=>x.startsWith('PATCH ')));
  events=[];targetIsAdmin=false;isAdmin=false;r=await clientAdminHandler(post({action:'delete',user_id:uid},admin),env);assert.equal(r.status,403);assert.ok(!events.some(x=>x.startsWith('PATCH ')));
 }finally{globalThis.fetch=orig}
});

Deno.test('prolongation et quotas : seuls des entiers valides sont acceptés',async()=>{
 const orig=globalThis.fetch;let bodySeen;
 globalThis.fetch=async(url,opts={})=>{const u=new URL(url);
  if(u.pathname.endsWith('/auth/v1/user'))return json({id:admin,email:'admin@example.com',email_confirmed_at:'2026'});
  if(u.pathname.endsWith('/rpc/qr_is_admin'))return json(true);
  if(u.pathname.endsWith('/rpc/qr_extend_client')){bodySeen=JSON.parse(opts.body);return json([{status:'ok',expires_at:'2030-01-01T00:00:00Z'}])}
  throw Error('unexpected '+u.pathname);
 };
 try{
  let r=await clientAdminHandler(post({action:'extend',user_id:uid,days:30},admin),env);assert.equal(r.status,200);assert.deepEqual(bodySeen,{p_user_id:uid,p_days:30});
  for(const days of [0,-1,36501,1.5,'30']){r=await clientAdminHandler(post({action:'extend',user_id:uid,days},admin),env);assert.equal(r.status,400)}
  for(const qr_limit of [-1,100001,1.5,'3']){r=await clientAdminHandler(post({action:'create',client_name:'Test',qr_limit},admin),env);assert.equal(r.status,400)}
 }finally{globalThis.fetch=orig}
});
