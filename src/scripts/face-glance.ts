
/** Cursor glance for centred marks: L / R / U / D, or centre over the face. */

export type GlanceDir = 'center' | 'left' | 'right' | 'up' | 'down';

const FINE = '(hover: hover) and (pointer: fine)';
const REDUCE = '(prefers-reduced-motion: reduce)';

function dirFor(x: number, y: number, face: DOMRect): GlanceDir {
  const cx = face.left + face.width / 2;
  const cy = face.top + face.height / 2;
  const dx = x - cx;
  const dy = y - cy;
  const rx = face.width / 2;
  const ry = face.height / 2;
  // Circular hit on the mark. Inside = forward stare.
  if (rx > 0 && ry > 0 && (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry) <= 1) {
    return 'center';
  }
  // X diagonals: the four triangular quadrants from the reference.
  if (Math.abs(dx) > Math.abs(dy)) return dx < 0 ? 'left' : 'right';
  return dy < 0 ? 'up' : 'down';
}

export type FaceGlance = {
  setEnabled: (on: boolean) => void;
  destroy: () => void;
};

export function mountFaceGlance(nav: HTMLElement): FaceGlance {
  const svg = nav.querySelector<SVGSVGElement>('.arrow-face-blob[data-mark-face]');
  const faceEl = nav.querySelector<HTMLElement>('[data-nav-face]') || nav.querySelector<HTMLElement>('.arrow-face');
  if (!svg || !faceEl) {
    return { setEnabled: () => {}, destroy: () => {} };
  }

  const fine = matchMedia(FINE);
  const reduce = matchMedia(REDUCE);
  let enabled = false;
  let current: GlanceDir = 'center';
  let faceBox: DOMRect | null = null;
  let ro: ResizeObserver | null = null;

  const paint = (next: GlanceDir) => {
    if (next === current) return;
    current = next;
    if (next === 'center') svg.removeAttribute('data-glance');
    else svg.setAttribute('data-glance', next);
  };

  const measure = () => {
    faceBox = faceEl.getBoundingClientRect();
  };

  const onMove = (event: PointerEvent) => {
    if (!enabled || !fine.matches) return;
    if (event.pointerType && event.pointerType !== 'mouse') return;
    if (!faceBox) measure();
    const box = faceBox;
    if (!box || box.width < 1 || box.height < 1) return;
    paint(dirFor(event.clientX, event.clientY, box));
  };

  const onLeave = () => {
    if (!enabled) return;
    paint('center');
  };

  const syncMotion = () => {
    svg.classList.toggle('is-glance-reduce', reduce.matches);
  };

  const onFine = () => {
    if (!fine.matches) paint('center');
  };

  syncMotion();
  fine.addEventListener('change', onFine);
  reduce.addEventListener('change', syncMotion);
  window.addEventListener('pointermove', onMove, { passive: true });
  document.documentElement.addEventListener('mouseleave', onLeave);
  ro = new ResizeObserver(() => {
    faceBox = null;
  });
  ro.observe(faceEl);

  return {
    setEnabled(on: boolean) {
      enabled = on && fine.matches;
      if (!enabled) paint('center');
      else faceBox = null;
    },
    destroy() {
      enabled = false;
      paint('center');
      fine.removeEventListener('change', onFine);
      reduce.removeEventListener('change', syncMotion);
      window.removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      ro?.disconnect();
      ro = null;
    },
  };
}
