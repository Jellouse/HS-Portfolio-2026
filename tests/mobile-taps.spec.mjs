
import { webkit, chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const iphone = devices['iPhone 13'];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml',
};

function staticRoot() {
  const candidates = [
    join(ROOT, '.vercel', 'output', 'static'),
    join(ROOT, 'dist', 'client'),
    join(ROOT, 'dist'),
  ];
  for (const dir of candidates) {
    if (existsSync(join(dir, 'index.html'))) return dir;
  }
  return null;
}

async function ensureServer() {
  if (BASE) return { url: BASE, stop: async () => {} };
  const root = staticRoot();
  if (!root) {
    console.error('No built static files and no BASE_URL. Run npm run build first, or set BASE_URL.');
    process.exit(1);
  }
  const server = createServer((req, res) => {
    let path = decodeURIComponent((req.url || '/').split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    const tryFiles = [
      join(root, path),
      join(root, path + '.html'),
      join(root, path, 'index.html'),
      join(root, path.replace(/\/$/, '') + '/index.html'),
    ];
    const file = tryFiles.find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
    if (!file) {
      res.writeHead(404);
      res.end('not found');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((resolve) => server.listen(4326, '127.0.0.1', resolve));
  console.log('serving', root, 'on http://127.0.0.1:4326');
  return {
    url: 'http://127.0.0.1:4326',
    stop: async () =>
      new Promise((resolve) => server.close(() => resolve())),
  };
}

const { url, stop } = await ensureServer();
const browser = await chromium.launch();
let failed = false;
const check = (ok, msg) => {
  console.log(`  ${msg}: ${ok ? 'OK' : 'FAIL'}`);
  if (!ok) failed = true;
};
try {
  const context = await browser.newContext({ ...iphone, defaultBrowserType: undefined, hasTouch: true, isMobile: true });
  await context.addInitScript(() => {
    delete Navigator.prototype.vibrate;
  });
  const page = await context.newPage();
  await page.goto(url + '/', { waitUntil: 'load' });
  await wait(1500);
  check((await page.locator('[data-haptic-overlay]').count()) > 0, 'iOS haptic overlays active');
  await page.tap('.site-menu [data-contact-open]');
  await wait(700);
  check(await page.evaluate(() => document.querySelector('.contact-panel')?.dataset.state === 'open'), 'tap Contact opens the contact sheet');
  const hits = await page.evaluate(() =>
    [...document.querySelectorAll('.contact-options button')].map((a) => {
      const r = a.getBoundingClientRect();
      return a.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }),
  );
  check(hits.length === 3 && hits.every(Boolean), `service options are the tap target (${hits.length})`);
  await page.touchscreen.tap(195, 120);
  await page.waitForFunction(() => !document.querySelector('.contact-panel'), null, { timeout: 5000 }).catch(() => {});
  check(await page.evaluate(() => !document.querySelector('.contact-panel')), 'tap outside closes the sheet');
  const nav = page.waitForURL((u) => u.pathname.startsWith('/work/'), { timeout: 5000 }).then(() => true, () => false);
  await page.locator('.card a[href^="/work/"]').first().tap();
  check(await nav, 'tap a project card opens the case');
} finally {
  await browser.close();
  await stop();
}
if (failed) {
  console.error('mobile-taps FAIL');
  process.exit(1);
}
console.log('mobile-taps OK');
