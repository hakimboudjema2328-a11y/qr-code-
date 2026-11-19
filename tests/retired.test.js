import assert from 'node:assert/strict';
import { retiredHandler } from '../supabase/functions/_shared/retired.js';
Deno.test('les anciens services de paiement sont désactivés', async () => {
 const r=retiredHandler(); assert.equal(r.status,410); assert.match((await r.json()).error,/WhatsApp/);
});
