import type { APIRoute } from 'astro';
import { getPool } from '../../lib/shop/server.mjs';

export const prerender = false;

// Contact sheet submissions. Stored in Neon (contact_messages, self-seeding); no mail is sent
// yet. Email forwarding needs a mail provider key, which is not configured.
const SERVICES = new Set(['Product', 'Retail', 'Website', 'Other']);

export const POST: APIRoute = async ({ request }) => {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'bad json' }, { status: 400 });
  }
  const service = String(body.service || '');
  const project = String(body.project || '').trim().slice(0, 5000);
  const email = String(body.email || '').trim().slice(0, 320);
  if (!SERVICES.has(service) || !project || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: 'invalid' }, { status: 400 });
  }
  try {
    const db = getPool();
    await db.query(`create table if not exists contact_messages (
      id bigserial primary key, created_at timestamptz not null default now(),
      service text not null, project text not null, email text not null)`);
    await db.query('insert into contact_messages (service, project, email) values ($1, $2, $3)', [service, project, email]);
    return Response.json({ ok: true });
  } catch (e) {
    console.error('[contact] store failed', e);
    return Response.json({ error: 'unavailable' }, { status: 503 });
  }
};
