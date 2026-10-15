// Desktop only: the small header mark stretches when the cursor is near it (not on it),
// and follows with a time-based lerp, so it never jumps.
const MAX = 0.15; // max stretch along one axis
const ZONE = 120; // px around the mark where it reacts
const TAU = 90; // follow time constant in ms

export function initMarkHover() {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll<SVGElement>('.project-mark .mark').forEach((mark) => {
    const box = (mark.parentElement ?? mark) as Element;
    let tx = 1;
    let ty = 1;
    let x = 1;
    let y = 1;
    let raf = 0;
    let last = 0;

    const step = (now: number) => {
      const a = 1 - Math.exp(-(now - last) / TAU);
      last = now;
      x += (tx - x) * a;
      y += (ty - y) * a;
      const done = Math.abs(tx - x) < 1e-4 && Math.abs(ty - y) < 1e-4;
      if (done) {
        x = tx;
        y = ty;
      }
      mark.style.setProperty('--hover-x', String(x));
      mark.style.setProperty('--hover-y', String(y));
      raf = done ? 0 : requestAnimationFrame(step);
    };
    const wake = () => {
      if (raf) return;
      last = performance.now();
      raf = requestAnimationFrame(step);
    };

    // Proximity zone around the mark: zero on and inside the mark, zero at the zone's
    // outer edge, peaking smoothly in between. Direction comes from the mark's centre.
    window.addEventListener('pointermove', (e) => {
      if (!fine.matches || reduce.matches || e.pointerType !== 'mouse') return;
      const r = box.getBoundingClientRect(); // untransformed parent, so the stretch doesn't feed back
      const ox = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const oy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      const t = Math.min(1, Math.hypot(ox, oy) / ZONE);
      const k = 16 * t * t * (1 - t) * (1 - t); // 0 at 0 and 1, 1 at 0.5
      const nx = e.clientX - (r.left + r.width / 2);
      const ny = e.clientY - (r.top + r.height / 2);
      const len = Math.hypot(nx, ny) || 1;
      const s = MAX * k * (Math.abs(nx) - Math.abs(ny)) / len;
      tx = 1 + s;
      ty = 1 / (1 + s);
      wake();
    });
    document.documentElement.addEventListener('pointerleave', () => {
      tx = 1;
      ty = 1;
      wake();
    });
  });
}
