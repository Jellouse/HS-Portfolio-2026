// Industrial Bloom checkout on humansize.de. Plain JS so `npm test` can run it without Astro.
// Two tables. A "hold" is simply a pending order with an expiry; no cart, no cron.
// Expired holds are released lazily on the next read/buy, and by Stripe's expired webhook.

import { serialLabel } from './label.mjs';
export { serialLabel };

export const SITE = 'humansize';
// Stripe Checkout requires expires_at >= 30 min ahead, so the hold matches that (not 15 min).
export const HOLD_MINUTES = 30;
// A payment can complete right at the deadline; give the webhook a grace window before release.
export const GRACE_MINUTES = 5;
export const SHIPPING_CENTS = 1200;
// Copied from industrial-bloom lib/shop/shipping.js.
export const SHIPPING_COUNTRIES = ['DE', 'AT', 'BE', 'CZ', 'DK', 'ES', 'FI', 'FR', 'IE', 'IT', 'LU', 'NL', 'PL', 'PT', 'SE'];

// Starting prices and edition sizes (Oct 2026). Seeded only into an empty table; /admin owns them after that.
export const SEED = [
  { slug: '660', code: '660', price_cents: 7000, edition_size: 8 },
  { slug: '120', code: '120', price_cents: 15000, edition_size: 2 },
  { slug: '490', code: '490', price_cents: 25000, edition_size: 2 },
  { slug: '28', code: '28', price_cents: 5500, edition_size: 4 },
];

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS shop_products (
  slug text PRIMARY KEY,
  code text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  edition_size integer NOT NULL CHECK (edition_size >= 0),
  available_serials integer[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS shop_orders (
  id bigserial PRIMARY KEY,
  slug text NOT NULL REFERENCES shop_products(slug),
  serial integer NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','expired','refunded')),
  expires_at timestamptz NOT NULL,
  stripe_session_id text UNIQUE,
  amount_total integer,
  customer_email text,
  customer_name text,
  shipping jsonb,
  fulfilment text NOT NULL DEFAULT 'unfulfilled' CHECK (fulfilment IN ('unfulfilled','shipped','check')),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  shipped_at timestamptz
);
CREATE INDEX IF NOT EXISTS shop_orders_pending ON shop_orders (expires_at) WHERE status = 'pending';
`;


const ready = new WeakMap();
/** Creates tables and seeds on first use, so a fresh Neon DB needs no migration step. */
export function ensureSchema(pool) {
  if (!ready.has(pool)) {
    ready.set(pool, (async () => {
      await pool.query(SCHEMA);
      for (const p of SEED) {
        await pool.query(
          `INSERT INTO shop_products (slug, code, price_cents, edition_size, available_serials)
           VALUES ($1,$2,$3,$4,(SELECT array_agg(g) FROM generate_series(1,$4::int) g))
           ON CONFLICT (slug) DO NOTHING`,
          [p.slug, p.code, p.price_cents, p.edition_size],
        );
      }
    })().catch((e) => { ready.delete(pool); throw e; }));
  }
  return ready.get(pool);
}

async function tx(pool, fn) {
  await ensureSchema(pool);
  const c = await pool.connect();
  try {
    await c.query('BEGIN');
    const out = await fn(c);
    await c.query('COMMIT');
    return out;
  } catch (e) {
    await c.query('ROLLBACK').catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

// Puts a serial back in the free pool (sorted, no duplicates).
const RESTORE = `UPDATE shop_products SET available_serials =
  (SELECT array_agg(DISTINCT s ORDER BY s) FROM unnest(array_append(available_serials, $2::int)) s),
  updated_at = now() WHERE slug = $1`;

/** Releases one order's hold if it is still pending. Returns true when a serial went back. */
async function releaseOrder(c, where, params, toStatus = 'expired') {
  const { rows } = await c.query(
    `UPDATE shop_orders SET status = '${toStatus}' WHERE ${where} AND status = 'pending' RETURNING slug, serial`,
    params,
  );
  for (const r of rows) await c.query(RESTORE, [r.slug, r.serial]);
  return rows;
}

export async function releaseStale(pool) {
  return tx(pool, (c) => releaseOrder(c, `id IN (SELECT id FROM shop_orders WHERE status = 'pending'
    AND expires_at < now() - interval '${GRACE_MINUTES} minutes' FOR UPDATE SKIP LOCKED)`, []));
}

/** Next free serial per product. Held serials are already out of available_serials. */
export async function stock(pool) {
  await releaseStale(pool);
  const { rows } = await pool.query('SELECT slug, code, price_cents, available_serials FROM shop_products ORDER BY slug');
  return Object.fromEntries(rows.map((r) => {
    const next = r.available_serials.length ? Math.min(...r.available_serials) : null;
    return [r.slug, { next, label: next ? serialLabel(r.code, next) : null, soldOut: next === null, price_cents: r.price_cents, free: r.available_serials.length }];
  }));
}

/**
 * Buy now: take the lowest free serial under a row lock, hold it, open Stripe Checkout.
 * If Stripe fails the hold is released at once.
 */
export async function buy(pool, stripe, { slug, name, siteUrl, now = Date.now() }) {
  await releaseStale(pool);
  const expiresAt = new Date(now + HOLD_MINUTES * 60_000);
  const held = await tx(pool, async (c) => {
    const { rows } = await c.query('SELECT * FROM shop_products WHERE slug = $1 FOR UPDATE', [slug]);
    const p = rows[0];
    if (!p) throw Object.assign(new Error('Unknown product'), { status: 404 });
    if (!p.available_serials.length) return null;
    const serial = Math.min(...p.available_serials);
    await c.query('UPDATE shop_products SET available_serials = array_remove(available_serials, $2::int), updated_at = now() WHERE slug = $1', [slug, serial]);
    const o = await c.query('INSERT INTO shop_orders (slug, serial, expires_at, amount_total) VALUES ($1,$2,$3,$4) RETURNING id', [slug, serial, expiresAt, p.price_cents + SHIPPING_CENTS]);
    return { orderId: o.rows[0].id, serial, product: p };
  });
  if (!held) return { soldOut: true };

  const label = serialLabel(held.product.code, held.serial);
  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      line_items: [{ quantity: 1, price_data: { currency: 'eur', unit_amount: held.product.price_cents, product_data: { name: `${name || slug}, ${label}` } } }],
      shipping_address_collection: { allowed_countries: SHIPPING_COUNTRIES },
      shipping_options: [{ shipping_rate_data: { display_name: 'EU shipping, 3–7 business days', type: 'fixed_amount', fixed_amount: { amount: SHIPPING_CENTS, currency: 'eur' },
        delivery_estimate: { minimum: { unit: 'business_day', value: 3 }, maximum: { unit: 'business_day', value: 7 } } } }],
      metadata: { site: SITE, product: slug, serial: String(held.serial), order: String(held.orderId) },
      success_url: `${siteUrl}/shop/${slug}/?bought=${encodeURIComponent(label)}`,
      cancel_url: `${siteUrl}/shop/${slug}/`,
    });
    await pool.query('UPDATE shop_orders SET stripe_session_id = $2 WHERE id = $1', [held.orderId, session.id]);
    return { url: session.url, serial: held.serial, label, orderId: held.orderId };
  } catch (e) {
    await tx(pool, (c) => releaseOrder(c, 'id = $1', [held.orderId]));
    throw e;
  }
}

/** Stripe webhook body, already signature-checked. Idempotent; ignores other sites. */
export async function handleEvent(pool, event) {
  const s = event.data?.object || {};
  if (s.metadata?.site !== SITE) return 'ignored';
  const orderId = Number(s.metadata.order);
  if (!orderId) return 'ignored';

  if (event.type === 'checkout.session.expired') {
    const r = await tx(pool, (c) => releaseOrder(c, 'id = $1', [orderId]));
    return r.length ? 'released' : 'noop';
  }
  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    if (s.payment_status !== 'paid') return 'waiting';
    return tx(pool, async (c) => {
      const { rows } = await c.query('SELECT * FROM shop_orders WHERE id = $1 FOR UPDATE', [orderId]);
      const o = rows[0];
      if (!o || o.status === 'paid' || o.status === 'refunded') return 'noop';
      let fulfilment = 'unfulfilled', note = null;
      if (o.status === 'expired') {
        // Paid after the hold was released: take the serial back if nobody else has it.
        const got = await c.query('UPDATE shop_products SET available_serials = array_remove(available_serials, $2::int) WHERE slug = $1 AND $2 = ANY(available_serials) RETURNING slug', [o.slug, o.serial]);
        if (!got.rowCount) { fulfilment = 'check'; note = 'Paid after hold expired; serial was taken again. Refund or swap serial.'; }
      }
      const ship = s.collected_information?.shipping_details || s.shipping_details || null;
      await c.query(
        `UPDATE shop_orders SET status = 'paid', paid_at = now(), stripe_session_id = $2, amount_total = COALESCE($3, amount_total),
           customer_email = $4, customer_name = $5, shipping = $6::jsonb, fulfilment = $7, note = $8 WHERE id = $1`,
        [orderId, s.id, s.amount_total ?? null, s.customer_details?.email ?? null, ship?.name || s.customer_details?.name || null, JSON.stringify(ship?.address || null), fulfilment, note],
      );
      return 'paid';
    });
  }
  return 'ignored';
}

// ---------- admin ----------
export async function adminOverview(pool) {
  await releaseStale(pool);
  const products = (await pool.query('SELECT * FROM shop_products ORDER BY price_cents')).rows;
  const orders = (await pool.query("SELECT * FROM shop_orders WHERE status <> 'expired' ORDER BY created_at DESC LIMIT 200")).rows;
  const vases = products.map((p) => {
    const mine = orders.filter((o) => o.slug === p.slug);
    const serials = Array.from({ length: Math.max(p.edition_size, ...p.available_serials, ...mine.map((o) => o.serial), 0) }, (_, i) => {
      const n = i + 1;
      const o = mine.find((x) => x.serial === n && (x.status === 'paid' || x.status === 'pending'));
      return { n, label: serialLabel(p.code, n), state: p.available_serials.includes(n) ? 'free' : o?.status === 'paid' ? 'sold' : o ? 'held' : 'off', order: o?.id };
    });
    return { ...p, serials };
  });
  return { vases, orders };
}

export async function markShipped(pool, id, shipped = true) {
  await ensureSchema(pool);
  await pool.query(`UPDATE shop_orders SET fulfilment = $2, shipped_at = $3 WHERE id = $1 AND status = 'paid'`, [id, shipped ? 'shipped' : 'unfulfilled', shipped ? new Date() : null]);
}

/** Refund flow: refund in Stripe, then put the serial back on sale here. */
export async function restoreSerial(pool, orderId) {
  return tx(pool, async (c) => {
    const { rows } = await c.query("UPDATE shop_orders SET status = 'refunded' WHERE id = $1 AND status = 'paid' RETURNING slug, serial", [orderId]);
    for (const r of rows) await c.query(RESTORE, [r.slug, r.serial]);
    return rows.length > 0;
  });
}

/** Price in euros; stock as "free serials" list like "3-8" or "1,2,5". */
export async function updateProduct(pool, slug, { priceEur, freeSerials }) {
  return tx(pool, async (c) => {
    if (priceEur != null && priceEur !== '') {
      const cents = Math.round(Number(priceEur) * 100);
      if (!(cents > 0)) throw new Error('Price must be above 0.');
      await c.query('UPDATE shop_products SET price_cents = $2, updated_at = now() WHERE slug = $1', [slug, cents]);
    }
    if (freeSerials != null) {
      const list = parseSerials(freeSerials);
      const taken = await c.query("SELECT serial FROM shop_orders WHERE slug = $1 AND status IN ('pending','paid') AND serial = ANY($2::int[])", [slug, list]);
      if (taken.rowCount) throw new Error(`Serial ${taken.rows.map((r) => r.serial).join(', ')} is held or sold.`);
      await c.query('UPDATE shop_products SET available_serials = $2::int[], edition_size = GREATEST(edition_size, COALESCE((SELECT max(x) FROM unnest($2::int[]) x), 0)), updated_at = now() WHERE slug = $1', [slug, list]);
    }
  });
}

export function parseSerials(value) {
  const out = new Set();
  for (const part of String(value).split(',')) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if (!m) throw new Error(`Can't read "${t}". Use e.g. 3-8 or 1,2,5.`);
    const a = Number(m[1]), b = Number(m[2] || m[1]);
    if (a < 1 || b < a || b - a > 999) throw new Error(`Bad range "${t}".`);
    for (let n = a; n <= b; n++) out.add(n);
  }
  return [...out].sort((x, y) => x - y);
}
