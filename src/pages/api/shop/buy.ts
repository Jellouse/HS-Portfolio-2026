import type { APIRoute } from 'astro';
import { getEntry } from 'astro:content';
import { buy } from '../../../lib/shop/store.mjs';
import { getPool, getStripe } from '../../../lib/shop/server.mjs';

export const prerender = false;

// The detail page's Buy button is a plain <form method="post">, so it works without JS.
export const POST: APIRoute = async ({ request, url, redirect }) => {
  const form = await request.formData().catch(() => null);
  const slug = String(form?.get('slug') || '');
  const entry = slug ? await getEntry('products', slug) : undefined;
  if (!entry) return new Response('Unknown product', { status: 404 });
  const back = `/shop/${slug}/`;
  try {
    const siteUrl = process.env.SHOP_SITE_URL || url.origin;
    const r = await buy(getPool(), getStripe(), { slug, name: entry.data.name, siteUrl });
    if (r.soldOut || !r.url) return redirect(`${back}?soldout=1`, 303);
    return redirect(r.url, 303);
  } catch (e) {
    console.error('[shop] buy failed', e);
    return redirect(`${back}?error=1`, 303);
  }
};
