/**
 * Contact sheet. Slides up over a backdrop that darkens progressively; click outside or Esc
 * closes. Enter goes to the next step (Shift+Enter is a newline in the project text). From
 * step 2 on, hovering the dots merges them and brings in Back / Next; Next is off while the
 * step is empty. Submits to /api/contact.
 */
export function initContact() {
  const root = document.querySelector<HTMLElement>('[data-contact]');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = '';
  const form = root.querySelector('form')!;
  const steps = [...root.querySelectorAll<HTMLElement>('.contact-step')];
  const nav = root.querySelector<HTMLElement>('[data-contact-nav]')!;
  const next = root.querySelector<HTMLButtonElement>('[data-contact-next]')!;
  const back = root.querySelector<HTMLButtonElement>('[data-contact-back]')!;
  const text = root.querySelector<HTMLTextAreaElement>('textarea')!;
  const email = root.querySelector<HTMLInputElement>('input[type=email]')!;
  const msg = root.querySelector<HTMLElement>('[data-contact-msg]')!;
  const thanks = msg.textContent;
  let step = 1;
  let service = '';
  let closeTimer = 0;
  const field = root.querySelector<HTMLElement>('[data-contact-field]')!;
  const mirror = root.querySelector<HTMLElement>('[data-contact-mirror]')!;
  let lines = 1;

  // Count wrapped lines with a hidden left-aligned mirror (same width and type). Only a change
  // in the count touches the textarea, so typing within a line never moves the block.
  const measure = () => {
    mirror.textContent = text.value + '\u200b';
    const lh = parseFloat(getComputedStyle(mirror).lineHeight) || 29;
    const n = Math.max(1, Math.round(mirror.offsetHeight / lh));
    const max = Math.max(1, Math.floor(field.clientHeight / lh));
    if (n === lines && field.style.getPropertyValue('--lines')) return;
    lines = n;
    field.style.setProperty('--lines', String(Math.min(n, max)));
    field.classList.toggle('is-multi', n > 1);
    field.classList.toggle('is-full', n > max);
    if (n > max) text.scrollTop = text.scrollHeight;
  };

  const filled = () =>
    step === 1 ? !!service : step === 2 ? !!text.value.trim() : step === 3 ? email.checkValidity() && !!email.value : false;

  const render = () => {
    steps.forEach((s) => (s.hidden = s.dataset.step !== String(step)));
    root.dataset.step = String(step);
    nav.querySelectorAll('i').forEach((d, i) => d.classList.toggle('is-on', i + 1 === step));
    nav.classList.toggle('has-controls', typeof step === 'number' && step >= 2);
    next.disabled = !filled();
    next.textContent = step === 3 ? 'Send' : 'Next';
    root.querySelectorAll<HTMLElement>('.contact-step .contact-q').forEach((q) => {
      const s = q.closest<HTMLElement>('.contact-step')!.dataset.step;
      if (s === '2') q.classList.toggle('is-muted', !!text.value.trim());
      if (s === '3') q.classList.toggle('is-muted', !!email.value);
    });
  };

  const open = () => {
    clearTimeout(closeTimer);
    root.hidden = false;
    document.documentElement.classList.add('is-contact-open');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
    render();
  };
  const close = () => {
    root.classList.remove('is-open');
    document.documentElement.classList.remove('is-contact-open');
    closeTimer = window.setTimeout(() => {
      root.hidden = true;
      if (step === 4) reset();
    }, 500);
  };
  const reset = () => {
    step = 1;
    service = '';
    text.value = '';
    measure();
    email.value = '';
    msg.textContent = thanks;
    root.querySelectorAll('[data-service]').forEach((b) => b.classList.remove('is-picked'));
    render();
  };
  const focusStep = () => (step === 2 ? text : step === 3 ? email : null)?.focus({ preventScroll: true });

  const send = async () => {
    step = 4 as number;
    root.dataset.step = 'done';
    steps.forEach((s) => (s.hidden = s.dataset.step !== 'done'));
    nav.classList.remove('has-controls');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service, project: text.value.trim(), email: email.value.trim() }),
      });
      if (!res.ok) throw new Error(String(res.status));
    } catch {
      msg.textContent = `That didn’t go through. Please email ${root.dataset.email} instead.`;
    }
  };
  const go = (dir: 1 | -1) => {
    if (dir === 1 && !filled()) return;
    if (dir === 1 && step === 3) return void send();
    step = Math.min(3, Math.max(1, step + dir));
    render();
    if (step === 2) measure();
    focusStep();
  };

  document.addEventListener('click', (e) => {
    const t = (e.target as Element).closest('[data-contact-open]');
    if (!t) return;
    e.preventDefault();
    open();
  });
  root.querySelector('[data-contact-close]')!.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (root.hidden) return;
    if (e.key === 'Escape') close();
    if (e.key === 'Enter' && !e.shiftKey && step >= 2 && step <= 3) {
      e.preventDefault();
      go(1);
    }
  });
  root.querySelectorAll<HTMLButtonElement>('[data-service]').forEach((b) =>
    b.addEventListener('click', () => {
      service = b.dataset.service || '';
      root.querySelectorAll('[data-service]').forEach((x) => x.classList.toggle('is-picked', x === b));
      go(1);
    }),
  );
  next.addEventListener('click', () => go(1));
  back.addEventListener('click', () => go(-1));
  form.addEventListener('input', render);
  text.addEventListener('input', measure);
  addEventListener('resize', measure);
  form.addEventListener('submit', (e) => e.preventDefault());
  render();
}
