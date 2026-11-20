import assert from 'node:assert/strict';
import worker from '../site-public/web/_worker.js';

Deno.test('les anciens chemins administrateur renvoient 404 sans cache', async () => {
  const env={ASSETS:{fetch(){throw new Error('Les assets ne doivent pas servir une ancienne page admin.')}}};
  for (const path of ['/admin','/admin/','/admin/index.html','/admin/vendor/supabase.js']) {
    for (const method of ['GET','HEAD','POST']) {
      const response=await worker.fetch(new Request('https://massify.example'+path,{method}),env);
      assert.equal(response.status,404);
      assert.match(response.headers.get('cache-control'),/no-store/);
      assert.equal(response.headers.get('x-robots-tag'),'noindex');
      if (method==='HEAD') assert.equal(await response.text(),'');
    }
  }
});
Deno.test('les autres chemins restent accessibles aux assets Pages', async () => {
  const request=new Request('https://massify.example/r/123');
  const response=await worker.fetch(request,{ASSETS:{fetch: r=>new Response(new URL(r.url).pathname)}});
  assert.equal(await response.text(),'/r/123');
});
