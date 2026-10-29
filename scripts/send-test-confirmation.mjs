#!/usr/bin/env node

import { contactConfirmationEmail } from '../src/lib/contact-confirmation-email.ts';

const to = process.argv[2]?.trim();
const key = process.env.RESEND_API_KEY;
if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
  console.error('Usage: RESEND_API_KEY=… node scripts/send-test-confirmation.mjs <recipient>');
  process.exit(1);
}
if (!key) {
  console.error('RESEND_API_KEY is not set.');
  process.exit(1);
}

const from = process.env.CONTACT_FROM || 'Humansize <onboarding@resend.dev>';
const replyTo = process.env.CONTACT_TO || 'schnettker.johann@gmail.com';
const service = 'Retail';
const project = 'Sample project: a short test message from send-test-confirmation.mjs.';

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
  body: JSON.stringify({
    from,
    to: [to],
    reply_to: replyTo,
    subject: 'We received your message · Humansize',
    text: contactConfirmationEmail(service, project),
  }),
});

if (!res.ok) {
  console.error('Resend error', res.status, await res.text());
  process.exit(1);
}
console.log('Sent confirmation to', to);
