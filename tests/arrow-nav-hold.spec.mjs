// Hold-to-repeat on the arrow gallery: holding left/right speeds up through
// images, and a lost pointer cannot keep firing.
//
// npm run build && npm run test:arrow-hold
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
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
await new Promise((r) => server.listen(4337, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4337/';

const failures = [];
const browser = await chromium.launch();

const openGallery = async () => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto(`${BASE}#space`, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const nav = document.querySelector('[data-arrow-nav]');
    return nav && nav.dataset.kind === 'gallery' && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
  }, null, { timeout: 20000 });
  await page.waitForTimeout(200);
  return page;
};

const slideState = () => ({
  index: [...document.querySelectorAll('.arrow-dot')].findIndex((el) => el.classList.contains('is-on')),
  count: document.querySelectorAll('.arrow-dot').length,
  pressed: document.querySelector('[data-arrow-nav] [data-dir="right"]')?.classList.contains('is-pressed') || false,
});

const arrowPoint = async (page, dir = 'right') => page.evaluate((dir) => {
  const el = document.querySelector(`[data-arrow-nav] [data-dir="${dir}"]:not(.arrow-flight)`);
  if (!el || el.hidden) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
}, dir);

const moveMs = async (page) => page.evaluate(() => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-nav').trim();
  const n = parseFloat(raw);
  if (raw.endsWith('ms')) return Math.round(n);
  if (raw.endsWith('s')) return Math.round(n * 1000);
  return Math.round(n);
});

{
  const page = await openGallery();
  const duration = await moveMs(page);
  const point = await arrowPoint(page);
  if (!point) failures.push('right control is not on screen');
  const start = await page.evaluate(slideState);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForFunction((prev) => {
    const dots = [...document.querySelectorAll('.arrow-dot')];
    return dots.findIndex((el) => el.classList.contains('is-on')) !== prev;
  }, start.index, { timeout: 2000 });
  const times = [performance.now()];
  let last = await page.evaluate(() => [...document.querySelectorAll('.arrow-dot')].findIndex((el) => el.classList.contains('is-on')));
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    await page.waitForTimeout(30);
    const now = await page.evaluate(slideState);
    if (now.index !== last) {
      times.push(performance.now());
      last = now.index;
    }
  }
  const gaps = times.slice(1).map((t, i) => t - times[i]);
  const shown = gaps.map((g) => Math.round(g)).join(', ');
  if (gaps.length < 5) failures.push(`hold did not advance enough to speed up (gaps ${shown})`);
  else {
    const first = gaps[0];
    const later = gaps.slice(-3);
    const laterAvg = later.reduce((a, b) => a + b, 0) / later.length;
    // First repeat is 480ms; later ones ramp toward 80ms.
    if (first < 350 || first > 650) failures.push(`first hold interval ${Math.round(first)}ms, expected about 480ms (gaps ${shown})`);
    if (laterAvg > first * 0.55) failures.push(`hold did not accelerate (first ${Math.round(first)}ms, later ~${Math.round(laterAvg)}ms; gaps ${shown})`);
    if (laterAvg < 40) failures.push(`hold later interval ${Math.round(laterAvg)}ms dropped below the 80ms floor (gaps ${shown})`);
  }
  // A lost pointer (blur, hidden tab, lost capture) must stop the repeat.
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  const frozen = await page.evaluate(slideState);
  await page.waitForTimeout(duration * 2 + 200);
  const after = await page.evaluate(slideState);
  if (after.index !== frozen.index) failures.push(`hold kept firing after visibilitychange (${frozen.index} -> ${after.index})`);
  if (after.pressed) failures.push('right arrow stayed pressed after visibilitychange');
  await page.mouse.up();
  await page.close();
}

{
  const page = await openGallery();
  const duration = await moveMs(page);
  const point = await arrowPoint(page);
  const start = await page.evaluate(slideState);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(duration + 80);
  await page.evaluate(() => {
    const button = document.querySelector('[data-arrow-nav] [data-dir="right"]');
    const id = [0, 1, 2, 3, 4].find((n) => button.hasPointerCapture?.(n)) ?? 1;
    button.dispatchEvent(new PointerEvent('lostpointercapture', { bubbles: true, pointerId: id }));
  });
  const frozen = await page.evaluate(slideState);
  if (frozen.index === start.index) failures.push('hold did not advance before lostpointercapture');
  await page.waitForTimeout(duration * 2 + 200);
  const after = await page.evaluate(slideState);
  if (after.index !== frozen.index) failures.push(`hold kept firing after lostpointercapture (${frozen.index} -> ${after.index})`);
  if (after.pressed) failures.push('right arrow stayed pressed after lostpointercapture');
  await page.mouse.up();
  await page.close();
}

{
  const page = await openGallery();
  const duration = await moveMs(page);
  const point = await arrowPoint(page);
  await page.mouse.move(point.x, point.y);
  await page.mouse.down();
  await page.waitForTimeout(duration + 80);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  const frozen = await page.evaluate(slideState);
  await page.waitForTimeout(duration * 2 + 200);
  const after = await page.evaluate(slideState);
  if (after.index !== frozen.index) failures.push(`hold kept firing after blur (${frozen.index} -> ${after.index})`);
  if (after.pressed) failures.push('right arrow stayed pressed after blur');
  await page.mouse.up();
  await page.close();
}

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('arrow-nav-hold: ok');
