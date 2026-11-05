/** Home ↔ project shared-element transition: SVG on both sides, like shop ib-mark. */

export function handoffHeroMarkToSvg(root: ParentNode = document) {
  const hero = root.querySelector('[data-hero-root]');
  if (!hero || hero.hasAttribute('data-blob-fallback')) return;
  const svg = hero.querySelector<SVGSVGElement>('[data-hero-blob].mark-blob');
  const canvas = hero.querySelector<HTMLCanvasElement>('.mark-blob-gl');
  if (!svg || !canvas) return;
  canvas.style.viewTransitionName = 'none';
  svg.style.visibility = 'visible';
  svg.style.opacity = '1';
  svg.style.viewTransitionName = 'hs-mark';
}

export function restoreHeroMarkCanvas(root: ParentNode = document) {
  const hero = root.querySelector('[data-hero-root]');
  if (!hero || hero.hasAttribute('data-blob-fallback')) return;
  const svg = hero.querySelector<SVGSVGElement>('[data-hero-blob].mark-blob');
  const canvas = hero.querySelector<HTMLCanvasElement>('.mark-blob-gl');
  if (!svg || !canvas) return;
  svg.style.visibility = '';
  svg.style.opacity = '';
  svg.style.viewTransitionName = '';
  canvas.style.viewTransitionName = '';
}

export function initHsMarkTransition() {
  addEventListener('pagereveal', (e) => {
    const vt = (e as PageRevealEvent).viewTransition;
    if (!vt) {
      restoreHeroMarkCanvas();
      return;
    }
    vt.finished.then(
      () => restoreHeroMarkCanvas(),
      () => restoreHeroMarkCanvas(),
    );
  });
}
