/**
 * /shop ring mark: rapid hovers (including mid-animation) mixed with scrolling must always
 * come to rest on the 90deg grid (within 0.01deg).
 *
 *   npm run build && npm run test:spin
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
await new Promise((r) => server.listen(4332, '127.0.0.1', r));

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4332/shop/', { waitUntil: 'load' });
await wait(1800); // load spin settles
const angle = () => page.evaluate(() => {
  const m = /rotate\(([-\d.e]+)deg\)/.exec(document.querySelector('[data-spin-mark]').style.transform);
  return m ? Number(m[1]) : NaN;
});
const box = await page.locator('[data-spin-mark]').boundingBox();
const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
const failures = [];

const hoverOnce = async (gap) => {
  await page.mouse.move(cx, cy);
  await wait(gap);
  await page.mouse.move(5, 5);
};
const check = async (label) => {
  await wait(1200);
  const a = await angle();
  const off = Math.abs(a / 90 - Math.round(a / 90)) * 90;
  console.log(`${label}: ${a}deg`);
  if (!(off < 0.01)) failures.push(`${label}: rests at ${a}deg, off the 90deg grid`);
};

for (const gap of [20, 60, 120, 200, 330]) await hoverOnce(gap);
await check('6 rapid hovers');

for (let i = 0; i < 6; i++) {
  await hoverOnce(40 + i * 50);
  await page.mouse.wheel(0, i % 2 ? -73 : 121);
  await wait(30 + i * 40);
}
await check('hovers mixed with scroll');

for (let i = 0; i < 5; i++) {
  await page.mouse.wheel(0, 37);
  await wait(300); // the snap starts, then a hover lands mid-snap
  await hoverOnce(50);
}
await check('hovers during snaps');

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('spin mark OK');
