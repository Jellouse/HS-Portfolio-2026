// Interactive row of faces (Tilt mode from /lab/faces, fixed settings).
// Faces always touch and fill the row; each frame is a pure function of the input position.
import { readInput, startInput, tiltWaiting } from './input';

const S = {
  stretch: 3.45,
  height: 2.5,
  minW: 0.1,
  maxW: 8,
  minH: 0.1,
  maxH: 4,
  independence: 0.76,
  randomness: 0.5,
  speed: 0.2,
  softness: 1,
};
const COUNT = 5;
const REST = 25; // rest face height, % of the red box, so 4x fills it
const FACE = `<g><path d="M60.9844 0C94.665 2.50437e-05 121.969 40.5453 121.969 90.5605C121.969 134.795 100.612 171.621 72.375 179.543V179.323C96.0654 171.722 113.794 140.903 113.794 104.04C113.794 61.4697 90.1516 26.9594 60.9873 26.959C31.8228 26.959 8.17983 61.4695 8.17969 104.04C8.17969 140.901 25.9058 171.717 49.5938 179.321V179.543C21.3571 171.621 6.24157e-07 134.795 0 90.5605C9.09239e-05 40.5453 27.3037 4.56074e-06 60.9844 0Z"/><ellipse cx="34.0536" cy="106.354" rx="18.2489" ry="41.324"/><ellipse cx="87.9208" cy="106.354" rx="18.2489" ry="41.324"/><ellipse cx="61.2954" cy="165.106" rx="15.2954" ry="6.91183"/></g>`;

const rnd = (i: number, k: number) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
const noise = (s: number, t: number) => Math.sin(t * 1.3 + s) * 0.6 + Math.sin(t * 2.7 + s * 1.7) * 0.4;

// soft clamp in log space; k = 0 is a hard clamp, larger k eases in earlier
const sp = (z: number, k: number) => (k <= 1e-4 ? Math.max(0, z) : z / k > 30 ? z : k * Math.log1p(Math.exp(z / k)));
function soft(x: number, lo: number, hi: number, k: number) {
  const a = Math.log(lo);
  const b = Math.log(Math.max(lo, hi));
  const r = b - sp(b - (a + sp(Math.log(x) - a, k)), k);
  return Math.exp(Math.max(a, Math.min(b, r)));
}

const faces = Array.from({ length: COUNT }, (_, i) => ({
  i,
  seed: rnd(i, 5) * 100,
  ph: rnd(i, 1) * 2 - 1,
  gain: 0.3 + rnd(i, 2) * 1.7,
  dir: rnd(i, 3) * 2 - 1,
  hdir: rnd(i, 4) * 2 - 1,
}));

/** Widths (multiples of base width, summing to COUNT) and heights for one frame. */
export function layout(u0: number, v0: number, t: number) {
  const I = S.independence;
  const raw = faces.map((f) => {
    const j = S.randomness * noise(f.seed, t);
    const u = u0 + I * f.ph * 0.35;
    const v = v0 + I * f.ph * 0.25;
    const x = f.i / (COUNT - 1) - 0.5;
    const g = 1 + I * (f.gain - 1);
    const lw = S.stretch * x * (u - 0.5) * 4 * g * (1 - I + I * f.dir);
    const h = S.height * x * (v - 0.5) * 4 * g * (1 - I + I * f.hdir);
    return { w: Math.exp(lw + j * 0.5), h: soft(Math.exp(h + j * 0.2), S.minH, S.maxH, S.softness) };
  });
  // one scale factor so the soft-clamped widths fill the row exactly
  let lo = -12;
  let hi = 12;
  let ws: number[] = [];
  const total = (ls: number) => {
    ws = raw.map((r) => soft(r.w * Math.exp(ls), S.minW, S.maxW, S.softness));
    return ws.reduce((a, b) => a + b, 0);
  };
  for (let n = 0; n < 40; n++) {
    const m = (lo + hi) / 2;
    if (total(m) < COUNT) lo = m;
    else hi = m;
  }
  total((lo + hi) / 2);
  return raw.map((r, k) => ({ w: ws[k], h: r.h }));
}

export function mountFaces(host: HTMLElement) {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const row = document.createElement('div');
  row.className = 'peeps-row';
  row.setAttribute('aria-hidden', 'true');
  const els = faces.map(() => {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 122 180');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.innerHTML = FACE;
    row.appendChild(svg);
    return svg;
  });
  host.appendChild(row);
  host.classList.add('is-live');
  row.style.setProperty('--rest', `${REST}%`);
  startInput();

  // Sub-pixel transforms only: no layout widths, no rounding. Faces are laid edge to edge
  // from the left, each scaled from its left-middle point, so the row stays filled and centred.
  let rowW = row.clientWidth;
  new ResizeObserver(() => {
    rowW = row.clientWidth;
    els.forEach((el) => (el.style.width = `${rowW / COUNT}px`));
  }).observe(row);
  els.forEach((el) => (el.style.width = `${rowW / COUNT}px`));
  const last: string[] = [];

  const paint = (u: number, v: number, t: number) => {
    const base = rowW / COUNT;
    let x = 0;
    layout(u, v, t).forEach((f, k) => {
      const tf = `translate3d(${x}px,0,0) scale(${f.w},${f.h})`;
      x += f.w * base;
      if (tf !== last[k]) {
        els[k].style.transform = tf;
        last[k] = tf;
      }
    });
  };

  paint(0.5, 0.5, 0);
  const frame = (now: number) => {
    // reduced motion, or iOS before tilt permission: hold the rest layout
    if (!reduce.matches && !tiltWaiting()) {
      const t = (now / 1000) * S.speed;
      const p = readInput(now) ?? {
        u: 0.5 + 0.48 * Math.sin(t * 0.5) * Math.cos(t * 0.17),
        v: 0.5 + 0.4 * Math.sin(t * 0.37 + 1),
      };
      paint(p.u, p.v, t);
    }
    requestAnimationFrame(frame);
  };
  reduce.addEventListener('change', () => paint(0.5, 0.5, 0));
  requestAnimationFrame(frame);
}
