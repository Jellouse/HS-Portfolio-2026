// Spinning mark, ported from the worksurface.co logo (Jellouse/industrial-bloom website/index.html).
// Load: constant spin (1 turn / 4800ms, linear) until fonts + window load (min 650ms, fallback
// 4000ms), then settle to the next quarter turn over 900ms. Scroll: +0.18deg per px, snapping to
// the nearest 90deg 260ms after scrolling stops. Hover: +90deg. Reduced motion skips the load spin.
// The Industrial Bloom ring is 4-fold symmetric, so the 90deg rest looks the same as 0deg.

const SPIN_MS = 4800;
const REST = 90;
const SNAP_MS = 650;
const SETTLE_MS = 900;
const SETTLE_EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)';
const DEG_PER_PX = 0.18;
const SNAP_DELAY = 260;
const MIN_LOAD = 650;
const MAX_LOAD = 4000;

export function initSpinMark(el: HTMLElement): () => void {
  const started = performance.now();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const loading = !reduced;
  let rotation = REST;
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

  const animateTo = (target: number) => {
    cancelAnimationFrame(snapFrame);
    const from = rotation;
    const t0 = performance.now();
    const frame = (now: number) => {
      const p = Math.min(1, (now - t0) / SNAP_MS);
      rotation = from + (target - from) * (1 - Math.pow(1 - p, 3));
      render();
      if (p < 1) snapFrame = requestAnimationFrame(frame);
    };
    snapFrame = requestAnimationFrame(frame);
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
        render();
      }, SETTLE_MS),
    );
  };

  // Load spin
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
  }

  // Scroll and hover act on the resting mark; during the load spin they wait for the settle.
  const onScroll = () => {
    const delta = scrollY - lastY;
    lastY = scrollY;
    if (spin || settle) return;
    cancelAnimationFrame(snapFrame);
    rotation += delta * DEG_PER_PX;
    render();
    clearTimeout(snapTimer);
    snapTimer = window.setTimeout(() => animateTo(Math.round(rotation / 90) * 90), SNAP_DELAY);
  };
  const onEnter = () => {
    if (spin || settle) return;
    animateTo(rotation + 90);
  };
  addEventListener('scroll', onScroll, { passive: true });
  el.addEventListener('mouseenter', onEnter);

  const stop = () => {
    removeEventListener('scroll', onScroll);
    el.removeEventListener('mouseenter', onEnter);
    removeEventListener('pagehide', stop);
    clearTimeout(snapTimer);
    timers.forEach(clearTimeout);
    cancelAnimationFrame(snapFrame);
    spin?.cancel();
    settle?.cancel();
    spin = settle = undefined;
    rotation = REST;
    render();
  };
  addEventListener('pagehide', stop);
  return stop;
}
