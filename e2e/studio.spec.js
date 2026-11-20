import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
const require=createRequire(import.meta.url);
const aid='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',cid='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',planId='cccccccc-cccc-4ccc-8ccc-cccccccccccc',ver='dddddddd-dddd-4ddd-8ddd-dddddddddddd',sid='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',qrId='ffffffff-ffff-4fff-8fff-ffffffffffff';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
function session(id,metadata={}){const user={id,aud:'authenticated',role:'authenticated',email:'not-visible@example.invalid',email_confirmed_at:'2026-01-01',app_metadata:metadata};return {access_token:encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:id,session_id:sid,app_metadata:metadata,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.c2lnbmF0dXJl',refresh_token:'mock-refresh-'+id,expires_in:3600,token_type:'bearer',user}}
const adminSession=session(aid),clientSession=session(cid,{qr_access_version:ver});
function actualQr(draft){
 const script=`import {renderQr} from './supabase/functions/_shared/qr.js';const draft=await new Response(Deno.stdin.readable).json();console.log(JSON.stringify(renderQr(draft)));`;
 return JSON.parse(execFileSync(path.join(process.cwd(),'node_modules/.bin/deno'),['eval',script],{input:JSON.stringify(draft),encoding:'utf8',maxBuffer:5_000_000}));
}
async function mockSupabase(page,{withPlan=true,expired=false,withQr=false,withRealQr=false,legacyWebp=false}={}){
 const snapshots=new Map(),calls=[],plans=withPlan?[{id:planId,name:'Formule Test',description:'Une formule de démonstration',price_dzd:1250,duration_days:30,is_active:true,position:0,created_at:'2026-01-01'}]:[],clients=[{user_id:cid,client_name:'Client Exemple',phone:'+213 555 00 00 00',plan_id:planId,plan_name:'Formule Test',expires_at:expired?'2024-01-01T00:00:00Z':null,is_active:true,created_at:'2026-01-01'}],qrs=withQr?[{id:qrId,user_id:cid,title:'Ancien QR',qr_type:'url',created_at:'2026-01-01'}]:[];
 if(legacyWebp){const logo='data:image/webp;base64,'+fs.readFileSync('e2e/fixtures/logo.webp').toString('base64');snapshots.set(qrId,{type:'url',content:{url:'https://example.com/ancien-webp'},style:{foreground:'#24203f',background:'#ffffff',dots:'rounded',corner:'rounded',frame:true,label:'SCANNEZ-MOI',logo}})}
 await page.route('**/supabase-config.js',route=>route.fulfill({contentType:'application/javascript',body:"window.QR_CONFIG={supabaseUrl:'https://mock.supabase.co',supabaseAnonKey:'public-example',publicSiteUrl:'https://qr.example'};"}));
 await page.route('https://mock.supabase.co/**',async route=>{
  const req=route.request(),u=new URL(req.url()),method=req.method(),raw=req.postData();let sent;try{sent=raw?JSON.parse(raw):null}catch{sent=null}calls.push({url:u.pathname,method,body:sent,query:u.search});
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Content-Type':'application/json'};if(method==='OPTIONS')return route.fulfill({status:204,headers,body:''});let body={};
  if(u.pathname==='/auth/v1/user'){const bearer=req.headers().authorization||'';body=bearer.includes(adminSession.access_token)?adminSession.user:clientSession.user}
  else if(u.pathname==='/auth/v1/token')body=clientSession;
  else if(u.pathname==='/auth/v1/recover'||u.pathname==='/auth/v1/logout')body={};
  else if(u.pathname==='/rest/v1/rpc/qr_is_admin')body=true;
  else if(u.pathname==='/rest/v1/rpc/qr_admin_overview')body=[{clients_total:clients.length,clients_active:expired?0:clients.length,qr_total:qrs.length,plans_active:plans.filter(x=>x.is_active).length}];
  else if(u.pathname==='/rest/v1/qr_studio_settings'&&method==='GET')body={announcement:'',whatsapp_number:'213799888645',instagram_url:'https://www.instagram.com/massify_services/',facebook_url:'https://www.facebook.com/profile.php?id=61594892763460&locale=fr_FR'};
  else if(u.pathname==='/rest/v1/qr_studio_settings'&&method==='PATCH')body=[{id:1}];
  else if(u.pathname==='/rest/v1/qr_studio_plans'&&method==='GET')body=u.searchParams.has('is_active')?plans.filter(p=>p.is_active):plans;
  else if(u.pathname==='/rest/v1/qr_studio_plans'&&method==='POST'){let p=Array.isArray(sent)?sent[0]:sent;plans.unshift({id:'11111111-1111-4111-8111-111111111111',position:0,created_at:'2026-01-01',...p});body=[{id:plans[0].id}]}
  else if(u.pathname==='/rest/v1/qr_studio_plans'&&method==='PATCH'){const id=(u.searchParams.get('id')||'').replace('eq.',''),p=plans.find(x=>x.id===id);if(p)Object.assign(p,sent);body=p?[{id}]:[]}
  else if(u.pathname==='/rest/v1/qr_studio_clients'&&method==='GET')body=clients;
  else if(u.pathname==='/rest/v1/qr_studio_clients'&&method==='PATCH'){const id=(u.searchParams.get('user_id')||'').replace('eq.',''),c=clients.find(x=>x.user_id===id);if(c)Object.assign(c,sent);body=c?[{user_id:id}]:[]}
  else if(u.pathname==='/rest/v1/qr_studio_client_qrs')body=qrs;
  else if(u.pathname==='/functions/v1/qr-admin-auth')body={access_token:adminSession.access_token,refresh_token:adminSession.refresh_token};
  else if(u.pathname==='/functions/v1/qr-client-auth')body={access_token:clientSession.access_token,refresh_token:clientSession.refresh_token};
  else if(u.pathname==='/functions/v1/qr-client-admin'){const newId='22222222-2222-4222-8222-222222222222';clients.unshift({user_id:newId,client_name:sent.client_name||'Client Exemple',phone:sent.phone||'',plan_id:sent.plan_id||null,plan_name:'',expires_at:sent.expires_at||null,is_active:true,created_at:'2026-01-02'});body={user_id:newId,client_name:sent.client_name||'Client Exemple',code:'9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N'}}
  else if(u.pathname==='/functions/v1/qr-client-qr'){
    if(sent.action==='create'){snapshots.set(sent.id,sent.draft);qrs.unshift({id:sent.id,user_id:cid,title:sent.title||'Lien web',qr_type:sent.draft.type,created_at:'2026-01-01'})}
    const example={type:'url',content:{url:'https://example.com/ancien'},style:{foreground:'#24203f',background:'#ffffff',dots:'rounded',corner:'rounded',frame:true,label:'SCANNEZ-MOI',logo:''}};
    const rendered=withRealQr?actualQr(snapshots.get(sent.id)||example):{svg:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="white"/></svg>'};
    body={id:sent.id,...rendered}
  }
  else return route.fulfill({status:404,headers,body:'{}'});
  return route.fulfill({status:200,headers,body:JSON.stringify(body)});
 });return {calls,plans,clients,qrs};
}
test('site : formules absentes sans prix inventé et réseaux visibles',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await mockSupabase(page,{withPlan:false});await page.goto('/');await expect(page.getByText('Les formules arrivent bientôt.')).toBeVisible();await expect(page.locator('#request-submit')).toBeDisabled();await expect(page.locator('[data-instagram]').first()).toHaveAttribute('href',/instagram\.com\/massify_services/);await expect(page.locator('[data-facebook]').first()).toHaveAttribute('href',/61594892763460/);await expect(page.locator('[data-whatsapp]').first()).toHaveAttribute('href',/^https:\/\/wa\.me\/213799888645/);expect(errors).toEqual([]);
});
test('la demande WhatsApp contient la formule et les informations choisies',async({page,context})=>{
 await mockSupabase(page);await context.route('https://wa.me/**',r=>r.fulfill({status:200,contentType:'text/html',body:'WhatsApp simulé'}));await page.goto('/');await page.getByRole('button',{name:'Choisir cette formule →'}).click();await page.locator('#request-name').fill('Amina Client');await page.locator('#request-phone').fill('+213 555 12 34 56');await page.locator('#request-details').fill('Projet boutique');const popupPromise=page.waitForEvent('popup');await page.locator('#request-submit').click();const popup=await popupPromise;await popup.waitForLoadState();const url=new URL(popup.url());expect(url.hostname).toBe('wa.me');expect(url.pathname).toBe('/213799888645');const message=url.searchParams.get('text');expect(message).toContain('Abonnement : Formule Test');expect(message).toContain('Amina Client');expect(message).toContain('+213 555 12 34 56');expect(message).toContain('Projet boutique');
});
test('client : connexion par code, création et téléchargement',async({page})=>{
 const {calls}=await mockSupabase(page);await page.goto('/');await page.locator('[data-key=url]').fill('https://example.com/page');await page.locator('#qr-title').fill('Ma carte');await page.locator('#generate-button').click();await expect(page.locator('#auth-code')).toBeVisible();await expect(page.locator('#auth-email')).toBeHidden();await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();await expect(page.getByText('Votre QR est prêt ! Téléchargez-le en SVG ou PNG.')).toBeVisible();await expect(page.getByRole('heading',{name:'Ma carte'})).toBeVisible();const login=calls.find(x=>x.url==='/functions/v1/qr-client-auth');expect(Object.keys(login.body)).toEqual(['code']);const generated=calls.find(x=>x.url==='/functions/v1/qr-client-qr'&&x.body.action==='create');expect(generated.body.draft.content.url).toBe('https://example.com/page');const download=page.waitForEvent('download');await page.getByRole('button',{name:'SVG ↓'}).click();expect((await download).suggestedFilename()).toMatch(/\.svg$/);
});
test('abonnement expiré : anciennes créations consultables et création bloquée',async({page})=>{
 await mockSupabase(page,{expired:true,withQr:true});await page.goto('/');await page.getByRole('button',{name:'Mes QR codes'}).first().click();await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();await expect(page.getByText(/votre abonnement a expiré : vous pouvez toujours consulter/i)).toBeVisible();await expect(page.getByRole('heading',{name:'Ancien QR'})).toBeVisible();await expect(page.getByRole('button',{name:'SVG ↓'})).toBeVisible();await page.getByRole('button',{name:'← Retour à la création'}).click();await expect(page.locator('#generate-button')).toBeDisabled();
});
test('administration : formules, création de client et code affiché une seule fois',async({page})=>{
 const {calls}=await mockSupabase(page);await page.goto('/admin/');await expect(page.locator('#login-form input[type=email]')).toHaveCount(0);await page.locator('#password').fill('mot-de-passe-exemple');await page.locator('#login-button').click();await expect(page.getByRole('heading',{name:/Votre activité, en un regard/})).toBeVisible();await page.locator('.sidebar [data-view=clients]').click();await page.locator('#new-client-name').fill('Amine Client');await page.locator('#new-client-phone').fill('+213 799 00 00 00');await page.locator('#new-client-plan').selectOption(planId);await expect(page.locator('#new-client-expiry')).not.toHaveValue('');await page.locator('#create-client-button').click();await expect(page.locator('#code-reveal')).toBeVisible();await expect(page.locator('#code-value')).not.toHaveValue('');expect(calls.find(x=>x.url==='/functions/v1/qr-client-admin').body.client_name).toBe('Amine Client');await page.locator('#close-code').click();await expect(page.locator('#code-value')).toHaveValue('');await page.locator('.sidebar [data-view=plans]').click();await page.locator('#plan-name').fill('Nouvelle formule');await page.locator('#plan-price').fill('2500');await page.locator('#plan-duration').fill('60');await page.locator('#save-plan-button').click();await expect(page.getByText('Abonnement enregistré.')).toBeVisible();await expect(page.getByRole('heading',{name:'Nouvelle formule'})).toBeVisible();
});
test('mobile : site et administration sans débordement',async({page})=>{
 await page.setViewportSize({width:375,height:812});await page.goto('/');await page.getByRole('button',{name:'Ouvrir le menu'}).click();await expect(page.locator('#mobile-menu')).toHaveClass(/open/);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.goto('/admin/');await expect(page.getByText('La connexion n’est pas encore configurée.',{exact:false})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('administration mobile : gestion des clients et formules sans débordement',async({page})=>{
 await page.setViewportSize({width:375,height:812});await mockSupabase(page);await page.goto('/admin/');await page.locator('#password').fill('mot-de-passe-exemple');await page.locator('#login-button').click();await expect(page.getByRole('heading',{name:/Votre activité, en un regard/})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.bottom-nav [data-view=clients]').click();await expect(page.getByRole('heading',{name:'Clients & accès.'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.bottom-nav [data-view=plans]').click();await expect(page.getByRole('heading',{name:'Abonnements.'})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('.bottom-nav [data-view=settings]').click();await expect(page.getByRole('heading',{name:'Vos paramètres.'})).toBeVisible();for(const width of [320,375,414]){await page.setViewportSize({width,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true)}
});
test('récupération administrateur conserve l’e-mail uniquement pour ce parcours',async({page})=>{
 const {calls}=await mockSupabase(page);await page.goto('/?forgot=1');await expect(page.getByRole('heading',{name:'Mot de passe oublié ?'})).toBeVisible();await page.locator('#auth-email').fill('demo@example.com');await page.getByRole('button',{name:/Envoyer le lien/}).click();await expect(page.getByText(/Si cette adresse possède un compte/)).toBeVisible();expect(calls.some(c=>c.url==='/auth/v1/recover')).toBe(true);
});
test('les neuf styles SVG se décodent vers le contenu créé',async({page})=>{
 const script=`import { DEFAULT_STYLE,renderSvg } from './supabase/functions/_shared/qr.js'; const all=[];for(const dots of ['square','rounded','dots'])for(const corner of ['square','rounded','circle'])all.push(renderSvg({type:'url',content:{url:'https://example.com/scan-me'},style:{...DEFAULT_STYLE,dots,corner}}));console.log(JSON.stringify(all));`;
 const svgList=JSON.parse(execFileSync(path.join(process.cwd(),'node_modules/.bin/deno'),['eval',script],{encoding:'utf8'}));await page.goto('/');await page.addScriptTag({path:require.resolve('jsqr/dist/jsQR.js')});
 for(const svg of svgList){const decoded=await page.evaluate(async s=>{const blob=new Blob([s],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);try{const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=url});const c=document.createElement('canvas');c.width=800;c.height=800;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,800);ctx.drawImage(img,0,0,800,800);const pixels=ctx.getImageData(0,0,800,800);return window.jsQR(pixels.data,800,800)?.data||''}finally{URL.revokeObjectURL(url)}},svg);expect(decoded).toBe('https://example.com/scan-me')}
});

test('espace personnel : accueil privé, abonnement, historique, rechargement et déconnexion',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await mockSupabase(page,{withQr:true});
 await page.goto('/');await expect(page.locator('#haut')).toBeVisible();await expect(page.locator('#abonnements')).toBeVisible();
 await page.locator('.head-actions .account-label').click();await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();
 await expect(page.locator('#welcome-name')).toHaveText('Bonjour, Client Exemple.');await expect(page.locator('#creer')).toBeVisible();
 for(const selector of ['#haut','#abonnements','#comment','#request-form','nav[data-public-only]'])await expect(page.locator(selector)).toBeHidden();
 await page.reload();await expect(page.locator('#welcome-name')).toHaveText('Bonjour, Client Exemple.');await expect(page.locator('#haut')).toBeHidden();await expect(page.locator('#abonnements')).toBeHidden();
 await page.locator('nav[data-client-only] button[data-nav-view=subscription]').click();await expect(page.locator('#subscription-page')).toBeVisible();await expect(page.locator('#subscription-plan')).toHaveText('Formule Test');await expect(page.locator('#subscription-expiry')).toHaveText('Sans date de fin');
 await page.locator('nav[data-client-only] button[data-nav-view=orders]').click();await expect(page.getByRole('heading',{name:'Ancien QR'})).toBeVisible();
 await page.getByRole('button',{name:'← Retour à la création'}).click();await page.locator('[data-key=url]').fill('https://example.com/prive');
 page.once('dialog',d=>d.accept());await page.locator('.head-actions .account-label').click();await expect(page.locator('#haut')).toBeVisible();await expect(page.locator('#abonnements')).toBeVisible();await expect(page.locator('[data-key=url]')).toHaveValue('https://');await expect(page.locator('#client-welcome')).toBeHidden();expect(errors).toEqual([]);
});

test('espace client mobile : menus personnels, absence du marketing et pas de débordement',async({page})=>{
 await page.setViewportSize({width:375,height:812});await mockSupabase(page,{withQr:true});await page.goto('/');
 await page.getByRole('button',{name:'Ouvrir le menu'}).click();await page.locator('#mobile-menu .account-label').click();await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();
 await expect(page.locator('#welcome-name')).toHaveText('Bonjour, Client Exemple.');await expect(page.locator('#abonnements')).toBeHidden();await expect(page.locator('#request-form')).toBeHidden();
 await page.getByRole('button',{name:'Ouvrir le menu'}).click();await page.locator('#mobile-menu button[data-client-only]').filter({hasText:'Mes QR codes'}).click();await expect(page.getByRole('heading',{name:'Ancien QR'})).toBeVisible();
 await page.getByRole('button',{name:'Ouvrir le menu'}).click();await page.locator('#mobile-menu button[data-client-only]').filter({hasText:'Mon abonnement'}).click();await expect(page.locator('#subscription-page')).toBeVisible();
 for(const width of [320,375,414,800]){await page.setViewportSize({width,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`largeur ${width}`).toBe(true)}
 await page.reload();await expect(page.locator('#welcome-name')).toHaveText('Bonjour, Client Exemple.');await expect(page.locator('#haut')).toBeHidden();
});

const PNG=require('pngjs').PNG,jsQR=require('jsqr');
let resvgPromise;function nodeResvg(){if(!resvgPromise)resvgPromise=(async()=>{const lib=await import('@resvg/resvg-wasm');await lib.initWasm(fs.readFileSync('node_modules/@resvg/resvg-wasm/index_bg.wasm'));return lib})();return resvgPromise}
function readQrPixels(bytes){const png=PNG.sync.read(bytes);return {width:png.width,height:png.height,data:new Uint8ClampedArray(png.data)}}
function decoded(pixels){
 let {width,height,data}=pixels;
 // Camera previews naturally sample a large download down to the sensor size.
 if(width>900){const w=900,h=Math.round(height*w/width),out=new Uint8ClampedArray(w*h*4);for(let y=0;y<h;y++)for(let x=0;x<w;x++){const a=(Math.floor(y*height/h)*width+Math.floor(x*width/w))*4,b=(y*w+x)*4;out.set(data.subarray(a,a+4),b)}width=w;height=h;data=out}
 return jsQR(data,width,height)?.data||'';
}
function hasRedLogo(pixels){let red=0;const x0=Math.floor(pixels.width*.43),x1=Math.floor(pixels.width*.57),y0=Math.floor(pixels.width*.43),y1=Math.floor(pixels.width*.57);for(let y=y0;y<y1;y++)for(let x=x0;x<x1;x++){const i=(y*pixels.width+x)*4;if(pixels.data[i]>150&&pixels.data[i+1]<80&&pixels.data[i+2]<120&&pixels.data[i+3]>200)red++}return red>100}
async function downloaded(button){const promise=button.page().waitForEvent('download');await button.click();const file=await promise;return {name:file.suggestedFilename(),bytes:fs.readFileSync(await file.path())}}

test('vrais SVG et PNG : sans logo et avec logos PNG, JPG et WebP, même si canvas est bloqué',async({page})=>{
 test.setTimeout(120000);
 const {Resvg}=await nodeResvg();
 await page.addInitScript(()=>{
   HTMLCanvasElement.prototype.toBlob=function(){throw new Error('Extraction canvas bloquée')};
   HTMLCanvasElement.prototype.toDataURL=function(){throw new Error('Extraction canvas bloquée')};
   CanvasRenderingContext2D.prototype.getImageData=function(){throw new Error('Extraction canvas bloquée')};
 });
 const {calls}=await mockSupabase(page,{withRealQr:true});await page.goto('/');await page.locator('.head-actions .account-label').click();await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();await expect(page.locator('#welcome-name')).toContainText('Client Exemple');
 for(const type of ['sans-logo','png','jpg','webp']){
   const target='https://example.com/scan-'+type,title='Test '+type;
   await page.locator('[data-key=url]').fill(target);await page.locator('#qr-title').fill(title);
   if(type!=='sans-logo'){await page.locator('#logo').setInputFiles(path.join(process.cwd(),'e2e/fixtures/logo.'+type));await expect(page.locator('#logo-status')).toHaveText('Logo prêt.',{timeout:30000})}
   await page.locator('#generate-button').click();const card=page.locator('.order-card').filter({has:page.getByRole('heading',{name:title,exact:true})});await expect(card).toBeVisible({timeout:30000});
   const png=await downloaded(card.getByRole('button',{name:'PNG ↓'}));expect(png.name).toMatch(/\.png$/);const pixels=readQrPixels(png.bytes);expect(pixels.width).toBe(1800);expect(pixels.height).toBeGreaterThan(1800);expect(decoded(pixels),type+' PNG').toBe(target);if(type!=='sans-logo')expect(hasRedLogo(pixels),type+' logo PNG').toBe(true);
   const svg=await downloaded(card.getByRole('button',{name:'SVG ↓'}));expect(svg.name).toMatch(/\.svg$/);const svgText=svg.bytes.toString('utf8');if(type!=='sans-logo')expect(svgText).toContain('data:image/png;base64,');
   const renderer=new Resvg(svgText,{fitTo:{mode:'width',value:900}}),image=renderer.render();try{const pix={width:image.width,height:image.height,data:new Uint8ClampedArray(image.pixels)};expect(decoded(pix),type+' SVG').toBe(target);if(type!=='sans-logo')expect(hasRedLogo(pix),type+' logo SVG').toBe(true)}finally{image.free();renderer.free()}
   await page.getByRole('button',{name:'← Retour à la création'}).click();
 }
 const creations=calls.filter(c=>c.url==='/functions/v1/qr-client-qr'&&c.body.action==='create');expect(creations).toHaveLength(4);for(const c of creations.slice(1)){expect(c.body.draft.style.logo).toMatch(/^data:image\/png;base64,/);expect(c.body.draft.style.logo.length).toBeLessThanOrEqual(270000)}
});

test('logos invalides et trop volumineux : erreurs utiles, sans lancement de création',async({page})=>{
 await mockSupabase(page);await page.goto('/');
 await page.locator('#logo').setInputFiles({name:'image.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg/>')});await expect(page.locator('#logo-status')).toContainText('Format non reconnu');
 await page.locator('#logo').setInputFiles({name:'gros.png',mimeType:'image/png',buffer:Buffer.alloc(5*1024*1024+1)});await expect(page.locator('#logo-status')).toContainText('5 Mo maximum');
});

test('mobile : création et téléchargement PNG avec logo WebP',async({page})=>{
 test.setTimeout(60000);await page.setViewportSize({width:375,height:812});await mockSupabase(page,{withRealQr:true});await page.goto('/');
 await page.getByRole('button',{name:'Ouvrir le menu'}).click();await page.locator('#mobile-menu .account-label').click();await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();
 await expect(page.locator('#welcome-name')).toContainText('Client Exemple');await page.locator('[data-key=url]').fill('https://example.com/mobile-logo');await page.locator('#logo').setInputFiles('e2e/fixtures/logo.webp');await expect(page.locator('#logo-status')).toHaveText('Logo prêt.',{timeout:30000});await page.locator('#qr-title').fill('Mobile avec logo');await page.locator('#generate-button').click();
 const card=page.locator('.order-card').filter({has:page.getByRole('heading',{name:'Mobile avec logo'})});await expect(card).toBeVisible();const png=await downloaded(card.getByRole('button',{name:'PNG ↓'}));const pixels=readQrPixels(png.bytes);expect(decoded(pixels)).toBe('https://example.com/mobile-logo');expect(hasRedLogo(pixels)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('accès expiré : export PNG et SVG des anciens logos WebP, création toujours bloquée',async({page})=>{
 test.setTimeout(60000);const {calls}=await mockSupabase(page,{expired:true,withQr:true,withRealQr:true,legacyWebp:true});await page.goto('/');await page.locator('.head-actions .account-label').click();await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();
 await expect(page.locator('#welcome-expiry')).toContainText('expiré');await expect(page.locator('#generate-button')).toBeDisabled();await expect(page.locator('#abonnements')).toBeHidden();
 await page.locator('nav[data-client-only] button[data-nav-view=orders]').click();await expect(page.getByRole('heading',{name:'Ancien QR'})).toBeVisible();
 const card=page.locator('.order-card').filter({has:page.getByRole('heading',{name:'Ancien QR'})});const svg=await downloaded(card.getByRole('button',{name:'SVG ↓'}));expect(svg.bytes.toString('utf8')).toContain('data:image/png;base64,');
 const png=await downloaded(card.getByRole('button',{name:'PNG ↓'}));const pixels=readQrPixels(png.bytes);expect(decoded(pixels)).toBe('https://example.com/ancien-webp');expect(hasRedLogo(pixels)).toBe(true);expect(calls.filter(c=>c.url==='/functions/v1/qr-client-qr'&&c.body.action==='create')).toHaveLength(0);
 await page.reload();await expect(page.locator('#welcome-expiry')).toContainText('expiré');await expect(page.locator('#generate-button')).toBeDisabled();
});

test('logo JPEG issu du téléphone : orientation EXIF respectée',async({page})=>{
 const {calls}=await mockSupabase(page);await page.goto('/');await page.locator('.head-actions .account-label').click();await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();await expect(page.locator('#welcome-name')).toContainText('Client Exemple');
 await page.locator('[data-key=url]').fill('https://example.com/orientation');await page.locator('#logo').setInputFiles('e2e/fixtures/logo-oriente.jpg');await expect(page.locator('#logo-status')).toHaveText('Logo prêt.');await page.locator('#generate-button').click();await expect(page.locator('#orders-page')).toBeVisible();
 const logo=calls.find(c=>c.url==='/functions/v1/qr-client-qr'&&c.body.action==='create').body.draft.style.logo;const image=readQrPixels(Buffer.from(logo.split(',')[1],'base64'));
 const pixel=(x,y)=>Array.from(image.data.subarray((y*image.width+x)*4,(y*image.width+x)*4+4));const top=pixel(96,40),bottom=pixel(96,150);expect(top[0]).toBeGreaterThan(180);expect(top[2]).toBeLessThan(80);expect(bottom[2]).toBeGreaterThan(180);expect(bottom[0]).toBeLessThan(80);
});

test('légende arabe conservée dans le PNG sans extraction canvas',async({page})=>{
 test.setTimeout(60000);const {Resvg}=await nodeResvg();await mockSupabase(page,{withRealQr:true});await page.goto('/');await page.locator('.head-actions .account-label').click();await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();await expect(page.locator('#welcome-name')).toContainText('Client Exemple');
 await page.locator('[data-key=url]').fill('https://example.com/arabe');await page.locator('#label').fill('مرحبا بكم');await page.locator('#qr-title').fill('QR arabe');await page.locator('#generate-button').click();const card=page.locator('.order-card').filter({has:page.getByRole('heading',{name:'QR arabe'})});await expect(card).toBeVisible();
 const png=readQrPixels((await downloaded(card.getByRole('button',{name:'PNG ↓'}))).bytes);const svg=(await downloaded(card.getByRole('button',{name:'SVG ↓'}))).bytes.toString('utf8');expect(decoded(png)).toBe('https://example.com/arabe');
 function reference(fonts){const r=new Resvg(svg,{fitTo:{mode:'width',value:1800},font:{fontBuffers:fonts,sansSerifFamily:'DM Sans',defaultFontFamily:'DM Sans'}}),image=r.render();try{return {width:image.width,height:image.height,data:new Uint8ClampedArray(image.pixels)}}finally{image.free();r.free()}}
 function captionHash(p){const start=p.width*p.width*4;return createHash('sha256').update(p.data.subarray(start)).digest('hex')}
 const dm=fs.readFileSync('site-public/web/fonts/dm-sans.woff2'),fallback=fs.readFileSync('site-public/web/fonts/dejavu-sans.woff2');
 expect(captionHash(png)).toBe(captionHash(reference([dm,fallback])));expect(captionHash(png)).not.toBe(captionHash(reference([dm])));
});

test('Massify-qrcode : nom du site, de l’administration et des applications installables',async({page})=>{
 await mockSupabase(page);await page.goto('/');await expect(page).toHaveTitle(/Massify-qrcode/);await expect(page.locator('header .brand')).toContainText('Massify-qrcode');
 const manifest=await page.evaluate(async()=>await (await fetch('/manifest.json')).json());expect(manifest.name).toContain('Massify-qrcode');expect(manifest.short_name).toBe('Massify-qrcode');
 await page.goto('/admin/');await expect(page).toHaveTitle(/Massify-qrcode/);await expect(page.locator('.brand').first()).toContainText('Massify-qrcode');
 const admin=await page.evaluate(async()=>await (await fetch('/admin/manifest.json')).json());expect(admin.name).toContain('Massify-qrcode');
});

const setLogoSize=(page,size)=>page.locator('#logo-size').evaluate((el,n)=>{el.value=String(n);el.dispatchEvent(new Event('input',{bubbles:true}))},size);
const svgImageSide=svg=>Number(svg.match(/<image[^>]+width="([\d.]+)"/)[1]);
const svgMatrixSide=svg=>Number(svg.match(/^<svg[^>]*width="([\d.]+)"/)[1])-80;

test('curseur du logo : aperçu, enregistrement et exports SVG/PNG cohérents',async({page})=>{
 test.setTimeout(120000);const {Resvg}=await nodeResvg();const {calls}=await mockSupabase(page,{withRealQr:true});
 await page.goto('/');await expect(page.locator('#logo-size')).toBeDisabled();await page.locator('.head-actions .account-label').click();
 await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();await expect(page.locator('#welcome-name')).toContainText('Client Exemple');
 await page.locator('#logo').setInputFiles('e2e/fixtures/logo-small.png');await expect(page.locator('#logo-status')).toHaveText('Logo prêt.');await expect(page.locator('#logo-size')).toBeEnabled();
 let firstPreview=0,previousSvg='';
 for(const [size,title] of [[8,'Petit logo'],[22,'Grand logo']]){
  await setLogoSize(page,size);await expect(page.locator('#logo-size-value')).toHaveText(size+' %');
  const preview=Number(await page.locator('#preview-qr image').getAttribute('width'));if(size===8)firstPreview=preview;else expect(preview).toBeGreaterThan(firstPreview);
  const target='https://example.com/logo-'+size;await page.locator('[data-key=url]').fill(target);await page.locator('#qr-title').fill(title);await page.locator('#generate-button').click();
  const card=page.locator('.order-card').filter({has:page.getByRole('heading',{name:title,exact:true})});await expect(card).toBeVisible();
  const svg=(await downloaded(card.getByRole('button',{name:'SVG ↓'}))).bytes.toString('utf8');expect(svgImageSide(svg)/svgMatrixSide(svg)).toBeCloseTo(size/100,5);
  const r=new Resvg(svg,{fitTo:{mode:'width',value:900}}),im=r.render();try{expect(decoded({width:im.width,height:im.height,data:new Uint8ClampedArray(im.pixels)})).toBe(target)}finally{im.free();r.free()}
  const png=readQrPixels((await downloaded(card.getByRole('button',{name:'PNG ↓'}))).bytes);expect(decoded(png)).toBe(target);expect(hasRedLogo(png)).toBe(true);
  if(size===22)previousSvg=svg;
  await page.getByRole('button',{name:'← Retour à la création'}).click();
 }
 const creations=calls.filter(c=>c.url==='/functions/v1/qr-client-qr'&&c.body.action==='create');expect(creations.map(c=>c.body.draft.style.logoSize)).toEqual([8,22]);
 await page.reload();await expect(page.locator('#welcome-name')).toContainText('Client Exemple');await page.locator('nav[data-client-only] button[data-nav-view=orders]').click();
 const saved=page.locator('.order-card').filter({has:page.getByRole('heading',{name:'Grand logo',exact:true})});await expect(saved).toBeVisible();expect((await downloaded(saved.getByRole('button',{name:'SVG ↓'}))).bytes.toString('utf8')).toBe(previousSvg);
});

test('contenu dense : la réduction automatique du logo est annoncée au client',async({page})=>{
 test.setTimeout(90000);const {calls}=await mockSupabase(page,{withRealQr:true});await page.goto('/');await page.locator('.head-actions .account-label').click();
 await page.locator('#auth-code').fill('9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9NZ8-9N');await page.locator('#auth-submit').click();await expect(page.locator('#welcome-name')).toContainText('Client Exemple');
 await page.locator('#logo').setInputFiles('e2e/fixtures/logo-small.png');await expect(page.locator('#logo-status')).toHaveText('Logo prêt.');await setLogoSize(page,22);
 const target='https://example.com/'+ 'x'.repeat(500);await page.locator('[data-key=url]').fill(target);await page.locator('#qr-title').fill('QR dense');await page.locator('#generate-button').click();
 await expect(page.locator('#order-message')).toContainText('Le logo a été ajusté');const card=page.locator('.order-card').filter({has:page.getByRole('heading',{name:'QR dense',exact:true})});await expect(card).toBeVisible();
 const svg=(await downloaded(card.getByRole('button',{name:'SVG ↓'}))).bytes.toString('utf8');expect(svgImageSide(svg)/svgMatrixSide(svg)).toBeLessThan(.22);
 const png=readQrPixels((await downloaded(card.getByRole('button',{name:'PNG ↓'}))).bytes);expect(decoded(png)).toBe(target);
 expect(calls.find(c=>c.url==='/functions/v1/qr-client-qr'&&c.body.action==='create').body.draft.style.logoSize).toBe(22);
});

test('lecture de logos petits et grands sur plusieurs contenus et styles',async()=>{
 test.setTimeout(120000);const {Resvg}=await nodeResvg(),logo='data:image/png;base64,'+fs.readFileSync('e2e/fixtures/logo-small.png').toString('base64');
 const sources=[
  {type:'url',content:{url:'https://x.co/'}},{type:'url',content:{url:'https://example.com/scan-me'}},
  ...[50,100,230,500,680].map(n=>({type:'url',content:{url:'https://example.com/'+'x'.repeat(n)}})),
  {type:'wifi',content:{wifiName:'Café Salon',wifiPassword:'MotDePasse123',wifiSecurity:'WPA',hidden:false}},
  {type:'contact',content:{name:'Samir Client',phone:'+213555001122',email:'client@example.com',company:'Exemple',website:'https://example.com'}}
 ];
 const drafts=[];for(const source of sources)for(const size of [8,16,22])for(const dots of ['square','rounded','dots'])drafts.push({...source,style:{foreground:'#24203f',background:'#ffffff',dots,corner:dots==='dots'?'circle':dots,frame:false,label:'SCANNEZ-MOI',logo,logoSize:size}});
 const script=`import {normalizeSnapshot,renderQr} from './supabase/functions/_shared/qr.js';const drafts=await new Response(Deno.stdin.readable).json();console.log(JSON.stringify(drafts.map(d=>({payload:normalizeSnapshot(d).payload,...renderQr(d)}))));`;
 const qr=JSON.parse(execFileSync(path.join(process.cwd(),'node_modules/.bin/deno'),['eval',script],{input:JSON.stringify(drafts),encoding:'utf8',maxBuffer:64_000_000}));
 for(let i=0;i<qr.length;i++){
  const r=new Resvg(qr[i].svg,{fitTo:{mode:'width',value:900}}),im=r.render();
  try{expect(decoded({width:im.width,height:im.height,data:new Uint8ClampedArray(im.pixels)}),`${drafts[i].type}, taille ${drafts[i].style.logoSize}, style ${drafts[i].style.dots}`).toBe(qr[i].payload)}finally{im.free();r.free()}
 }
});
