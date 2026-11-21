import { chromium, devices } from 'playwright';
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
await new Promise((r) => server.listen(4350, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4350/';

const failures = [];
const browser = await chromium.launch();

const controlBox = (dir) => {
  const el = document.querySelector(`[data-arrow-nav] [data-dir="${dir}"]:not(.arrow-flight)`);
  if (!el || el.hidden) return null;
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  const x = r.left + r.width / 2;
  const y = r.top + r.height / 2;
  const hit = document.elementFromPoint(x, y);
  const onControl = !!(hit && (hit === el || el.contains(hit)));
  return {
    x,
    y,
    onScreen: r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
    onControl,
  };
};

const moveMs = async (page) => page.evaluate(() => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-nav').trim();
  const n = parseFloat(raw);
  if (raw.endsWith('ms')) return Math.round(n);
  if (raw.endsWith('s')) return Math.round(n * 1000);
  return Math.round(n);
});

const clickDir = async (page, dir, touch) => {
  const box = await page.evaluate(controlBox, dir);
  if (!box) throw new Error(`${dir} control is not on screen`);
  if (touch) await page.touchscreen.tap(box.x, box.y);
  else await page.mouse.click(box.x, box.y);
};

const targets = [
  { name: 'desktop', options: { viewport: { width: 1440, height: 900 } }, touch: false },
  { name: 'iphone', options: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }, touch: true },
];

for (const target of targets) {
  const tag = target.name;
  const context = await browser.newContext({ ...target.options, colorScheme: 'light' });
  const page = await context.newPage();
  await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const nav = document.querySelector('[data-arrow-nav]');
    return nav && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
  }, null, { timeout: 20000 });
  const duration = await moveMs(page);
  await clickDir(page, 'right', target.touch);
  await page.waitForFunction(() => document.querySelector('[data-arrow-nav]')?.dataset.screen === 'physical', null, { timeout: 10000 });
  await page.waitForTimeout(duration + 200);
  await clickDir(page, 'right', target.touch);
  await page.waitForFunction(() => document.querySelector('[data-arrow-nav]')?.dataset.kind === 'gallery', null, { timeout: 10000 });
  await page.waitForTimeout(duration + 250);

  const controls = await page.evaluate(() => {
    const dirs = ['left', 'right', 'up'];
    const out = {};
    for (const dir of dirs) {
      const el = document.querySelector(`[data-arrow-nav] [data-dir="${dir}"]:not(.arrow-flight)`);
      if (!el || el.hidden) {
        out[dir] = { present: false };
        continue;
      }
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      const hit = document.elementFromPoint(x, y);
      out[dir] = {
        present: true,
        onScreen: r.width > 0 && r.height > 0 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth,
        onControl: !!(hit && (hit === el || el.contains(hit))),
        x,
        y,
      };
    }
    return out;
  });

  for (const dir of ['left', 'right', 'up']) {
    const box = controls[dir];
    if (!box?.present) failures.push(`${tag}: ${dir} control missing after entering the gallery`);
    else if (!box.onScreen) failures.push(`${tag}: ${dir} control is off screen after entering the gallery`);
    else if (!box.onControl) failures.push(`${tag}: ${dir} control is not clickable after entering the gallery`);
  }

  if (controls.right?.present && controls.right.onScreen && controls.right.onControl) {
    const before = await page.evaluate(() => [...document.querySelectorAll('.arrow-dot')].findIndex((el) => el.classList.contains('is-on')));
    if (target.touch) await page.touchscreen.tap(controls.right.x, controls.right.y);
    else await page.mouse.click(controls.right.x, controls.right.y);
    try {
      await page.waitForFunction((prev) => {
        const dots = [...document.querySelectorAll('.arrow-dot')];
        return dots.findIndex((el) => el.classList.contains('is-on')) !== prev;
      }, before, { timeout: 2000 });
    } catch {
      failures.push(`${tag}: clicking next after entering the gallery did not change the slide`);
    }
  }

  await context.close();
}

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('arrow-nav-gallery-enter: ok');
