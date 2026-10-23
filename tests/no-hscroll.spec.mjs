/**
 * No sideways scroll on phones: document scrollWidth must equal the viewport width
 * at 375 / 390 / 430 on the homepage and every case page. Lists offending elements.
 *
 *   npm run build && npm run test:hscroll
 *   BASE_URL=https://humansize.de npm run test:hscroll
 */
import { readdirSync } from 'node:fs';
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
  await new Promise((resolve) => server.listen(4327, '127.0.0.1', resolve));
  console.log('serving', root, 'on http://127.0.0.1:4327');
  return {
    url: 'http://127.0.0.1:4327',
    stop: async () =>
      new Promise((resolve) => server.close(() => resolve())),
  };
}


const slugs = readdirSync(join(ROOT, 'src/content/projects'), { withFileTypes: true })
  .filter((d) => d.isDirectory())
  .map((d) => d.name);
const paths = ['/', ...slugs.map((s) => `/work/${s}/`)];
const { url, stop } = await ensureServer();
const browser = await chromium.launch();
let failed = false;
try {
  for (const width of [375, 390, 430]) {
    const context = await browser.newContext({ viewport: { width, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    for (const path of paths) {
      const res = await page.goto(url + path, { waitUntil: 'load' });
      if (!res || res.status() >= 400) continue; // unpublished slug
      await wait(1500); // let the hero blob mount its canvas
      const r = await page.evaluate((W) => {
        // device width, not innerWidth: on mobile the layout viewport grows to fit overflow
        const off = [...document.querySelectorAll('body *')]
          .filter((e) => e.getBoundingClientRect().right > W + 0.5 && getComputedStyle(e).position !== 'fixed')
          .slice(0, 5)
          .map((e) => `${e.tagName.toLowerCase()}.${(e.className && (e.className.baseVal ?? e.className)) || ''}`);
        return { sw: document.documentElement.scrollWidth, W, off };
      }, width);
      const ok = r.sw === r.W;
      if (!ok) failed = true;
      console.log(`  ${width} ${path}: scrollWidth ${r.sw} / ${r.W} ${ok ? 'OK' : 'FAIL ' + r.off.join(', ')}`);
    }
    await context.close();
  }
} finally {
  await browser.close();
  await stop();
}
if (failed) {
  console.error('no-hscroll FAIL');
  process.exit(1);
}
console.log('no-hscroll OK');
