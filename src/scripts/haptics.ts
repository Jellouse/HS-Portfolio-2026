// iOS tap tick via <label> + visibility:hidden checkbox switch (never under the finger: WebKit 321591).
// Android: navigator.vibrate. Desktop: no-op. Guarded by npm test / tests/touch-scroll-guard.mjs.

const TARGETS = 'a[href], button, summary, [role="button"]';
const MOVE_PX = 10;
const MAX_MS = 500;

const isIOS =
  typeof navigator.vibrate !== 'function' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

let touch: { x: number; y: number; t: number; sy: number; sx: number; bad: boolean } | null = null;
const opts = { capture: true, passive: true } as const;
window.addEventListener(
  'touchstart',
  (e) => {
    const p = e.touches[0];
    touch = { x: p.clientX, y: p.clientY, t: Date.now(), sy: scrollY, sx: scrollX, bad: e.touches.length > 1 };
  },
  opts,
);
window.addEventListener(
  'touchmove',
  (e) => {
    if (!touch) return;
    const p = e.touches[0];
    if (Math.hypot(p.clientX - touch.x, p.clientY - touch.y) > MOVE_PX) touch.bad = true;
  },
  opts,
);
window.addEventListener('touchcancel', () => touch && (touch.bad = true), opts);
window.addEventListener('pointercancel', () => touch && (touch.bad = true), opts);
window.addEventListener('scroll', () => touch && (touch.bad = true), opts);

function genuineTap() {
  if (!touch) return false;
  const ok =
    !touch.bad &&
    Date.now() - touch.t < MAX_MS &&
    Math.abs(scrollY - touch.sy) < 1 &&
    Math.abs(scrollX - touch.sx) < 1;
  touch = null;
  return ok;
}

function attachIOS(host: HTMLElement) {
  if (host.querySelector(':scope > [data-haptic-overlay]')) return;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';

  const label = document.createElement('label');
  label.setAttribute('data-haptic-overlay', '');
  label.setAttribute('aria-hidden', 'true');
  label.style.cssText =
    'position:absolute;inset:0;z-index:0;margin:0;padding:0;border:0;cursor:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';

  const sw = document.createElement('input');
  sw.type = 'checkbox';
  sw.setAttribute('switch', '');
  sw.tabIndex = -1;
  sw.style.cssText = 'position:absolute;width:1px;height:1px;margin:0;padding:0;border:0;visibility:hidden;';
  sw.addEventListener('click', (e) => e.stopPropagation());

  label.appendChild(sw);

  let replaying = false;
  label.addEventListener('click', (e) => {
    if (!genuineTap()) {
      e.preventDefault();
      return;
    }
    const link = host.matches(TARGETS)
      ? host
      : host.querySelector<HTMLElement>(TARGETS);
    if (!link || link === label) return;
    replaying = true;
    link.click();
    replaying = false;
  });

  host.addEventListener(
    'click',
    (e) => {
      if (replaying) return;
      if (e.target === label || label.contains(e.target as Node)) return;
      if (touch?.bad) return;
      try {
        sw.click();
      } catch {
        /* ignore */
      }
    },
    true,
  );

  host.appendChild(label);
}

function attachAndroid(host: HTMLElement) {
  if (host.dataset.hapticOn) return;
  host.dataset.hapticOn = '';
  host.addEventListener('click', () => navigator.vibrate(15));
}

if (window.matchMedia('(pointer: coarse)').matches && (isIOS || typeof navigator.vibrate === 'function')) {
  const attach = isIOS ? attachIOS : attachAndroid;

  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    const link = card.querySelector<HTMLAnchorElement>('a[href]');
    if (!link || getComputedStyle(card).display === 'contents') return;
    card.setAttribute('data-haptic', '');
    card.querySelectorAll('a[href]').forEach((a) => a.setAttribute('data-no-haptic', ''));
  });

  const scan = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => {
      if (!el.hasAttribute('data-no-haptic')) el.setAttribute('data-haptic', '');
    });
    root.querySelectorAll<HTMLElement>('[data-haptic]').forEach(attach);
  };
  scan(document);
  new MutationObserver((list) => {
    for (const m of list)
      m.addedNodes.forEach((n) => {
        if (!(n instanceof HTMLElement) || n.hasAttribute('data-haptic-overlay')) return;
        if (n.matches(TARGETS) && !n.hasAttribute('data-no-haptic')) n.setAttribute('data-haptic', '');
        if (n.matches('[data-haptic]')) attach(n);
        scan(n);
      });
  }).observe(document.body, { childList: true, subtree: true });
}
