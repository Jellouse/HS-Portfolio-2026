// Shift the Figma-Texture noise field toward the pointer (desktop) or a
// quiet idle loop (touch). Only feOffset on the turbulence moves — the
// SVG silhouette does not translate or scale. No new permission prompts.
// Respects prefers-reduced-motion.

export type HeroBlobDrift = {
  max: number;
  ease: number;
  idleAmp: number;
  idleSpeed: number;
};

export const heroBlobDrift: HeroBlobDrift = {
  max: 104,
  ease: 0.04,
  idleAmp: 14,
  idleSpeed: 0.00028,
};

export function initHeroBlob(root: ParentNode = document) {
  const svg = root.querySelector<SVGSVGElement>('[data-hero-blob], [data-mark-face]');
  if (!svg) return;
  const offset = svg.querySelector<SVGFEOffsetElement>('feOffset[data-blob-offset]');
  if (!offset) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');

  // Touch devices: no live SVG filter per frame (that is what stuttered). The SVG stays as the
  // static first paint; the GPU copy takes over and loops on its own. No tilt.
  if (!fine.matches) {
    if (reduce.matches || new URLSearchParams(location.search).has('dials')) return;
    initTouchLoop(svg);
    return;
  }

  let curX = 0;
  let curY = 0;
  let tgtX = 0;
  let tgtY = 0;
  let frame = 0;
  let lastPointer = -Infinity;

  const paint = () => {
    offset.setAttribute('dx', curX.toFixed(2));
    offset.setAttribute('dy', curY.toFixed(2));
  };

  const tick = (now: number) => {
    if (reduce.matches) {
      curX = 0;
      curY = 0;
      paint();
      frame = 0;
      return;
    }

    const { max, ease, idleAmp, idleSpeed } = heroBlobDrift;

    if (!fine.matches || now - lastPointer > 1800) {
      tgtX = Math.sin(now * idleSpeed) * idleAmp;
      tgtY = Math.cos(now * idleSpeed * 0.85) * idleAmp * 0.65;
    }

    curX += (tgtX - curX) * ease;
    curY += (tgtY - curY) * ease;
    paint();
    frame = requestAnimationFrame(tick);
  };

  // Hold the live filter while scrolling: re-filtering the big intro face per frame drops frames.
  let scrolling = 0;
  const wake = () => {
    if (!frame && !scrolling) frame = requestAnimationFrame(tick);
  };
  addEventListener(
    'scroll',
    () => {
      clearTimeout(scrolling);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      scrolling = window.setTimeout(() => {
        scrolling = 0;
        wake();
      }, 200);
    },
    { passive: true },
  );

  if (reduce.matches) {
    paint();
    return;
  }

  window.addEventListener(
    'pointermove',
    (event) => {
      if (event.pointerType === 'touch') return;
      if (!fine.matches) return;
      lastPointer = performance.now();
      const nx = (event.clientX / window.innerWidth) * 2 - 1;
      const ny = (event.clientY / window.innerHeight) * 2 - 1;
      tgtX = nx * heroBlobDrift.max;
      tgtY = ny * heroBlobDrift.max * 0.7;
      wake();
    },
    { passive: true },
  );

  document.documentElement.addEventListener('pointerleave', () => {
    lastPointer = 0;
    wake();
  });

  wake();
}

/** Quiet closed loop for touch devices: an ellipse in noise space, one turn per period. */
const LOOP_MS = 22000;
const loopOffset = (now: number) => {
  const a = (now / LOOP_MS) * Math.PI * 2;
  return { x: Math.sin(a) * heroBlobDrift.idleAmp, y: Math.cos(a) * heroBlobDrift.idleAmp * 0.65 };
};

async function initTouchLoop(svg: SVGSVGElement) {
  const { mountHeroBlobGL } = await import('./hero-blob-gl');
  let gl: Awaited<ReturnType<typeof mountHeroBlobGL>> = null;
  let now = performance.now();
  try {
    gl = await mountHeroBlobGL(svg, { offset: () => loopOffset(now) });
  } catch {
    gl = null;
  }
  if (!gl) return; // SVG stays, static: still no per-frame filter work
  const { canvas, draw } = gl;
  draw();
  svg.style.visibility = 'hidden';
  // the page-to-case morph (view transition hs-mark) follows the visible copy
  svg.style.viewTransitionName = 'none';
  canvas.style.viewTransitionName = 'hs-mark';
  canvas.dataset.ready = '';

  let visible = true;
  let frame = 0;
  // Hold the noise loop while scrolling so the intro scale stays a pure compositor transform.
  let scrolling = 0;
  const tick = (t: number) => {
    now = t;
    draw();
    frame = visible && !document.hidden && !scrolling ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => {
    if (!frame && visible && !document.hidden && !scrolling) frame = requestAnimationFrame(tick);
  };
  addEventListener(
    'scroll',
    () => {
      clearTimeout(scrolling);
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      scrolling = window.setTimeout(() => {
        scrolling = 0;
        wake();
      }, 200);
    },
    { passive: true },
  );
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    wake();
  }).observe(canvas);
  document.addEventListener('visibilitychange', wake);
  wake();
}
