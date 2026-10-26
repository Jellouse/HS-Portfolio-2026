/**
 * Contact sheet, a modal dialog. Slides up over a backdrop that darkens progressively; click
 * outside or Esc closes and focus returns to the opener. Tab is trapped inside. Enter goes to
 * the next step (Shift+Enter is a newline in the project text). From step 2 on, hovering (or
 * focusing) the dots merges them and brings in Back / Next; Next is off while the step is
 * empty. Step changes and errors are announced in a polite live region. Submits to /api/contact.
 *
 * Page scroll is locked while open without moving the page (overflow hidden plus blocked
 * touchmove, so the homepage intro does not jump), and on phones the sheet follows the visual
 * viewport so the on-screen keyboard never uncovers the page behind it.
 */
const TITLES: Record<string, string> = { 1: 'Pick a service', 2: 'Describe your project', 3: 'Add your email' };

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
  const live = root.querySelector<HTMLElement>('[data-contact-live]')!;
  const field = root.querySelector<HTMLElement>('[data-contact-field]')!;
  const thanks = msg.textContent;
  let step = 1;
  let service = '';
  let closeTimer = 0;
  let opener: HTMLElement | null = null;
  let lines = 0;
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Line count from the textarea itself: collapse to one line, read scrollHeight, set the
  // height for that many lines, all in one synchronous pass on every change (typing, wrapping,
  // Shift+Enter, paste, delete, IME, resize). The box is never shorter than its text, so no
  // line is ever clipped. Only a change in line count re-centres the block, as a short FLIP.
  const measure = () => {
    const lh = parseFloat(getComputedStyle(text).lineHeight) || 29;
    const before = text.getBoundingClientRect().top;
    text.style.height = `${lh}px`;
    const n = Math.max(1, Math.round(text.scrollHeight / lh));
    const max = Math.max(1, Math.floor(field.clientHeight / lh));
    const shown = Math.min(n, max);
    text.style.height = `${shown * lh}px`;
    field.classList.toggle('is-multi', n > 1);
    field.classList.toggle('is-full', n > max);
    if (n <= max) text.scrollTop = 0;
    else if (text.selectionEnd === text.value.length) text.scrollTop = text.scrollHeight;
    if (lines && shown !== Math.min(lines, max) && !reduced()) {
      const d = before - text.getBoundingClientRect().top;
      if (d) text.animate([{ transform: `translateY(${d}px)` }, { transform: 'none' }], { duration: 240, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
    lines = n;
  };

  const filled = () =>
    step === 1 ? !!service : step === 2 ? !!text.value.trim() : step === 3 ? email.checkValidity() && !!email.value : false;

  const render = () => {
    steps.forEach((s) => (s.hidden = s.dataset.step !== String(step)));
    root.dataset.step = String(step);
    nav.querySelectorAll('i').forEach((d, i) => d.classList.toggle('is-on', i + 1 === step));
    nav.classList.toggle('has-controls', step >= 2 && step <= 3);
    nav.inert = !(step >= 2 && step <= 3);
    next.disabled = !filled();
    next.textContent = step === 3 ? 'Send' : 'Next';
    root.querySelectorAll<HTMLElement>('.contact-step .contact-q').forEach((q) => {
      const s = q.closest<HTMLElement>('.contact-step')!.dataset.step;
      if (s === '2') q.classList.toggle('is-muted', !!text.value.trim());
      if (s === '3') q.classList.toggle('is-muted', !!email.value);
    });
  };
  const announce = (t: string) => {
    live.textContent = '';
    requestAnimationFrame(() => (live.textContent = t));
  };

  // Viewport: keep the sheet on the visual viewport (iOS keyboard) and white underneath.
  const vv = window.visualViewport;
  const fit = () => {
    if (!vv || root.hidden) return;
    root.style.top = `${Math.round(vv.offsetTop)}px`;
    root.style.height = `${Math.round(vv.height)}px`;
  };
  vv?.addEventListener('resize', fit);
  vv?.addEventListener('scroll', fit);

  const focusables = () =>
    [...form.querySelectorAll<HTMLElement>('button, textarea, input, [href]')].filter(
      (el) => !(el as HTMLButtonElement).disabled && !el.closest('[hidden], [inert]') && el.getClientRects().length,
    );
  const focusStep = () => {
    const el = step === 2 ? text : step === 3 ? email : step === 1 ? form.querySelector<HTMLElement>('[data-service]') : msg;
    el?.focus({ preventScroll: true });
  };

  const open = (from: HTMLElement | null) => {
    clearTimeout(closeTimer);
    opener = from;
    root.hidden = false;
    fit();
    document.documentElement.classList.add('is-contact-open');
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('is-open')));
    render();
    focusStep();
    announce(`Contact. Step ${step} of 3: ${TITLES[step]}`);
  };
  const close = () => {
    root.classList.remove('is-open');
    document.documentElement.classList.remove('is-contact-open');
    opener?.focus({ preventScroll: true });
    closeTimer = window.setTimeout(() => {
      root.hidden = true;
      if (step === 4) reset();
    }, 500);
  };
  const reset = () => {
    step = 1;
    service = '';
    text.value = '';
    email.value = '';
    msg.textContent = thanks;
    lines = 0;
    text.style.height = '';
    root.querySelectorAll('[data-service]').forEach((b) => b.classList.remove('is-picked'));
    render();
  };

  const send = async () => {
    step = 4;
    root.dataset.step = 'done';
    steps.forEach((s) => (s.hidden = s.dataset.step !== 'done'));
    nav.classList.remove('has-controls');
    nav.inert = true;
    msg.tabIndex = -1;
    msg.focus({ preventScroll: true });
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ service, project: text.value.trim(), email: email.value.trim() }),
      });
      if (!res.ok) throw new Error(String(res.status));
      announce(msg.textContent || '');
    } catch {
      msg.textContent = `That didn’t go through. Please email ${root.dataset.email} instead.`;
      announce(msg.textContent);
    }
  };
  const go = (dir: 1 | -1) => {
    if (dir === 1 && !filled()) return;
    if (dir === 1 && step === 3) return void send();
    step = Math.min(3, Math.max(1, step + dir));
    render();
    if (step === 2) measure();
    focusStep();
    announce(`Step ${step} of 3: ${TITLES[step]}`);
  };

  document.addEventListener('click', (e) => {
    const t = (e.target as Element).closest<HTMLElement>('[data-contact-open]');
    if (!t) return;
    e.preventDefault();
    open(t);
  });
  root.querySelector('[data-contact-close]')!.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (root.hidden || !root.classList.contains('is-open') && e.key !== 'Escape') return;
    if (e.key === 'Escape') return close();
    if (e.key === 'Tab') {
      const f = focusables();
      if (!f.length) return e.preventDefault();
      const i = f.indexOf(document.activeElement as HTMLElement);
      const j = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : i === f.length - 1 || i < 0 ? 0 : i + 1;
      e.preventDefault();
      f[j].focus();
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && step >= 2 && step <= 3) {
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
  for (const ev of ['input', 'compositionend', 'cut', 'paste']) text.addEventListener(ev, () => requestAnimationFrame(measure));
  text.addEventListener('input', measure);
  addEventListener('resize', () => step === 2 && measure());
  form.addEventListener('submit', (e) => e.preventDefault());
  render();
}
