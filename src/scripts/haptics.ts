// Light haptic tick on real taps of links and buttons, touch devices only.
// iOS 26.5+ only buzzes when a real tap lands on an <input type=checkbox switch>,
// so each host gets an invisible switch on top. The switch's click is only
// replayed on the host after a genuine tap: under 10px of movement, under
// 500ms, no scroll in between, not cancelled. Anything else is swallowed.
// Android uses navigator.vibrate on the host's own (native) click.

const TARGETS = 'a[href], button, summary, [role="button"]';
const MOVE_PX = 10;
const MAX_MS = 500;

const isIOS =
  typeof navigator.vibrate !== 'function' &&
  (/iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));

// One shared record of the current touch, fed by capture listeners.
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
  touch = null; // one tap, one replay
  return ok;
}

// The native switch is a draggable control: a drag that starts on it can be taken as a
// thumb swipe instead of a page scroll. touch-action hands every pan back to the browser,
// so scrolls always win and only clean taps reach the switch.
function attachIOS(host: HTMLElement) {
  if (host.querySelector(':scope > [data-haptic-overlay]')) return;
  if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
  const sw = document.createElement('input');
  sw.type = 'checkbox';
  sw.setAttribute('switch', '');
  sw.setAttribute('data-haptic-overlay', '');
  sw.setAttribute('aria-hidden', 'true');
  sw.tabIndex = -1;
  sw.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;margin:0;padding:0;border:0;-webkit-appearance:switch;appearance:auto;opacity:0;z-index:0;cursor:inherit;touch-action:pan-x pan-y pinch-zoom;-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;';
  sw.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!genuineTap()) {
      e.preventDefault(); // no toggle, no navigation
      return;
    }
    host.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
  host.appendChild(sw);
}

function attachAndroid(host: HTMLElement) {
  if (host.dataset.hapticOn) return;
  host.dataset.hapticOn = '';
  host.addEventListener('click', () => navigator.vibrate(15));
}

if (window.matchMedia('(pointer: coarse)').matches && (isIOS || typeof navigator.vibrate === 'function')) {
  const attach = isIOS ? attachIOS : attachAndroid;

  // Project cards have two links (cover and caption). Make the whole card one
  // host so a tap anywhere ticks once, then follow the cover link. Skipped
  // where the card is display: contents (wide grid), since it has no box.
  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    const link = card.querySelector<HTMLAnchorElement>('a[href]');
    if (!link || getComputedStyle(card).display === 'contents') return;
    card.setAttribute('data-haptic', '');
    card.querySelectorAll('a[href]').forEach((a) => a.setAttribute('data-no-haptic', ''));
    card.addEventListener('click', (e) => {
      if (e.target === card) link.click();
    });
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
