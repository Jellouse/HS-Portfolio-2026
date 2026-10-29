
import pg from 'pg';
import Stripe from 'stripe';
import assert from 'node:assert/strict';
import { buy, handleEvent, stock, restoreSerial, ensureSchema, releaseStale, HOLD_MINUTES, GRACE_MINUTES } from '../src/lib/shop/store.mjs';
import { applyStock, buyLabel } from '../src/lib/shop/label.mjs';

const url = process.env.TEST_DATABASE_URL || 'postgres://shop:shop@localhost:5432/shop_test';
const pool = new pg.Pool({ connectionString: url, max: 20 });
try { await pool.query('SELECT 1'); } catch (e) {
  console.error(`shop-checkout: no Postgres at ${url} (${e.message}). See docs/shop.md.`);
  process.exit(1);
}

let n = 0;
const fakeStripe = { checkout: { sessions: { create: async (p) => { await new Promise((r) => setTimeout(r, Math.random() * 20)); return { id: `cs_test_${++n}`, url: `https://checkout.stripe.test/${n}`, params: p }; } } } };
const reset = async () => {
  await pool.query('DROP TABLE IF EXISTS shop_orders, shop_products');
  const fresh = new pg.Pool({ connectionString: url, max: 20 });
  await ensureSchema(fresh);
  return fresh;
};
const results = [];
const test = async (name, fn) => {
  try { await fn(); results.push(['ok', name]); } catch (e) { results.push(['FAIL', name, e]); }
};
const ev = (type, o, extra = {}) => ({ id: `evt_${Math.random()}`, type, data: { object: { id: o.session || 'cs_x', payment_status: 'paid', amount_total: 8200, metadata: { site: 'humansize', product: o.slug, serial: String(o.serial), order: String(o.orderId) }, customer_details: { email: 'a@b.de', name: 'A B' }, collected_information: { shipping_details: { name: 'A B', address: { line1: 'Str 1', city: 'Berlin', postal_code: '10115', country: 'DE' } } }, ...extra } } });

await test('concurrent buys never get the same serial', async () => {
  const p = await reset();
  const all = await Promise.all(Array.from({ length: 12 }, () => buy(p, fakeStripe, { slug: '660', siteUrl: 'http://x' })));
  const serials = all.filter((r) => !r.soldOut).map((r) => r.serial);
  assert.equal(serials.length, 8, 'exactly the edition of 8 sold');
  assert.equal(new Set(serials).size, 8, 'no duplicates');
  assert.deepEqual([...serials].sort((a, b) => a - b), [1, 2, 3, 4, 5, 6, 7, 8]);
  assert.equal(all.filter((r) => r.soldOut).length, 4);
  const s = await stock(p);
  assert.equal(s['660'].soldOut, true);
  await p.end();
});

await test('checkout session carries expiry, shipping and site metadata', async () => {
  const p = await reset();
  const before = Date.now();
  let params;
  const spy = { checkout: { sessions: { create: async (x) => { params = x; return { id: 'cs_1', url: 'u' }; } } } };
  const r = await buy(p, spy, { slug: '490', name: 'Type 490', siteUrl: 'http://x' });
  assert.equal(r.label, 'IB-490-001');
  assert.deepEqual(params.metadata, { site: 'humansize', product: '490', serial: '1', order: String(r.orderId) });
  assert.equal(params.line_items[0].price_data.unit_amount, 25000);
  assert.equal(params.shipping_options[0].shipping_rate_data.fixed_amount.amount, 1200);
  assert.equal(params.shipping_address_collection.allowed_countries.length, 15);
  assert.ok(Math.abs(params.expires_at * 1000 - (before + HOLD_MINUTES * 60_000)) < 5000);
  const { rows } = await p.query('SELECT expires_at FROM shop_orders WHERE id = $1', [r.orderId]);
  assert.equal(Math.floor(rows[0].expires_at.getTime() / 1000), params.expires_at, 'hold and Stripe share one expiry');
  await p.end();
});

await test('Stripe failure releases the hold at once', async () => {
  const p = await reset();
  const broken = { checkout: { sessions: { create: async () => { throw new Error('stripe down'); } } } };
  await assert.rejects(buy(p, broken, { slug: '120', siteUrl: 'http://x' }));
  assert.equal((await stock(p))['120'].label, 'IB-120-001');
  await p.end();
});

await test('expiry restores the serial (webhook and lazy timeout)', async () => {
  const p = await reset();
  const a = await buy(p, fakeStripe, { slug: '120', siteUrl: 'http://x' });
  const b = await buy(p, fakeStripe, { slug: '120', siteUrl: 'http://x' });
  assert.equal((await stock(p))['120'].soldOut, true);

  assert.equal(await handleEvent(p, ev('checkout.session.expired', { ...a, slug: '120' })), 'released');
  assert.equal(await handleEvent(p, ev('checkout.session.expired', { ...a, slug: '120' })), 'noop', 'second delivery is a no-op');
  assert.equal((await stock(p))['120'].label, 'IB-120-001');

  await p.query(`UPDATE shop_orders SET expires_at = now() - interval '${GRACE_MINUTES + 1} minutes' WHERE id = $1`, [b.orderId]);
  await releaseStale(p);
  const s = (await stock(p))['120'];
  assert.equal(s.free, 2);

  const c = await buy(p, fakeStripe, { slug: '120', siteUrl: 'http://x' });
  await p.query(`UPDATE shop_orders SET expires_at = now() - interval '1 minute' WHERE id = $1`, [c.orderId]);
  assert.equal((await stock(p))['120'].free, 1);
  await p.end();
});

await test('webhook is idempotent', async () => {
  const p = await reset();
  const a = await buy(p, fakeStripe, { slug: '660', siteUrl: 'http://x' });
  const e = ev('checkout.session.completed', { ...a, slug: '660', session: 'cs_test_1' });
  const out = await Promise.all([handleEvent(p, e), handleEvent(p, e), handleEvent(p, ev('checkout.session.async_payment_succeeded', { ...a, slug: '660', session: 'cs_test_1' }))]);
  assert.equal(out.filter((x) => x === 'paid').length, 1);
  assert.equal(await handleEvent(p, ev('checkout.session.expired', { ...a, slug: '660' })), 'noop', 'late expired never frees a paid serial');
  const { rows } = await p.query('SELECT * FROM shop_orders');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'paid');
  assert.equal(rows[0].shipping.city, 'Berlin');
  assert.equal((await stock(p))['660'].label, 'IB-660-002');

  assert.equal(await restoreSerial(p, rows[0].id), true);
  assert.equal(await restoreSerial(p, rows[0].id), false);
  assert.equal((await stock(p))['660'].label, 'IB-660-001');
  await p.end();
});

await test('paid after hold expired: re-take serial or flag for check', async () => {
  const p = await reset();
  const a = await buy(p, fakeStripe, { slug: '490', siteUrl: 'http://x' });
  await handleEvent(p, ev('checkout.session.expired', { ...a, slug: '490' }));
  assert.equal(await handleEvent(p, ev('checkout.session.completed', { ...a, slug: '490' })), 'paid');
  assert.equal((await stock(p))['490'].label, 'IB-490-002');
  const { rows } = await p.query('SELECT fulfilment FROM shop_orders WHERE id = $1', [a.orderId]);
  assert.equal(rows[0].fulfilment, 'unfulfilled');
  await p.end();
});

await test('foreign-site events are ignored', async () => {
  const p = await reset();
  const a = await buy(p, fakeStripe, { slug: '660', siteUrl: 'http://x' });
  for (const site of ['worksurface', undefined]) {
    const e = ev('checkout.session.completed', { ...a, slug: '660' });
    e.data.object.metadata.site = site;
    assert.equal(await handleEvent(p, e), 'ignored');
    const x = ev('checkout.session.expired', { ...a, slug: '660' });
    x.data.object.metadata.site = site;
    assert.equal(await handleEvent(p, x), 'ignored');
  }
  const { rows } = await p.query('SELECT status FROM shop_orders');
  assert.equal(rows[0].status, 'pending');
  await p.end();
});

await test('webhook signature check (real Stripe SDK)', async () => {
  const stripe = new Stripe('sk_test_dummy');
  const payload = JSON.stringify({ id: 'evt_1', type: 'checkout.session.expired', data: { object: { metadata: { site: 'worksurface' } } } });
  const secret = 'whsec_test';
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal(stripe.webhooks.constructEvent(payload, header, secret).id, 'evt_1');
  assert.throws(() => stripe.webhooks.constructEvent(payload, header, 'whsec_other'));
});

await test('button label updates', async () => {
  const p = await reset();
  const btn = () => ({ textContent: 'Buy', disabled: false, attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; } });
  const b = btn();
  applyStock(b, '660', await stock(p));
  assert.equal(b.textContent, 'Buy: IB-660-001');
  await buy(p, fakeStripe, { slug: '660', siteUrl: 'http://x' });
  applyStock(b, '660', await stock(p));
  assert.equal(b.textContent, 'Buy: IB-660-002');
  await buy(p, fakeStripe, { slug: '120', siteUrl: 'http://x' });
  await buy(p, fakeStripe, { slug: '120', siteUrl: 'http://x' });
  const c = btn();
  applyStock(c, '120', await stock(p));
  assert.equal(c.textContent, 'Sold out');
  assert.equal(c.disabled, true);

  for (const data of [null, { error: 'unavailable' }, {}]) {
    const d = btn(); applyStock(d, '120', data);
    assert.equal(d.textContent, 'Buy'); assert.equal(d.disabled, false);
  }
  assert.equal(buyLabel(undefined), 'Buy');
  await p.end();
});

await test('price comes from the DB seed, not Keystatic, in the built pages', async () => {
  const { readFile } = await import('node:fs/promises');
  const { SEED } = await import('../src/lib/shop/store.mjs');
  const root = '.vercel/output/static';
  const detail = await readFile(`${root}/shop/660/index.html`, 'utf8').catch(() => null);
  if (!detail) return console.log('   (no build, skipped page check)');
  const eur = SEED.find((x) => x.slug === '660').price_cents / 100;
  assert.match(detail, new RegExp(`data-price="660" data-price-style="suffix">${eur}€<`));
  assert.match(detail, new RegExp(`data-price="660" data-price-style="prefix">€${eur}<`));
  assert.match(detail, /data-buy-note/);
  const overview = await readFile(`${root}/shop/index.html`, 'utf8');
  assert.match(overview, new RegExp(`data-price="660" data-price-style="suffix">${eur}€<`));
  const ks = await readFile('keystatic.config.ts', 'utf8');
  assert.doesNotMatch(ks, /Price \(EUR\)|Price label/);
});

await test('every product on /shop has a store entry (catches Keystatic slug renames)', async () => {
  const { readdir, readFile } = await import('node:fs/promises');
  const { SEED } = await import('../src/lib/shop/store.mjs');
  const dir = 'src/content/products';
  const listed = [];
  for (const slug of await readdir(dir)) {
    const yaml = await readFile(`${dir}/${slug}/index.yaml`, 'utf8').catch(() => null);
    if (yaml === null) continue;

    const hidden = /^overview:\n(?:[ ].*\n)*?  show: false\b/m.test(yaml);
    if (!hidden) listed.push(slug);
  }
  assert.ok(listed.length > 0, 'no products found');
  const missing = listed.filter((slug) => !SEED.some((p) => p.slug === slug));
  assert.deepEqual(missing, [], `products on /shop without a store entry in store.mjs SEED: ${missing.join(', ')}`);
});

await test('Shipping row: one source, matches what Stripe charges, shown once', async () => {
  const { readFile } = await import('node:fs/promises');
  const { SHIPPING_TEXT, SHIPPING_CENTS } = await import('../src/lib/shop/store.mjs');
  assert.equal(SHIPPING_TEXT, '€12 flat, EU only, 3–7 business days');
  assert.ok(SHIPPING_TEXT.startsWith(`€${SHIPPING_CENTS / 100} `));
  const html = await readFile('.vercel/output/static/shop/660/index.html', 'utf8').catch(() => null);
  if (!html) return console.log('   (no build, skipped page check)');
  assert.equal(html.split(`Shipping: ${SHIPPING_TEXT}`).length - 1, 1, 'Shipping row exactly once');
});

await pool.query('DROP TABLE IF EXISTS shop_orders, shop_products');
await pool.end();
for (const [s, name, e] of results) console.log(`${s} ${name}${e ? `\n   ${e.stack || e}` : ''}`);
if (results.some((r) => r[0] === 'FAIL')) process.exit(1);
console.log(`shop-checkout: ${results.length} passed`);

await test('shop is findable: indexable, in the sitemap, Product JSON-LD, but not linked from nav/home', async () => {
  const { readFile, readdir } = await import('node:fs/promises');
  const root = '.vercel/output/static';
  const overview = await readFile(`${root}/shop/index.html`, 'utf8').catch(() => null);
  if (!overview) return console.log('   (no build, skipped)');
  const slugs = (await readdir('src/content/products', { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  const sitemap = (await Promise.all((await readdir(root)).filter((f) => /^sitemap-\d+\.xml$/.test(f)).map((f) => readFile(`${root}/${f}`, 'utf8')))).join('');
  assert.doesNotMatch(overview, /name="robots"/);
  assert.match(sitemap, /<loc>[^<]*\/shop\/<\/loc>/);
  const { hiddenProductSlugs } = await import('../src/lib/shop/hidden.mjs');
  const hidden = new Set(hiddenProductSlugs());
  assert.ok(hidden.has('28'), 'Type-28 has Show on /shop off');
  for (const slug of slugs) {
    const html = await readFile(`${root}/shop/${slug}/index.html`, 'utf8');
    assert.doesNotMatch(html, /name="robots"/, slug);
    assert.match(html, /"@type":"Product"/, slug);
    const inMap = new RegExp(`<loc>[^<]*/shop/${slug}/</loc>`).test(sitemap);
    assert.equal(inMap, !hidden.has(slug), `${slug} sitemap entry should follow Show on /shop`);
  }
  assert.doesNotMatch(sitemap, /\/(admin|canvas|keystatic)/);
  const home = await readFile(`${root}/index.html`, 'utf8');
  assert.doesNotMatch(home, /href="\/shop/);
});
