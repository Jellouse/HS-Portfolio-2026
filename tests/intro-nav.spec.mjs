/**
 * Homepage intro after in-site navigation: layout must stay correct so scale tracks scroll
 * smoothly (no hang). Mirrors intro-face checks after project mark -> home view transition.
 *
 *   npm run build && node tests/intro-nav.spec.mjs
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
await new Promise((r) => server.listen(4334, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
const failures = [];

await page.goto('http://127.0.0.1:4334/', { waitUntil: 'load' });
await page.waitForSelector('[data-intro-ready]');
await page.goto('http://127.0.0.1:4334/work/atomic-ski/', { waitUntil: 'load' });
await page.waitForTimeout(1200);
await Promise.all([page.waitForURL('**/'), page.click('.project-mark a')]);
await page.waitForTimeout(1200);
await page.waitForSelector('[data-intro-ready]');

const R = Number(await page.getAttribute('[data-hero-root]', 'data-intro-r'));
const measure = () => page.evaluate(() => {
  const host = document.querySelector('[data-hero-variant="blob"]');
  return new DOMMatrix(getComputedStyle(host).transform).a;
});

let prev = null;
for (let y = 0; y <= R; y += Math.max(10, Math.round(R / 20))) {
  await page.evaluate((y) => window.scrollTo(0, y), y);
  await page.waitForTimeout(50);
  await page.waitForSelector('[data-intro-settled]', { state: 'attached' });
  const s = await measure();
  if (prev !== null && s > prev + 1e-9) failures.push(`after nav y=${y}: scale rose ${prev} -> ${s}`);
  prev = s;
}

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('intro-nav: ok');
