

const SPIN_MS = 4800;
const REST = 90;
const SNAP_MS = 650;
const SETTLE_MS = 900;
const SETTLE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const DEG_PER_PX = 0.18;
const SNAP_DELAY = 260;
const MIN_LOAD = 650;
const MAX_LOAD = 4000;

const HANDOFF_KEY = 'ib-mark-handoff';
const HANDOFF_TTL = 5000;

function takeHandoff(): number | null {
  try {
    const raw = sessionStorage.getItem(HANDOFF_KEY);
    sessionStorage.removeItem(HANDOFF_KEY);
    if (!raw) return null;
    const { angle, at } = JSON.parse(raw);
    return Date.now() - at < HANDOFF_TTL && Number.isFinite(angle) ? angle : null;
  } catch {
    return null;
  }
}

let revealTransition: ViewTransition | null | undefined;
addEventListener('pagereveal', (e) => {
  revealTransition = (e as PageRevealEvent).viewTransition ?? null;
});

export function initSpinMark(el: HTMLElement): () => void {
  const started = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const handoff = takeHandoff();

  const loading = !reduced && handoff === null;
  let rotation = handoff ?? REST;
  let lastY = scrollY;
  let snapTimer = 0;
  let snapFrame = 0;
  let spin: Animation | undefined;
  let settle: Animation | undefined;
  let settled = false;
  const timers: number[] = [];

  const render = () => {
    el.style.transform = `rotate(${rotation}deg)`;
  };

  let quarter = Math.round(rotation / 90);
  let from = rotation;
  let t0 = 0;
  const tick = (now: number) => {
    const p = Math.min(1, (now - t0) / SNAP_MS);
    const to = quarter * 90;
    rotation = p < 1 ? from + (to - from) * (1 - Math.pow(1 - p, 3)) : to;
    render();
    snapFrame = p < 1 ? requestAnimationFrame(tick) : 0;
  };
  const retarget = (q: number) => {
    quarter = q;
    from = rotation;
    t0 = performance.now();
    if (!snapFrame) snapFrame = requestAnimationFrame(tick);
  };

  const finishLoad = () => {
    if (settled) return;
    settled = true;
    if (!spin) return;
    const elapsed = Number(spin.currentTime) || 0;
    const current = ((elapsed % SPIN_MS) / SPIN_MS) * 360;
    const target = current <= REST ? REST : REST + 360;
    spin.cancel();
    spin = undefined;
    settle = el.animate([{ transform: `rotate(${current}deg)` }, { transform: `rotate(${target}deg)` }], {
      duration: SETTLE_MS,
      easing: SETTLE_EASE,
      fill: 'forwards',
    });
    timers.push(
      window.setTimeout(() => {
        settle?.cancel();
        settle = undefined;
        rotation = REST;
        quarter = Math.round(REST / 90);
        render();
      }, SETTLE_MS),
    );
  };

  render();
  if (loading && !reduced && el.animate) {
    rotation = REST;
    spin = el.animate([{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], {
      duration: SPIN_MS,
      iterations: Infinity,
      easing: 'linear',
    });
    const fonts = document.fonts?.ready ?? Promise.resolve();
    const win =
      document.readyState === 'complete'
        ? Promise.resolve()
        : new Promise<void>((r) => addEventListener('load', () => r(), { once: true }));
    Promise.all([fonts, win]).then(() => {
      timers.push(window.setTimeout(finishLoad, Math.max(0, MIN_LOAD - (performance.now() - started))));
    });
    timers.push(window.setTimeout(finishLoad, MAX_LOAD));
  } else {
    settled = true;
    if (handoff !== null && rotation !== quarter * 90) {

      const settleAfter = () => retarget(Math.round(rotation / 90));
      const vt = revealTransition ?? (document as Document & { activeViewTransition?: ViewTransition }).activeViewTransition;
      if (vt) vt.finished.then(settleAfter, settleAfter);
      else requestAnimationFrame(() => setTimeout(settleAfter, 0));
    }
  }

  const onScroll = () => {
    const delta = scrollY - lastY;
    lastY = scrollY;
    if (spin || settle) return;
    cancelAnimationFrame(snapFrame);
    snapFrame = 0;
    rotation += delta * DEG_PER_PX;
    render();
    clearTimeout(snapTimer);
    snapTimer = window.setTimeout(() => retarget(Math.round(rotation / 90)), SNAP_DELAY);
  };
  const onEnter = () => {
    if (spin || settle) return;
    retarget(quarter + 1);
  };
  addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('mouseenter', onEnter);

  const stop = () => {
    removeEventListener('scroll', onScroll);
    el.removeEventListener('mouseenter', onEnter);
    removeEventListener('pagehide', stop);
    removeEventListener('pageswap', onSwap);
    clearTimeout(snapTimer);
    timers.forEach(clearTimeout);
    cancelAnimationFrame(snapFrame);
    snapFrame = 0;
    spin?.cancel();
    settle?.cancel();
    spin = settle = undefined;
    rotation = REST;
    render();
  };

  const onSwap = (e: Event) => {
    const vt = (e as PageSwapEvent).viewTransition;
    if (!vt) return;
    let angle = rotation;
    if (spin) {
      const elapsed = Number(spin.currentTime) || 0;
      angle = ((elapsed % SPIN_MS) / SPIN_MS) * 360;
    } else if (settle) {
      angle = REST;
    }
    clearTimeout(snapTimer);
    cancelAnimationFrame(snapFrame);
    snapFrame = 0;
    spin?.cancel();
    settle?.cancel();
    spin = settle = undefined;
    rotation = angle;
    render();
    try {
      sessionStorage.setItem(HANDOFF_KEY, JSON.stringify({ angle, at: Date.now() }));
    } catch {

    }
  };
  addEventListener('pageswap', onSwap);
  addEventListener('pagehide', stop);
  return stop;
}
