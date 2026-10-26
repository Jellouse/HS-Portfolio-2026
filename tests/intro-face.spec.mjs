/**
 * Homepage intro: face scale falls monotonically with scroll, the gap between face bottom and
 * name top stays constant (±1px) until release, then the face moves 1:1 with the page.
 * Smoothing (scale chases the scroll target) is allowed; every assertion is on the settled state.
 * SHOTS=dir also saves screenshots at 0/25/50/75/100% of the intro.
 *
 *   npm run build && npm run test:intro
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
if (!root) { console.error('Run npm run build first.'); process.exit(1); }
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4333, '127.0.0.1', r));
const SHOTS = process.env.SHOTS;
const browser = await chromium.launch();
const failures = [];

for (const [name, vp, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['mobile', { width: 390, height: 844 }, true]]) {
  const page = await browser.newPage({ viewport: vp, isMobile: mobile, hasTouch: mobile });
  await page.goto('http://127.0.0.1:4333/', { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const R = Number(await page.getAttribute('[data-hero-root]', 'data-intro-r'));
  const measure = () => page.evaluate(() => {
    const host = document.querySelector('[data-hero-variant="blob"]');
    const f = document.querySelector('[data-hero-blob]').getBoundingClientRect();
    const n = document.querySelector('.site-header').getBoundingClientRect();
    return { s: new DOMMatrix(getComputedStyle(host).transform).a, bottom: f.bottom, top: f.top, name: n.top };
  });
  let prev = null;
  let gap0 = null;
  for (let y = 0; y <= R + 200; y += 10) {
    await page.evaluate((y) => window.scrollTo(0, y), y);
    await page.waitForTimeout(40);
    await page.waitForSelector('[data-intro-settled]', { state: 'attached' });
    const m = await measure();
    const gap = m.name - m.bottom;
    if (gap0 === null) gap0 = gap;
    if (prev && m.s > prev.s + 1e-9) failures.push(`${name} y=${y}: scale rose ${prev.s} -> ${m.s}`);
    if (y <= R && Math.abs(gap - gap0) > 1) failures.push(`${name} y=${y}: gap ${gap} vs ${gap0}`);
    if (y > R && prev && prev.y >= R && Math.abs((prev.top - m.top) - 10) > 1) failures.push(`${name} y=${y}: face moved ${prev.top - m.top}px for 10px scroll`);
    prev = { ...m, y };
  }
  if (gap0 === null || !(gap0 > 0)) failures.push(`${name}: bad gap ${gap0}`);
  if (SHOTS) {
    for (const p of [0, 25, 50, 75, 100]) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round((R * p) / 100));
      await page.waitForTimeout(150);
      await page.waitForSelector('[data-intro-settled]', { state: 'attached' });
      await page.screenshot({ path: `${SHOTS}/${name}-${p}.png` });
    }
  }
  await page.close();
}
await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('intro-face: ok');
