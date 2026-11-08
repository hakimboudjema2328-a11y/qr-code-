import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { checkoutHandler } from '../supabase/functions/qr-checkout/handler.js';
import { webhookHandler } from '../supabase/functions/chargily-webhook/handler.js';
import { orderHandler } from '../supabase/functions/qr-order/handler.js';
import { DEFAULT_STYLE } from '../supabase/functions/_shared/qr.js';
const buyer = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const env = { SUPABASE_URL:'https://example.supabase.co', SUPABASE_ANON_KEY:'public-test', SUPABASE_SERVICE_ROLE_KEY:'server-only-test', ORDER_ENCRYPTION_KEY:randomBytes(32).toString('base64'), CHARGILY_MODE:'test', CHARGILY_SECRET_KEY:'test-secret', PUBLIC_SITE_URL:'https://qr.example' };
const asJson = (data,status=200) => new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json'}});
const req = (body, token='buyer', origin='https://qr.example') => new Request('https://example.supabase.co/functions/v1/test',{method:'POST',headers:{Authorization:`Bearer ${token}`,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify(body)});
function webhookRequest(raw,signature){return new Request('https://example.supabase.co/functions/v1/chargily-webhook',{method:'POST',headers:{'Content-Type':'application/json',signature},body:raw})}
function mockServices() {
  const state={settings:{id:1,price_dzd:850,checkout_enabled:true,payment_mode:'test',announcement:'',support_email:''},orders:[],checkouts:{},createdRequest:null,afterCreate:null};
  const fetch=async(url,opts={})=>{
    const u=new URL(url),method=opts.method||'GET';
    if(u.hostname==='example.supabase.co'&&u.pathname==='/auth/v1/user'){
      const token=(opts.headers?.Authorization||'').replace('Bearer ',''); const identity={buyer,other}[token];
      return identity?asJson({id:identity,email:`${token}@example.com`,email_confirmed_at:'2025-01-01T00:00:00Z'}):asJson({},401);
    }
    if(u.hostname==='example.supabase.co'&&u.pathname==='/rest/v1/qr_studio_settings')return asJson([state.settings]);
    if(u.hostname==='example.supabase.co'&&u.pathname==='/rest/v1/qr_studio_orders'){
      if(method==='POST'){const row=JSON.parse(opts.body);if(state.orders.some(o=>o.user_id===row.user_id&&o.attempt_id===row.attempt_id))return asJson({},409);state.orders.push(row);return new Response(null,{status:204})}
      const result=state.orders.filter(row=>{
        for(const name of ['id','user_id','attempt_id','provider_checkout_id','status','payment_mode']){
          const filter=u.searchParams.get(name); if(!filter)continue;
          if(filter.startsWith('eq.')&&String(row[name])!==filter.slice(3))return false;
          if(filter.startsWith('neq.')&&String(row[name])===filter.slice(4))return false;
          if(filter==='is.null'&&row[name]!=null)return false;
          if(filter.startsWith('in.(')&&!filter.slice(4,-1).split(',').includes(row[name]))return false;
        }return true;
      });
      if(method==='PATCH')result.forEach(row=>Object.assign(row,JSON.parse(opts.body)));
      return opts.headers?.Prefer==='return=minimal'?new Response(null,{status:204}):asJson(result);
    }
    if(u.hostname==='pay.chargily.net'&&u.pathname==='/test/api/v2/checkouts'&&method==='POST'){
      const body=JSON.parse(opts.body);state.createdRequest=body;const object={id:'checkout_123456',amount:body.amount,currency:body.currency,livemode:false,metadata:body.metadata,status:'pending',checkout_url:'https://pay.chargily.dz/test/checkouts/checkout_123456/pay'};
      state.checkouts[object.id]=object;if(state.afterCreate)await state.afterCreate(object);return asJson(object);
    }
    if(u.hostname==='pay.chargily.net'&&u.pathname.startsWith('/test/api/v2/checkouts/')){
      const object=state.checkouts[u.pathname.split('/').pop()];return object?asJson(object):asJson({},404);
    }
    throw new Error(`Unexpected mock request: ${method} ${u.origin}${u.pathname}`);
  };
  return {state,fetch};
}
const draft={type:'url',content:{url:'https://client.example/important'},style:{...DEFAULT_STYLE}};
Deno.test('paiement : prix serveur, chiffrement, signature, séparation test/réel et export autorisé',async()=>{
 const original=globalThis.fetch,mock=mockServices();globalThis.fetch=mock.fetch;
 try{
  const attemptId=randomUUID();let r=await checkoutHandler(req({draft,attemptId,price:1}),env);assert.equal(r.status,200);const start=await r.json();assert.match(start.checkoutUrl,/^https:\/\/pay\.chargily\.dz/);
  assert.equal(mock.state.createdRequest.amount,850);assert.equal(mock.state.createdRequest.chargily_pay_fees_allocation,'merchant');assert.equal(mock.state.createdRequest.webhook_endpoint,'https://example.supabase.co/functions/v1/chargily-webhook');
  assert.equal(mock.state.orders[0].status,'pending');assert.equal(mock.state.orders[0].payment_mode,'test');assert.ok(!mock.state.orders[0].snapshot_ciphertext.includes('client.example'));
  r=await checkoutHandler(req({draft,attemptId}),env);assert.equal((await r.json()).id,start.id);assert.equal(mock.state.orders.length,1);
  r=await orderHandler(req({action:'export',id:start.id}),env);assert.equal(r.status,403);
  r=await orderHandler(req({action:'export',id:start.id},'other'),env);assert.equal(r.status,404);
  const raw=JSON.stringify({type:'checkout.paid',data:{id:'checkout_123456'}}),sig=createHmac('sha256',env.CHARGILY_SECRET_KEY).update(raw).digest('hex');
  r=await webhookHandler(webhookRequest(raw,'0'.repeat(64)),env);assert.equal(r.status,403);assert.equal(mock.state.orders[0].status,'pending');
  r=await webhookHandler(webhookRequest(raw,sig),env);assert.equal(r.status,200);assert.equal(mock.state.orders[0].status,'pending');
  mock.state.checkouts.checkout_123456.status='paid';mock.state.checkouts.checkout_123456.amount=1;
  r=await webhookHandler(webhookRequest(raw,sig),env);assert.equal(r.status,403);assert.equal(mock.state.orders[0].status,'pending');
  mock.state.checkouts.checkout_123456.amount=850;
  r=await webhookHandler(webhookRequest(raw,sig),env);assert.equal(r.status,200);assert.equal(mock.state.orders[0].status,'paid');const paidAt=mock.state.orders[0].paid_at;
  r=await webhookHandler(webhookRequest(raw,sig),env);assert.equal(r.status,200);assert.equal(mock.state.orders[0].paid_at,paidAt);
  r=await orderHandler(req({action:'export',id:start.id}),{...env,CHARGILY_MODE:'live'});assert.equal(r.status,404);
  r=await orderHandler(req({action:'export',id:start.id}),env);assert.equal(r.status,200);assert.match((await r.json()).svg,/<svg/);
  r=await checkoutHandler(req({draft,attemptId:randomUUID()},'buyer','https://evil.example'),env);assert.equal(r.status,403);
  r=await checkoutHandler(req({draft,attemptId:randomUUID()},'intrus'),env);assert.equal(r.status,401);
 }finally{globalThis.fetch=original}
});
Deno.test('un webhook authentifié peut arriver avant la fin de création de la session',async()=>{
 const original=globalThis.fetch,mock=mockServices();globalThis.fetch=mock.fetch;
 try{
  mock.state.afterCreate=async(checkout)=>{
    checkout.status='paid';const raw=JSON.stringify({type:'checkout.paid',data:{id:checkout.id}}),sig=createHmac('sha256',env.CHARGILY_SECRET_KEY).update(raw).digest('hex');
    const response=await webhookHandler(webhookRequest(raw,sig),env);assert.equal(response.status,200);
  };
  const r=await checkoutHandler(req({draft,attemptId:randomUUID()}),env);assert.equal(r.status,200);assert.equal((await r.json()).paid,true);assert.equal(mock.state.orders[0].status,'paid');
 }finally{globalThis.fetch=original}
});
Deno.test('absence de configuration interdit le paiement',async()=>{
 const r=await checkoutHandler(req({}),{PUBLIC_SITE_URL:'https://qr.example'});assert.equal(r.status,503);
});
Deno.test('un mode affiché incohérent avec la clé Chargily ferme les ventes',async()=>{
 const original=globalThis.fetch,mock=mockServices();globalThis.fetch=mock.fetch;
 try{mock.state.settings.payment_mode='live';const r=await checkoutHandler(req({draft,attemptId:randomUUID()}),env);assert.equal(r.status,503);assert.equal(mock.state.orders.length,0)}finally{globalThis.fetch=original}
});
