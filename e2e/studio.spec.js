import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const adminId='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url');
const token=encode({alg:'HS256',typ:'JWT'})+'.'+encode({sub:adminId,role:'authenticated',exp:Math.floor(Date.now()/1000)+3600})+'.c2lnbmF0dXJl';
const session={access_token:token,refresh_token:'mock-refresh-token',expires_in:3600,token_type:'bearer',user:{id:adminId,aud:'authenticated',role:'authenticated',email:'admin@example.com',email_confirmed_at:'2025-01-01T00:00:00Z'}};
async function mockSupabase(page,options={}){
  const calls=[];
  await page.route('**/supabase-config.js',route=>route.fulfill({status:200,contentType:'application/javascript',body:`window.QR_CONFIG={supabaseUrl:'https://mock.supabase.co',supabaseAnonKey:'public-example',publicSiteUrl:'https://qr.example'};`}));
  await page.route('https://mock.supabase.co/**',async route=>{
    const req=route.request(),u=new URL(req.url()),method=req.method();calls.push({url:u.pathname,method,body:req.postData()});
    const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'*','Access-Control-Allow-Methods':'GET,POST,PATCH,OPTIONS','Content-Type':'application/json'};
    if(method==='OPTIONS')return route.fulfill({status:204,headers,body:''});
    let body={};
    if(u.pathname==='/auth/v1/token')body=session;
    else if(u.pathname==='/auth/v1/user')body=session.user;
    else if(u.pathname==='/auth/v1/recover')body={};
    else if(u.pathname==='/auth/v1/logout')body={};
    else if(u.pathname==='/rest/v1/rpc/qr_is_admin')body=true;
    else if(u.pathname==='/rest/v1/rpc/qr_admin_stats')body=[{paid_count:1,revenue_dzd:850,pending_count:0}];
    else if(u.pathname==='/rest/v1/qr_studio_settings'&&method==='GET')body={price_dzd:850,checkout_enabled:true,payment_mode:'test',announcement:'',support_email:''};
    else if(u.pathname==='/rest/v1/qr_studio_settings'&&method==='PATCH')body=[{id:1}];
    else if(u.pathname==='/rest/v1/qr_studio_orders')body=options.orders||[];
    else if(u.pathname==='/functions/v1/qr-admin-auth')body={access_token:session.access_token,refresh_token:session.refresh_token};
    else if(u.pathname==='/functions/v1/qr-checkout')body={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',checkoutUrl:'https://pay.chargily.dz/test/demo'};
    else if(u.pathname==='/functions/v1/qr-order')body={verification:'unavailable',order:{status:'pending'}};
    else return route.fulfill({status:404,headers,body:'{}'});
    return route.fulfill({status:200,headers,body:JSON.stringify(body)});
  });return calls;
}
test('éditeur statique : huit types, aperçu fictif et ventes fermées',async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto('/');
  await expect(page.getByRole('heading',{name:/Une belle idée/})).toBeVisible();
  await expect(page.getByRole('button',{name:/Commandes bientôt disponibles/})).toBeDisabled();
  const preview=await page.locator('#preview-qr').innerHTML();await page.locator('[data-key=url]').fill('https://confidentiel.example/abc');expect(await page.locator('#preview-qr').innerHTML()).toBe(preview);
  await page.getByRole('button',{name:'Wi-Fi'}).click();await page.locator('[data-key=wifiName]').fill('Mon Wi-Fi');await page.locator('[data-key=wifiPassword]').fill('ancien secret');await page.locator('[data-key=wifiSecurity]').selectOption('nopass');await expect(page.locator('[data-key=wifiPassword]')).toBeDisabled();await expect(page.locator('[data-key=wifiPassword]')).toHaveValue('');
  await page.locator('#fg').evaluate(el=>{el.value='#ffffff';el.dispatchEvent(new Event('input',{bubbles:true}))});await expect(page.locator('#contrast-warning')).toBeVisible();expect(errors).toEqual([]);
});
test('navigation mobile et administration non configurée sans débordement',async({page})=>{
  await page.setViewportSize({width:375,height:812});await page.goto('/');await page.getByRole('button',{name:'Ouvrir le menu'}).click();await expect(page.locator('#mobile-menu')).toHaveClass(/open/);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.goto('/admin/');await expect(page.getByText('La connexion n’est pas encore configurée.',{exact:false})).toBeVisible();await expect(page.locator('#login-form')).toBeHidden();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('administration : compte autorisé, statistiques, paramétrage et échappement',async({page})=>{
  const calls=await mockSupabase(page,{orders:[{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',customer_email:'<img src=x onerror=alert(1)>',qr_type:'url',status:'paid',amount_dzd:850,payment_mode:'test',created_at:'2026-11-08T12:00:00Z'}]});
  await page.goto('/admin/');await expect(page.locator('#email')).toHaveCount(0);await page.locator('#password').fill('examplepassword');await page.locator('#login-button').click();
  await expect(page.getByRole('heading',{name:/Votre activité, en un regard/})).toBeVisible();await expect(page.locator('#admin-label')).toHaveText('Administrateur');await expect(page.locator('#stat-paid')).toHaveText('1');await expect(page.locator('#recent-rows img')).toHaveCount(0);
  await page.locator('.sidebar [data-view=settings]').click();await page.locator('#price').fill('1250');await page.locator('#announcement').fill('Bonjour');await page.locator('#save-button').click();await expect(page.getByText('Paramètres enregistrés.')).toBeVisible();
  const patch=calls.find(c=>c.url==='/rest/v1/qr_studio_settings'&&c.method==='PATCH');expect(JSON.parse(patch.body)).toMatchObject({price_dzd:1250,announcement:'Bonjour'});
});
test('le paiement utilise le compte et transmet la création au serveur',async({page})=>{
 const calls=await mockSupabase(page);await page.route('https://pay.chargily.dz/**',route=>route.fulfill({status:200,contentType:'text/html',body:'Paiement simulé'}));
 await page.goto('/');await expect(page.locator('#checkout-button')).toBeEnabled();await page.locator('[data-key=url]').fill('https://exemple.dz/ma-page');await page.locator('#checkout-button').click();
 await expect(page.getByRole('dialog')).toBeVisible();await page.locator('#auth-email').fill('admin@example.com');await page.locator('#auth-password').fill('examplepassword');await page.locator('#auth-submit').click();await page.waitForURL('https://pay.chargily.dz/test/demo');
 const checkout=calls.find(c=>c.url==='/functions/v1/qr-checkout');expect(checkout).toBeTruthy();expect(JSON.parse(checkout.body).draft.content.url).toBe('https://exemple.dz/ma-page');
});
test('récupération de mot de passe utilise la redirection autorisée',async({page})=>{
 const calls=await mockSupabase(page);await page.goto('/');await page.locator('.head-actions .account-label').click();await page.getByRole('button',{name:'Mot de passe oublié ?'}).click();await page.locator('#auth-email').fill('demo@example.com');await page.getByRole('button',{name:/Envoyer le lien/}).click();await expect(page.getByText(/Si cette adresse possède un compte/)).toBeVisible();expect(calls.some(c=>c.url==='/auth/v1/recover')).toBe(true);
});
test('les neuf styles SVG se décodent vers le contenu payé',async({page})=>{
 const script=`import { DEFAULT_STYLE,renderSvg } from './supabase/functions/_shared/qr.js'; const all=[];for(const dots of ['square','rounded','dots'])for(const corner of ['square','rounded','circle'])all.push(renderSvg({type:'url',content:{url:'https://example.com/scan-me'},style:{...DEFAULT_STYLE,dots,corner}}));console.log(JSON.stringify(all));`;
 const svgList=JSON.parse(execFileSync(path.join(process.cwd(),'node_modules/.bin/deno'),['eval',script],{encoding:'utf8'}));await page.goto('/');await page.addScriptTag({path:require.resolve('jsqr/dist/jsQR.js')});
 for(const svg of svgList){const decoded=await page.evaluate(async s=>{const blob=new Blob([s],{type:'image/svg+xml'}),url=URL.createObjectURL(blob);try{const img=new Image();await new Promise((ok,no)=>{img.onload=ok;img.onerror=no;img.src=url});const c=document.createElement('canvas');c.width=800;c.height=800;const ctx=c.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,800);ctx.drawImage(img,0,0,800,800);const pixels=ctx.getImageData(0,0,800,800);return window.jsQR(pixels.data,800,800)?.data||''}finally{URL.revokeObjectURL(url)}},svg);expect(decoded).toBe('https://example.com/scan-me')}
});


test('la récupération admin demande l’e-mail uniquement lorsqu’elle est nécessaire',async({page})=>{
 await mockSupabase(page);await page.goto('/admin/');await expect(page.locator('#email')).toHaveCount(0);
 const href=await page.locator('#recovery-link').getAttribute('href');expect(href).toContain('/?forgot=1');
 await page.goto('/?forgot=1');await expect(page.getByRole('heading',{name:'Mot de passe oublié ?'})).toBeVisible();await expect(page.locator('#auth-email')).toBeVisible();
});
