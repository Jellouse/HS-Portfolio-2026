
import pg from 'pg';
import Stripe from 'stripe';

let pool, stripe;
export function getPool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');

  pool ??= new pg.Pool({ connectionString: url, max: 1 });
  return pool;
}
export function getStripe() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('STRIPE_SECRET_KEY is not set');
  stripe ??= new Stripe(key);
  return stripe;
}
