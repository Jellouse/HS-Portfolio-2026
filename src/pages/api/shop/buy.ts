import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { buy } from '../../../lib/shop/store.mjs';
import { getPool, getStripe } from '../../../lib/shop/server.mjs';

export const prerender = false;

export const POST: APIRoute = async ({ request, url, redirect }) => {
  const form = await request.formData().catch(() => null);
  const slug = String(form?.get('slug') || '');
  const entry = slug ? await getEntry('products', slug).catch(() => undefined) : undefined;
  if (!entry) return redirect('/shop/', 303);
  const back = (state: string) => redirect(`/shop/${slug}/?checkout=${state}`, 303);

  if (!process.env.DATABASE_URL || !process.env.STRIPE_SECRET_KEY) return back('soon');
  try {
    const siteUrl = process.env.SHOP_SITE_URL || url.origin;
    const r = await buy(getPool(), getStripe(), { slug, name: entry.data.name, siteUrl });
    if (r.soldOut || !r.url) return back('soldout');
    return redirect(r.url, 303);
  } catch (e) {
    console.error('[shop] buy failed', e);
    return back('error');
  }
};
