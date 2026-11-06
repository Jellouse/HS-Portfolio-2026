

import { siteIntroSeen } from '../lib/site-intro';
import { setHeroBlobSourceCut } from './hero-blob-cut';
import { heroIntroScrolling } from './hero-blob-gl';

let blobIntroStarted = false;
const blobIntroWaiters: (() => void)[] = [];

/** Homepage blob grow passed the text gate, or the mark fell back to SVG. */
export function signalHeroBlobIntroStarted() {
  if (blobIntroStarted) return;
  blobIntroStarted = true;
  blobIntroWaiters.splice(0).forEach((done) => done());
}

export function whenHeroBlobIntroReady(): Promise<void> {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const hero = document.querySelector<HTMLElement>('[data-hero-root][data-intro]');
  if (!hero || reduce.matches) return Promise.resolve();
  if (hero.dataset.hero === 'gradient') return Promise.resolve();
  if (new URLSearchParams(location.search).has('dials')) return Promise.resolve();
  if (hero.hasAttribute('data-blob-fallback')) return Promise.resolve();
  if (blobIntroStarted) return Promise.resolve();
  return new Promise((resolve) => blobIntroWaiters.push(resolve));
}

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

/** Coarser fractal noise below 760 so the goo reads at phone scale. */
function tuneBlobTurbulence(svg: SVGSVGElement) {
  if (!matchMedia('(max-width: 759px)').matches) return;
  const turb = svg.querySelector('feTurbulence');
  const disp = svg.querySelector('feDisplacementMap');
  if (turb) turb.setAttribute('baseFrequency', '0.0102');
  if (disp) disp.setAttribute('scale', '122');
}

function easeInOut(t: number) {
  const x1 = 0.77;
  const y1 = 0;
  const x2 = 0.175;
  const y2 = 1;
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  const slopeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  let u = t;
  for (let i = 0; i < 6; i++) {
    const x = sampleX(u) - t;
    const d = slopeX(u);
    if (Math.abs(x) < 1e-4 || Math.abs(d) < 1e-4) break;
    u = Math.min(1, Math.max(0, u - x / d));
  }
  return sampleY(u);
}

/** Thickness of the source, then the existing turbulence. Starts empty. */
function growBlob(canvas: HTMLCanvasElement, draw: () => void) {
  const hidden = 1.05;
  const duration = 4800;
  /** Letter intro starts once the mark grow reaches this fraction. */
  const textAt = 0.4;
  setHeroBlobSourceCut(hidden);
  let origin = 0;
  let textReleased = false;
  const tick = (now: number) => {
    if (canvas.width <= 0) {
      requestAnimationFrame(tick);
      return;
    }
    if (!origin) {
      origin = now;
      setHeroBlobSourceCut(hidden);
      draw();
      canvas.dataset.ready = '';
      requestAnimationFrame(tick);
      return;
    }
    const t = Math.min(1, (now - origin) / duration);
    setHeroBlobSourceCut(t >= 1 ? -1 : hidden * (1 - easeInOut(t)));
    draw();
    if (!textReleased && t >= textAt) {
      textReleased = true;
      signalHeroBlobIntroStarted();
    }
    if (t < 1) requestAnimationFrame(tick);
    else if (!textReleased) signalHeroBlobIntroStarted();
  };
  requestAnimationFrame(tick);
}

export function initHeroBlob(root: ParentNode = document) {
  const svg = root.querySelector<SVGSVGElement>('[data-hero-blob], [data-mark-face]');
  if (!svg) return;
  tuneBlobTurbulence(svg);
  const offset = svg.querySelector<SVGFEOffsetElement>('feOffset[data-blob-offset]');
  if (!offset) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');

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

  let gl: { draw: () => void } | null = null;
  const paint = () => {
    if (gl) return gl.draw();
    offset.setAttribute('dx', curX.toFixed(2));
    offset.setAttribute('dy', curY.toFixed(2));
  };
  const intro = svg.hasAttribute('data-hero-blob') && !new URLSearchParams(location.search).has('dials');
  if (svg.hasAttribute('data-hero-blob') && !reduce.matches) void import('./hero-blob-gl');
  if (intro && !reduce.matches) setHeroBlobSourceCut(1.05);
  if (svg.hasAttribute('data-hero-blob') && !reduce.matches) {
    import('./hero-blob-gl')
      .then(({ mountHeroBlobGL }) => mountHeroBlobGL(svg, { offset: () => ({ x: curX, y: curY }) }))
      .then((g) => {
        if (!g) {
          svg.closest('[data-hero-root]')?.setAttribute('data-blob-fallback', '');
          signalHeroBlobIntroStarted();
          return;
        }
        gl = g;
        svg.style.visibility = 'hidden';
        svg.style.opacity = '0';
        svg.style.viewTransitionName = '';
        if (intro && siteIntroSeen()) {
          setHeroBlobSourceCut(-1);
          g.draw();
          g.canvas.dataset.ready = '';
          signalHeroBlobIntroStarted();
        } else if (intro) growBlob(g.canvas, g.draw);
        else {
          g.draw();
          g.canvas.dataset.ready = '';
          signalHeroBlobIntroStarted();
        }
      })
      .catch(() => {
        svg.closest('[data-hero-root]')?.setAttribute('data-blob-fallback', '');
        signalHeroBlobIntroStarted();
      });
  }

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
    if (!heroIntroScrolling()) paint();
    frame = onScreen && !document.hidden ? requestAnimationFrame(tick) : 0;
  };
  let onScreen = true;
  new IntersectionObserver(([e]) => {
    onScreen = e.isIntersecting;
    if (onScreen) wake();
  }).observe(svg.parentElement || svg);
  document.addEventListener('visibilitychange', () => wake());

  const wake = () => {
    if (!frame) frame = requestAnimationFrame(tick);
  };

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

const LOOP_MS = 22000;
const loopOffset = (now: number) => {
  const a = (now / LOOP_MS) * Math.PI * 2;
  return { x: Math.sin(a) * heroBlobDrift.idleAmp, y: Math.cos(a) * heroBlobDrift.idleAmp * 0.65 };
};

async function initTouchLoop(svg: SVGSVGElement) {
  const { mountHeroBlobGL } = await import('./hero-blob-gl');
  if (svg.hasAttribute('data-hero-blob')) setHeroBlobSourceCut(1.05);
  let gl: Awaited<ReturnType<typeof mountHeroBlobGL>> = null;
  let now = performance.now();
  try {
    gl = await mountHeroBlobGL(svg, { offset: () => loopOffset(now) });
  } catch {
    gl = null;
  }
  if (!gl) {
    svg.closest('[data-hero-root]')?.setAttribute('data-blob-fallback', '');
    signalHeroBlobIntroStarted();
    return;
  }
  const { canvas, draw } = gl;
  svg.style.visibility = 'hidden';
  svg.style.opacity = '0';
  svg.style.viewTransitionName = '';
  if (svg.hasAttribute('data-hero-blob')) {
    if (siteIntroSeen()) {
      setHeroBlobSourceCut(-1);
      draw();
      canvas.dataset.ready = '';
      signalHeroBlobIntroStarted();
    } else {
      setHeroBlobSourceCut(1.05);
      growBlob(canvas, draw);
    }
  } else {
    draw();
    canvas.dataset.ready = '';
  }

  let visible = true;
  let frame = 0;

  const tick = (t: number) => {
    now = t;
    if (!heroIntroScrolling()) draw();
    frame = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
  };
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    wake();
  }).observe(canvas);
  document.addEventListener('visibilitychange', wake);
  wake();
}
