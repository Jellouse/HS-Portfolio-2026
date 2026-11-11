// feTurbulence, as the SVG 1.1 / Filter Effects spec defines it (the reference
// code in the spec, which WebKit, Blink and Gecko all follow). Used to build the
// phone intro's noise in JS, so the GPU face never depends on the browser
// rasterising an SVG filter into a canvas.

const BSize = 0x100;
const BM = 0xff;
const PerlinN = 0x1000;
const RAND_m = 2147483647;
const RAND_a = 16807;
const RAND_q = 127773;
const RAND_r = 2836;

export type TurbulenceParams = {
  baseFrequencyX: number;
  baseFrequencyY: number;
  numOctaves: number;
  seed: number;
  fractalNoise: boolean;
};

type Tables = { lattice: Int32Array; gradient: Float64Array[] };

const tableCache = new Map<number, Tables>();

function setupSeed(seed: number) {
  let s = seed;
  if (s <= 0) s = -(s % (RAND_m - 1)) + 1;
  if (s > RAND_m - 1) s = RAND_m - 1;
  return s;
}

function random(seed: number) {
  let result = RAND_a * (seed % RAND_q) - RAND_r * Math.trunc(seed / RAND_q);
  if (result <= 0) result += RAND_m;
  return result;
}

function tables(rawSeed: number): Tables {
  // The spec rounds the seed attribute to the nearest integer.
  const key = Math.round(rawSeed);
  const hit = tableCache.get(key);
  if (hit) return hit;
  let seed = setupSeed(key);
  const lattice = new Int32Array(BSize + BSize + 2);
  const gradient = [0, 1, 2, 3].map(() => new Float64Array((BSize + BSize + 2) * 2));
  let i = 0;
  for (let k = 0; k < 4; k++) {
    for (i = 0; i < BSize; i++) {
      lattice[i] = i;
      for (let j = 0; j < 2; j++) {
        seed = random(seed);
        gradient[k][i * 2 + j] = ((seed % (BSize + BSize)) - BSize) / BSize;
      }
      const gx = gradient[k][i * 2];
      const gy = gradient[k][i * 2 + 1];
      const s = Math.sqrt(gx * gx + gy * gy);
      gradient[k][i * 2] = gx / s;
      gradient[k][i * 2 + 1] = gy / s;
    }
  }
  while (--i) {
    const k = lattice[i];
    seed = random(seed);
    const j = seed % BSize;
    lattice[i] = lattice[j];
    lattice[j] = k;
  }
  for (i = 0; i < BSize + 2; i++) {
    lattice[BSize + i] = lattice[i];
    for (let k = 0; k < 4; k++) {
      gradient[k][(BSize + i) * 2] = gradient[k][i * 2];
      gradient[k][(BSize + i) * 2 + 1] = gradient[k][i * 2 + 1];
    }
  }
  const out = { lattice, gradient };
  tableCache.set(key, out);
  return out;
}

const sCurve = (t: number) => t * t * (3 - 2 * t);

function noise2(t: Tables, channel: number, x: number, y: number) {
  const g = t.gradient[channel];
  const L = t.lattice;
  let tt = x + PerlinN;
  const bx0 = Math.trunc(tt) & BM;
  const bx1 = (bx0 + 1) & BM;
  const rx0 = tt - Math.trunc(tt);
  const rx1 = rx0 - 1;
  tt = y + PerlinN;
  const by0 = Math.trunc(tt) & BM;
  const by1 = (by0 + 1) & BM;
  const ry0 = tt - Math.trunc(tt);
  const ry1 = ry0 - 1;
  const i = L[bx0];
  const j = L[bx1];
  const b00 = L[i + by0] * 2;
  const b10 = L[j + by0] * 2;
  const b01 = L[i + by1] * 2;
  const b11 = L[j + by1] * 2;
  const sx = sCurve(rx0);
  const sy = sCurve(ry0);
  let u = rx0 * g[b00] + ry0 * g[b00 + 1];
  let v = rx1 * g[b10] + ry0 * g[b10 + 1];
  const a = u + sx * (v - u);
  u = rx0 * g[b01] + ry1 * g[b01 + 1];
  v = rx1 * g[b11] + ry1 * g[b11 + 1];
  const b = u + sx * (v - u);
  return a + sy * (b - a);
}

/** One channel (0 R, 1 G, 2 B, 3 A) at a user-space point, as a 0..255 byte. */
export function turbulenceByte(p: TurbulenceParams, channel: number, x: number, y: number) {
  const t = tables(p.seed);
  let sum = 0;
  let ratio = 1;
  let vx = x * p.baseFrequencyX;
  let vy = y * p.baseFrequencyY;
  for (let o = 0; o < p.numOctaves; o++) {
    const n = noise2(t, channel, vx, vy);
    sum += (p.fractalNoise ? n : Math.abs(n)) / ratio;
    vx *= 2;
    vy *= 2;
    ratio *= 2;
  }
  const value = p.fractalNoise ? (sum * 255 + 255) / 2 : sum * 255;
  return Math.max(0, Math.min(255, value));
}

const toByte = (sum: number, fractal: boolean) =>
  Math.max(0, Math.min(255, Math.round(fractal ? (sum * 255 + 255) / 2 : sum * 255)));

/**
 * RGBA bytes over `region` (user units, [x, y, w, h]) at `res` texels per unit,
 * sampled at texel centres. Red and green are the noise's colour channels
 * (unpremultiplied). Blue carries the noise alpha. Alpha is opaque.
 */
export function turbulenceTexture(p: TurbulenceParams, region: number[], res: number) {
  const w = Math.max(1, Math.round(region[2] * res));
  const h = Math.max(1, Math.round(region[3] * res));
  const data = new Uint8Array(w * h * 4);
  const t = tables(p.seed);
  const L = t.lattice;
  // R, G and A. The lattice walk is shared, only the gradients differ.
  const gR = t.gradient[0];
  const gG = t.gradient[1];
  const gA = t.gradient[3];
  const octaves = Math.max(0, Math.floor(p.numOctaves));
  const fractal = p.fractalNoise;
  for (let yi = 0; yi < h; yi++) {
    const y = region[1] + ((yi + 0.5) * region[3]) / h;
    for (let xi = 0; xi < w; xi++) {
      const x = region[0] + ((xi + 0.5) * region[2]) / w;
      let sR = 0;
      let sG = 0;
      let sA = 0;
      let ratio = 1;
      let vx = x * p.baseFrequencyX;
      let vy = y * p.baseFrequencyY;
      for (let o = 0; o < octaves; o++) {
        let tt = vx + PerlinN;
        const bx0 = Math.trunc(tt) & BM;
        const bx1 = (bx0 + 1) & BM;
        const rx0 = tt - Math.trunc(tt);
        const rx1 = rx0 - 1;
        tt = vy + PerlinN;
        const by0 = Math.trunc(tt) & BM;
        const by1 = (by0 + 1) & BM;
        const ry0 = tt - Math.trunc(tt);
        const ry1 = ry0 - 1;
        const i = L[bx0];
        const j = L[bx1];
        const b00 = L[i + by0] * 2;
        const b10 = L[j + by0] * 2;
        const b01 = L[i + by1] * 2;
        const b11 = L[j + by1] * 2;
        const sx = sCurve(rx0);
        const sy = sCurve(ry0);
        // R
        let u = rx0 * gR[b00] + ry0 * gR[b00 + 1];
        let v = rx1 * gR[b10] + ry0 * gR[b10 + 1];
        let a = u + sx * (v - u);
        u = rx0 * gR[b01] + ry1 * gR[b01 + 1];
        v = rx1 * gR[b11] + ry1 * gR[b11 + 1];
        let n = a + sy * (u + sx * (v - u) - a);
        sR += (fractal ? n : Math.abs(n)) / ratio;
        // G
        u = rx0 * gG[b00] + ry0 * gG[b00 + 1];
        v = rx1 * gG[b10] + ry0 * gG[b10 + 1];
        a = u + sx * (v - u);
        u = rx0 * gG[b01] + ry1 * gG[b01 + 1];
        v = rx1 * gG[b11] + ry1 * gG[b11 + 1];
        n = a + sy * (u + sx * (v - u) - a);
        sG += (fractal ? n : Math.abs(n)) / ratio;
        // A
        u = rx0 * gA[b00] + ry0 * gA[b00 + 1];
        v = rx1 * gA[b10] + ry0 * gA[b10 + 1];
        a = u + sx * (v - u);
        u = rx0 * gA[b01] + ry1 * gA[b01 + 1];
        v = rx1 * gA[b11] + ry1 * gA[b11 + 1];
        n = a + sy * (u + sx * (v - u) - a);
        sA += (fractal ? n : Math.abs(n)) / ratio;
        vx *= 2;
        vy *= 2;
        ratio *= 2;
      }
      const k = (yi * w + xi) * 4;
      data[k] = toByte(sR, fractal);
      data[k + 1] = toByte(sG, fractal);
      data[k + 2] = toByte(sA, fractal);
      data[k + 3] = 255;
    }
  }
  return { data, w, h };
}

/** Read feTurbulence attributes the way the spec parses them. */
export function turbulenceParams(el: Element): TurbulenceParams {
  const freq = (el.getAttribute('baseFrequency') || '0').trim().split(/[\s,]+/).map(Number);
  const fx = Number.isFinite(freq[0]) ? Math.max(0, freq[0]) : 0;
  const fy = freq.length > 1 && Number.isFinite(freq[1]) ? Math.max(0, freq[1]) : fx;
  const oct = parseInt(el.getAttribute('numOctaves') || '1', 10);
  const seed = Number(el.getAttribute('seed') || '0');
  return {
    baseFrequencyX: fx,
    baseFrequencyY: fy,
    numOctaves: Number.isFinite(oct) ? Math.max(0, oct) : 1,
    seed: Number.isFinite(seed) ? seed : 0,
    fractalNoise: (el.getAttribute('type') || 'turbulence') === 'fractalNoise',
  };
}
