import type { APIRoute } from 'astro';
import { handleEvent } from '../../../lib/shop/store.mjs';
import { getPool, getStripe } from '../../../lib/shop/server.mjs';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) return new Response('Not configured', { status: 503 });
  const body = await request.text();
  let event;
  try {
    event = getStripe().webhooks.constructEvent(body, request.headers.get('stripe-signature') || '', secret);
  } catch {
    return new Response('Bad signature', { status: 400 });
  }
  try {
    const result = await handleEvent(getPool(), event);
    return Response.json({ received: true, result });
  } catch (e) {
    console.error('[shop] webhook failed', event.type, e);
    return new Response('Retry', { status: 500 });
  }
};
