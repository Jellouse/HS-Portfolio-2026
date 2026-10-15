// Desktop only: the small header mark stretches toward the cursor while hovered.
// The stretch is 0 at the edges of the hover area and rises smoothly toward the centre,
// and the mark follows with a time-based lerp, so entering or leaving never jumps.
const MAX = 0.15; // extra scale at the centre
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
      const ax = len ? Math.abs(nx) / len : 0.5;
      const ay = len ? Math.abs(ny) / len : 0.5;
      tx = 1 + MAX * k * (0.5 + 0.5 * ax);
      ty = 1 + MAX * k * (0.5 + 0.5 * ay);
      wake();
    });
    hit.addEventListener('pointerleave', () => {
      tx = 1;
      ty = 1;
      wake();
    });
  });
}
