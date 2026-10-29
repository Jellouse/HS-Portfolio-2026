import type { APIRoute } from 'astro';
import { getPool } from '../../lib/shop/server.mjs';
import { contactConfirmationEmail } from '../../lib/contact-confirmation-email';

export const prerender = false;

// Contact sheet submissions: saved in Neon (contact_messages, self-seeding) and emailed via
// Resend when RESEND_API_KEY is set (CONTACT_TO, default schnettker.johann@gmail.com;
// CONTACT_FROM, default the Resend test sender). Succeeds if either the save or the mail does.
const env = (k: string) => (import.meta.env[k] as string | undefined) ?? process.env[k];

async function store(service: string, project: string, email: string) {
  if (!env('DATABASE_URL')) return false;
  try {
    const db = getPool();
    await db.query(`create table if not exists contact_messages (
      id bigserial primary key, created_at timestamptz not null default now(),
      service text not null, project text not null, email text not null)`);
    await db.query('insert into contact_messages (service, project, email) values ($1, $2, $3)', [service, project, email]);
    return true;
  } catch (e) {
    console.error('[contact] store failed', e);
    return false;
  }
}

async function mail(service: string, project: string, email: string) {
  const key = env('RESEND_API_KEY');
  if (!key) return false;
  try {
    const from = env('CONTACT_FROM') || 'Humansize <onboarding@resend.dev>';
    const toJohann = env('CONTACT_TO') || 'schnettker.johann@gmail.com';
    const notify = fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [toJohann],
        reply_to: email,
        subject: `New ${service} enquiry from ${email}`,
        text: `Service: ${service}\nFrom: ${email}\n\n${project}`,
      }),
      signal: AbortSignal.timeout(8000),
    });
    const confirm = fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [email],
        reply_to: toJohann,
        subject: 'We received your message · Humansize',
        text: contactConfirmationEmail(service, project),
      }),
      signal: AbortSignal.timeout(8000),
    });
    const [res, resConfirm] = await Promise.all([notify, confirm]);
    if (!res.ok) console.error('[contact] resend notify', res.status, await res.text());
    if (!resConfirm.ok) console.error('[contact] resend confirm', resConfirm.status, await resConfirm.text());
    return res.ok || resConfirm.ok;
  } catch (e) {
    console.error('[contact] mail failed', e);
    return false;
  }
}
const SERVICES = new Set(['Retail', 'Website', 'Other']);

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
  const [saved, sent] = await Promise.all([store(service, project, email), mail(service, project, email)]);
  if (saved || sent) return Response.json({ ok: true, saved, sent });
  return Response.json({ error: 'unavailable' }, { status: 503 });
};
