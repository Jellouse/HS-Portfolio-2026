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
  max: 48,
  ease: 0.035,
  idleAmp: 14,
  idleSpeed: 0.00028,
};

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
