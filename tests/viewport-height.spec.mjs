
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
await new Promise((r) => server.listen(4336, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.goto('http://127.0.0.1:4336/', { waitUntil: 'load' });
await page.waitForSelector('[data-intro-ready]');
const before = await page.evaluate(() => ({
  nameTop: getComputedStyle(document.documentElement).getPropertyValue('--intro-name-top').trim(),
  r: document.querySelector('[data-hero-root]')?.getAttribute('data-intro-r'),
}));
await page.setViewportSize({ width: 390, height: 700 });
await page.waitForTimeout(400);
const after = await page.evaluate(() => ({
  nameTop: getComputedStyle(document.documentElement).getPropertyValue('--intro-name-top').trim(),
  r: document.querySelector('[data-hero-root]')?.getAttribute('data-intro-r'),
}));

await browser.close();
server.close();
const failures = [];
if (before.nameTop !== after.nameTop) failures.push(`--intro-name-top changed ${before.nameTop} -> ${after.nameTop}`);
if (before.r !== after.r) failures.push(`data-intro-r changed ${before.r} -> ${after.r}`);
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('viewport-height: ok');
