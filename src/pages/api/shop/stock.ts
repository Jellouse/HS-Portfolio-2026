import type { APIRoute } from 'astro';
import { stock } from '../../../lib/shop/store.mjs';
import { getPool } from '../../../lib/shop/server.mjs';

export const prerender = false;

// Feeds the Buy button label. Short CDN cache; the page falls back to "Buy" on any error.
export const GET: APIRoute = async () => {
  try {
    const data = await stock(getPool());
    return Response.json(data, { headers: { 'cache-control': 'public, max-age=0, s-maxage=10, stale-while-revalidate=30' } });
  } catch (e) {
    console.error('[shop] stock failed', e);
    return Response.json({ error: 'unavailable' }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
};
