// Scroll-linked "drum" motion for project photos, after s.engineering.
// Each photo frame sits on the outside of a big horizontal cylinder: flat and full size at the
// viewport centre, tilting back (rotateX), sinking (translateZ) and sliding outward as it nears
// the top or bottom edge, fading out right at the edge. Pure function of scroll position, so it
// plays identically in both directions, never queues, never pops. Layout is cached; per frame we
// only write transform + opacity on .frame (the .fade-in parent keeps its own opacity).

const SELECTOR = '.project .image-block > .frame, .project .pair > .frame';

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

type Item = { el: HTMLElement; top: number; h: number };

export function initProjectDrum() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const mobile = matchMedia('(max-width: 720px)');
  let items: Item[] = [];
  let vh = document.documentElement.clientHeight;
  let frame = 0;
  let dirty = true;

  const measure = () => {
    vh = document.documentElement.clientHeight;
    items = Array.from(document.querySelectorAll<HTMLElement>(SELECTOR)).map((el) => {
      const prev = el.style.transform;
      el.style.transform = 'none';
      const r = el.getBoundingClientRect();
      el.style.transform = prev;
      return { el, top: r.top + scrollY, h: r.height };
    });
    dirty = false;
  };

  const clear = () =>
    items.forEach(({ el }) => {
      el.style.removeProperty('transform');
      el.style.removeProperty('opacity');
      el.classList.remove('is-drum');
    });

  const render = () => {
    frame = 0;
    if (dirty) measure();
    if (reduced.matches) return clear();
    const small = mobile.matches;
    const maxDeg = small ? 14 : 28;
    const radius = Math.max(760, Math.round(vh * 0.95));
    const slideMax = small ? 0 : Math.min(160, Math.round(vh * 0.16));
    const centre = scrollY + vh / 2;
    for (const it of items) {
      const reach = vh / 2 + it.h / 2;
      const u = (it.top + it.h / 2 - centre) / reach; // -1 top edge .. 0 centre .. 1 bottom edge
      if (Math.abs(u) > 1.05) {
        if (it.el.classList.contains('is-drum')) {
          it.el.style.opacity = '0';
        }
        continue;
      }
      const a = Math.max(-1, Math.min(1, u));
      const deg = -a * maxDeg;
      const rad = (Math.abs(deg) * Math.PI) / 180;
      const z = -Math.round(radius * (1 - Math.cos(rad)));
      const y = Math.round(Math.sign(a) * slideMax * smooth(0.3, 1, Math.abs(a)));
      it.el.classList.add('is-drum');
      it.el.style.transform = `perspective(1800px) translate3d(0, ${y}px, ${z}px) rotateX(${deg.toFixed(2)}deg)`;
      it.el.style.opacity = (1 - smooth(0.62, 1, Math.abs(a))).toFixed(3);
    }
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(render);
  };
  const remeasure = () => {
    dirty = true;
    schedule();
  };

  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', remeasure);
  addEventListener('load', remeasure);
  addEventListener('pageshow', remeasure);
  document.fonts?.ready.then(remeasure);
  reduced.addEventListener?.('change', remeasure);
  mobile.addEventListener?.('change', remeasure);
  if ('ResizeObserver' in window) new ResizeObserver(remeasure).observe(document.body);
  render();
}
