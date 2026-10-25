# Shop checkout (humansize.de)

Buy now, one item, no cart. Stripe Checkout + one Postgres DB with two tables.

- `POST /api/shop/buy` takes the lowest free serial under a row lock, holds it as a pending
  order for 30 min (Stripe's minimum session life) and redirects to Stripe Checkout.
- `GET /api/shop/stock` gives the next serial per vase for the Buy label (10 s CDN cache).
- `POST /api/shop/webhook` handles `checkout.session.completed`, `async_payment_succeeded`
  and `expired`. Idempotent. Ignores events without `metadata.site = humansize`.
- `/admin` orders, serials, price and stock. Same GitHub login as Keystatic.
- Abandoned holds also come back by themselves 5 min after expiry (checked on every read),
  so there is no cron.
- Tables are created and seeded on first request (`src/lib/shop/store.mjs`), no migration step.
- Keystatic stays the source for copy and images. Price shown on the page comes from Keystatic;
  the price charged comes from the DB (edit in /admin). Keep them in sync.

## Env (Vercel, Production + Preview)
- `DATABASE_URL` set by the Vercel Neon integration.
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`.
- Optional `SHOP_SITE_URL` (defaults to the request origin).

Stripe webhook endpoint: `https://humansize.de/api/shop/webhook`, events
`checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.expired`.

## Local
```
sudo apt-get install postgresql && sudo pg_ctlcluster 17 main start
sudo -u postgres psql -c "CREATE USER shop WITH PASSWORD 'shop' SUPERUSER" -c "CREATE DATABASE shop OWNER shop" -c "CREATE DATABASE shop_test OWNER shop"
npm run test:shop
DATABASE_URL=postgres://shop:shop@localhost/shop SHOP_ADMIN_DEV=1 STRIPE_SECRET_KEY=sk_test_... npm run dev
```
