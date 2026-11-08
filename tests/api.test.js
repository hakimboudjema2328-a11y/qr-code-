import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomBytes, randomUUID } from 'node:crypto';
import { onRequestPost as checkoutHandler } from '../functions/api/checkout.js';
import { onRequestPost as webhookHandler } from '../functions/api/webhook.js';
import { onRequestGet as exportHandler } from '../functions/api/orders/[id]/export.js';
import { onRequestGet as orderHandler } from '../functions/api/orders/[id].js';
import { onRequestGet as adminHandler } from '../functions/api/admin/index.js';
import { onRequestPatch as settingsHandler } from '../functions/api/admin/settings.js';
import { onRequestGet as configHandler } from '../functions/api/config.js';
import { DEFAULT_STYLE } from '../shared/qr.js';

const buyer = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const other = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const admin = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const env = { SUPABASE_URL: 'https://example.supabase.co', SUPABASE_ANON_KEY: 'public-test', SUPABASE_SERVICE_ROLE_KEY: 'server-only-test', ADMIN_USER_ID: admin,
  ORDER_ENCRYPTION_KEY: randomBytes(32).toString('base64'), CHARGILY_MODE: 'test', CHARGILY_SECRET_KEY: 'test-secret', PUBLIC_SITE_URL: 'https://qr.example' };
const asJson = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
const req = (path, token = 'buyer', method = 'GET', body, origin = 'https://qr.example') => new Request(`https://qr.example${path}`, { method, headers: { Authorization: `Bearer ${token}`, Origin: origin, ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
function mockServices() {
  const state = { settings: { id: 1, price_dzd: 850, checkout_enabled: true, announcement: '', support_email: '' }, orders: [], checkouts: {}, createdRequest: null };
  const fetch = async (url, opts = {}) => {
    const u = new URL(url); const method = opts.method || 'GET';
    if (u.hostname === 'example.supabase.co' && u.pathname === '/auth/v1/user') {
      const token = (opts.headers?.Authorization || '').replace('Bearer ', '');
      const identity = { buyer, other, admin }[token];
      return identity ? asJson({ id: identity, email: `${token}@example.com`, email_confirmed_at: '2025-01-01T00:00:00Z' }) : asJson({}, 401);
    }
    if (u.hostname === 'example.supabase.co' && u.pathname === '/rest/v1/qr_studio_settings') {
      if (method === 'PATCH') Object.assign(state.settings, JSON.parse(opts.body));
      return asJson([state.settings]);
    }
    if (u.hostname === 'example.supabase.co' && u.pathname === '/rest/v1/qr_studio_orders') {
      if (method === 'POST') { state.orders.push(JSON.parse(opts.body)); return new Response(null, { status: 204 }); }
      let result = state.orders.filter(row => {
        for (const name of ['id','user_id','attempt_id','provider_checkout_id','status','payment_mode']) {
          const filter = u.searchParams.get(name); if (!filter) continue;
          if (filter.startsWith('eq.') && String(row[name]) !== filter.slice(3)) return false;
          if (filter.startsWith('neq.') && String(row[name]) === filter.slice(4)) return false;
        }
        return true;
      });
      if (method === 'PATCH') result.forEach(row => Object.assign(row, JSON.parse(opts.body)));
      return opts.headers?.Prefer === 'return=minimal' ? new Response(null, { status: 204 }) : asJson(result);
    }
    if (u.hostname === 'pay.chargily.net' && u.pathname === '/test/api/v2/checkouts' && method === 'POST') {
      const body = JSON.parse(opts.body); state.createdRequest = body;
      const object = { id: 'checkout_123456', amount: body.amount, currency: body.currency, livemode: false, metadata: body.metadata, status: 'pending', checkout_url: 'https://pay.chargily.dz/test/checkouts/checkout_123456/pay' };
      state.checkouts[object.id] = object; return asJson(object);
    }
    if (u.hostname === 'pay.chargily.net' && u.pathname.startsWith('/test/api/v2/checkouts/')) {
      const object = state.checkouts[u.pathname.split('/').pop()]; return object ? asJson(object) : asJson({}, 404);
    }
    throw new Error(`Unexpected mock request: ${method} ${u.origin}${u.pathname}`);
  };
  return { state, fetch };
}

test('payment lifecycle is server-priced, encrypted, authenticated, and verified before export', async () => {
  const originalFetch = globalThis.fetch; const mock = mockServices(); globalThis.fetch = mock.fetch;
  try {
    const attemptId = randomUUID(); const draft = { type: 'url', content: { url: 'https://client.example/important' }, style: { ...DEFAULT_STYLE } };
    let response = await checkoutHandler({ request: req('/api/checkout', 'buyer', 'POST', { draft, attemptId, price: 1 }), env });
    assert.equal(response.status, 200); const start = await response.json(); assert.match(start.checkoutUrl, /^https:\/\/pay\.chargily\.dz/);
    assert.equal(mock.state.createdRequest.amount, 850); assert.equal(mock.state.createdRequest.chargily_pay_fees_allocation, 'merchant');
    assert.equal(mock.state.orders[0].status, 'pending'); assert.equal(mock.state.orders[0].payment_mode, 'test'); assert.ok(!mock.state.orders[0].snapshot_ciphertext.includes('client.example'));
    assert.equal(mock.state.orders[0].customer_email, 'buyer@example.com');
    response = await checkoutHandler({ request: req('/api/checkout', 'buyer', 'POST', { draft, attemptId }), env });
    assert.equal((await response.json()).id, start.id); assert.equal(mock.state.orders.length, 1);
    response = await exportHandler({ request: req(`/api/orders/${start.id}/export`), env, params: { id: start.id } }); assert.equal(response.status, 403);
    response = await orderHandler({ request: req(`/api/orders/${start.id}`), env, params: { id: start.id } }); assert.equal((await response.json()).order.status, 'pending');
    response = await exportHandler({ request: req(`/api/orders/${start.id}/export`, 'other'), env, params: { id: start.id } }); assert.equal(response.status, 404);
    const raw = JSON.stringify({ type: 'checkout.paid', data: { id: 'checkout_123456' } });
    const makeWebhook = signature => new Request('https://qr.example/api/webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', signature }, body: raw });
    response = await webhookHandler({ request: makeWebhook('0'.repeat(64)), env }); assert.equal(response.status, 403); assert.equal(mock.state.orders[0].status, 'pending');
    const signature = createHmac('sha256', env.CHARGILY_SECRET_KEY).update(raw).digest('hex');
    // A valid webhook alone is insufficient: the provider must also report a paid, matching checkout.
    response = await webhookHandler({ request: makeWebhook(signature), env }); assert.equal(response.status, 200); assert.equal(mock.state.orders[0].status, 'pending');
    mock.state.checkouts.checkout_123456.status = 'paid'; mock.state.checkouts.checkout_123456.amount = 1;
    response = await webhookHandler({ request: makeWebhook(signature), env }); assert.equal(response.status, 403); assert.equal(mock.state.orders[0].status, 'pending');
    mock.state.checkouts.checkout_123456.amount = 850;
    response = await webhookHandler({ request: makeWebhook(signature), env }); assert.equal(response.status, 200); assert.equal(mock.state.orders[0].status, 'paid');
    const paidAt = mock.state.orders[0].paid_at;
    response = await webhookHandler({ request: makeWebhook(signature), env }); assert.equal(response.status, 200); assert.equal(mock.state.orders[0].paid_at, paidAt);
    response = await exportHandler({ request: req(`/api/orders/${start.id}/export`), env: { ...env, CHARGILY_MODE: 'live' }, params: { id: start.id } }); assert.equal(response.status, 404);
    response = await exportHandler({ request: req(`/api/orders/${start.id}/export`), env, params: { id: start.id } }); assert.equal(response.status, 200); assert.match(response.headers.get('content-type'), /image\/svg/); assert.match(await response.text(), /<svg/);
    response = await adminHandler({ request: req('/api/admin', 'buyer'), env }); assert.equal(response.status, 403);
    response = await adminHandler({ request: req('/api/admin', 'admin'), env }); assert.equal(response.status, 200);
    response = await settingsHandler({ request: req('/api/admin/settings', 'buyer', 'PATCH', { price_dzd: 1, checkout_enabled: true }), env }); assert.equal(response.status, 403);
    response = await settingsHandler({ request: req('/api/admin/settings', 'admin', 'PATCH', { price_dzd: 1200, checkout_enabled: true, announcement: 'Bonjour', support_email: 'help@example.com' }, 'https://evil.example'), env }); assert.equal(response.status, 403);
    response = await settingsHandler({ request: req('/api/admin/settings', 'admin', 'PATCH', { price_dzd: 1200, checkout_enabled: true, announcement: 'Bonjour', support_email: 'help@example.com' }), env }); assert.equal(response.status, 200);
    response = await configHandler({ env }); const publicConfig = await response.json(); assert.equal(publicConfig.priceDzd, 1200); assert.equal(publicConfig.salesEnabled, true); assert.ok(!JSON.stringify(publicConfig).includes(env.SUPABASE_SERVICE_ROLE_KEY));
  } finally { globalThis.fetch = originalFetch; }
});

test('missing payment configuration fails closed', async () => {
  const response = await checkoutHandler({ request: req('/api/checkout', 'buyer', 'POST', {}), env: {} });
  assert.equal(response.status, 503);
  const config = await (await configHandler({ env: {} })).json(); assert.equal(config.salesEnabled, false); assert.equal(config.priceDzd, null);
});
