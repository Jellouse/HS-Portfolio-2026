// Light haptic tick on real taps of links and buttons, touch devices only.
//
// iOS only buzzes for a trusted activation of <input type=checkbox switch>.
// A switch under the finger eats vertical pans (WebKit 321591); touch-action
// does not help. So the switch stays visibility:hidden inside a <label> that
// covers the host: pans hit the label (scroll-transparent), taps forward to
// the switch for the tick. Media and captions sit above the label so
// press-and-hold save and caption hits stay native.
//
// Android uses navigator.vibrate on the host's own click.

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
  // Label is scroll-transparent on iOS; never put the switch under the finger.
  label.style.cssText =
    'position:absolute;inset:0;z-index:0;margin:0;padding:0;border:0;cursor:inherit;touch-action:manipulation;-webkit-tap-highlight-color:transparent;';

  const sw = document.createElement('input');
  sw.type = 'checkbox';
  sw.setAttribute('switch', '');
  sw.tabIndex = -1;
  // visibility:hidden keeps it out of hit-testing (WebKit 321591).
  sw.style.cssText = 'position:absolute;width:1px;height:1px;margin:0;padding:0;border:0;visibility:hidden;';
  // Label re-dispatches to the switch; stop that copy bubbling back into host handlers.
  sw.addEventListener('click', (e) => e.stopPropagation());

  label.appendChild(sw);

  // Gap taps land on the label (media/caption are stacked above). Replay a real host click
  // only for a genuine tap so a scroll that ends on the label does not navigate.
  let replaying = false;
  label.addEventListener('click', (e) => {
    // The label sits inside the host, so its own click would bubble to the host's handlers
    // and the replay below would run them a second time (a toggle button opened and closed
    // again: the menu and the name/time on phones did nothing). Only the replay may reach them.
    e.stopPropagation();
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

  // Taps on media/caption (above the label) never hit the label. Trigger the switch
  // during that user gesture so the tick still fires, without putting it under the finger.
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

  // One host per project card so a tap in the image–caption gap ticks once and opens
  // the project. Skipped where the card is display:contents (no box of its own).
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
