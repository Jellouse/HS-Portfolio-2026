// Lazy singletons for the server routes. Env: DATABASE_URL, STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET.
import pg from 'pg';
import Stripe from 'stripe';

let pool, stripe;
export function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  // Serverless: one connection per instance is plenty for a shop this size.
  pool ??= new pg.Pool({ connectionString: url, max: 1 });
  return pool;
}
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  stripe ??= new Stripe(key);
  return stripe;
}
