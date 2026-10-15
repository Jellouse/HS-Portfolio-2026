// Desktop only: the small header mark stretches toward the cursor while hovered.
// The stretch is 0 at the edges of the hover area and rises smoothly toward the centre,
// and the mark follows with a time-based lerp, so entering or leaving never jumps.
const MAX = 0.15; // max stretch along one axis
const TAU = 90; // follow time constant in ms

export function initMarkHover() {
  const fine = window.matchMedia('(hover: hover) and (pointer: fine)');
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  document.querySelectorAll<SVGElement>('.project-mark .mark').forEach((mark) => {
    const hit = (mark.closest('a') as HTMLElement | null) ?? (mark as unknown as HTMLElement);
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

    hit.addEventListener('pointermove', (e) => {
      if (!fine.matches || reduce.matches || e.pointerType !== 'mouse') return;
      // normalised offset inside the hover area: 0 at the centre, 1 at the edges
      const r = hit.getBoundingClientRect();
      const nx = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
      const ny = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      const len = Math.hypot(nx, ny);
      const d = Math.min(1, len);
      const k = 1 - d * d * (3 - 2 * d); // smoothstep falloff
      // directional only: wider when the cursor is to the side, taller when above or below,
      // area kept constant so there is no overall zoom; fades in away from the exact centre
      const ax = len ? Math.abs(nx) / len : 0;
      const ay = len ? Math.abs(ny) / len : 0;
      const s = MAX * k * (ax - ay) * Math.min(1, len / 0.3);
      tx = 1 + s;
      ty = 1 / (1 + s);
      wake();
    });
    hit.addEventListener('pointerleave', () => {
      tx = 1;
      ty = 1;
      wake();
    });
  });
}
