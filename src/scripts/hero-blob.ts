// Shift the Figma-Texture noise field toward the pointer (desktop) or a
// quiet idle loop (touch). Only feOffset on the turbulence moves — the
// SVG silhouette does not translate or scale. No new permission prompts.
// Respects prefers-reduced-motion.

const MAX = 48;
const EASE = 0.035;
const IDLE_AMP = 14;
const IDLE_SPEED = 0.00028;

export function initHeroBlob(root: ParentNode = document) {
  const svg = root.querySelector<SVGElement>('[data-hero-blob]');
  if (!svg) return;
  const offset = svg.querySelector<SVGFEOffsetElement>('feOffset[data-blob-offset]');
  if (!offset) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');

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

    if (!fine.matches || now - lastPointer > 1800) {
      tgtX = Math.sin(now * IDLE_SPEED) * IDLE_AMP;
      tgtY = Math.cos(now * IDLE_SPEED * 0.85) * IDLE_AMP * 0.65;
    }

    curX += (tgtX - curX) * EASE;
    curY += (tgtY - curY) * EASE;
    paint();
    frame = requestAnimationFrame(tick);
  };

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
      tgtX = nx * MAX;
      tgtY = ny * MAX * 0.7;
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
