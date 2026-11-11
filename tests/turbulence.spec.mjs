// The JS feTurbulence (src/scripts/turbulence.ts) against the browser's own
// feTurbulence, in Chromium and (when it launches) WebKit. Bytes are compared
// with the browser's sampling point (+1 filter px) so only rounding differs.
// Usage: node tests/turbulence.spec.mjs
import { chromium, webkit } from 'playwright';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const bundle = await build({ entryPoints: [`${ROOT}src/scripts/turbulence.ts`], bundle: true, format: 'iife', globalName: 'Turb', write: false });
const code = bundle.outputFiles[0].text;

const check = async () => {
  const region = [-58.5, -58.5, 187, 187];
  const res = 2;
  const nw = Math.round(region[2] * res);
  const nh = Math.round(region[3] * res);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${nw}" height="${nh}" viewBox="${region.join(' ')}"><filter id="n" x="${region[0]}" y="${region[1]}" width="${region[2]}" height="${region[3]}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency="0.015" numOctaves="2" seed="48"/><feColorMatrix type="matrix" values="1 0 0 0 0 0 1 0 0 0 0 0 0 1 0 0 0 0 0 1"/></filter><rect x="${region[0]}" y="${region[1]}" width="${region[2]}" height="${region[3]}" filter="url(#n)"/></svg>`;
  const img = new Image();
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  await new Promise((r, j) => { img.onload = r; img.onerror = j; });
  const c = document.createElement('canvas');
  c.width = nw;
  c.height = nh;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0, nw, nh);
  const ref = x.getImageData(0, 0, nw, nh).data;
  // The browsers evaluate each filter pixel one pixel in, so shift by half a texel.
  const shifted = [region[0] + 0.5 / res, region[1] + 0.5 / res, region[2], region[3]];
  const js = window.Turb.turbulenceTexture({ baseFrequencyX: 0.015, baseFrequencyY: 0.015, numOctaves: 2, seed: 48, fractalNoise: true }, shifted, res);
  return [0, 1, 2].map((ch) => {
    let sum = 0;
    let max = 0;
    for (let i = 0; i < nw * nh; i++) {
      const d = Math.abs(js.data[i * 4 + ch] - ref[i * 4 + ch]);
      sum += d;
      max = Math.max(max, d);
    }
    return { mean: sum / (nw * nh), max };
  });
};

let failed = false;
for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  let browser;
  try {
    browser = await engine.launch();
  } catch {
    console.log(`${name}: skipped (does not launch here)`);
    continue;
  }
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  await page.addScriptTag({ content: code });
  const stats = await page.evaluate(check);
  // Browsers keep the noise premultiplied in 8 bits, so R and G can be a few
  // levels off where the noise alpha is low. The mean stays under a level.
  const ok = stats.every((s) => s.mean < 1 && s.max <= 8);
  console.log(`${name}: ${ok ? 'ok' : 'FAIL'} ${stats.map((s, i) => `${'RGA'[i]} mean ${s.mean.toFixed(2)} max ${s.max}`).join(', ')}`);
  failed ||= !ok;
  await browser.close();
}
process.exit(failed ? 1 : 0);
