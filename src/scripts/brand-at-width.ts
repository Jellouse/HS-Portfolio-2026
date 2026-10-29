/** Measure @ width in the brand type styles; drives --brand-at-w for the hover slide. */
export function initBrandAtWidth() {
  const stack = document.querySelector<HTMLElement>('.brand-stack');
  const at = document.querySelector<HTMLElement>('.brand-at');
  if (!stack || !at) return;

  const mq = matchMedia('(hover: hover) and (pointer: fine) and (min-width: 760px)');

  const measure = () => {
    if (!mq.matches) {
      stack.style.removeProperty('--brand-at-w');
      return;
    }
    const saved = at.getAttribute('style') ?? '';
    at.setAttribute(
      'style',
      'position:fixed;left:0;top:0;right:auto;visibility:hidden;pointer-events:none;opacity:1;overflow:visible;transform:none;width:auto;max-width:none;',
    );
    const w = at.getBoundingClientRect().width;
    if (saved) at.setAttribute('style', saved);
    else at.removeAttribute('style');
    if (w > 0) stack.style.setProperty('--brand-at-w', `${Math.round(w * 1000) / 1000}px`);
  };

  measure();
  document.fonts?.ready.then(measure);
  mq.addEventListener('change', measure);
  addEventListener('resize', measure, { passive: true });
}
