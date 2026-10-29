/** Stable viewport height for intro layout: locked per width so iOS toolbar collapse does not jump the hero. */
export function stableViewportHeight(probe: HTMLElement, vw: number): number {
  const root = document.documentElement;
  const wAttr = 'data-layout-vw';
  const hAttr = 'data-layout-vh';
  if (root.getAttribute(wAttr) !== String(vw)) {
    root.setAttribute(wAttr, String(vw));
    const h = Math.round(Math.max(window.innerHeight, probe.getBoundingClientRect().height));
    root.setAttribute(hAttr, String(h));
    return h;
  }
  const stored = Number(root.getAttribute(hAttr));
  if (stored > 0) return stored;
  return Math.round(probe.getBoundingClientRect().height);
}

export function clearStableViewportHeight() {
  document.documentElement.removeAttribute('data-layout-vw');
  document.documentElement.removeAttribute('data-layout-vh');
}
