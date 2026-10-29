import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const root = new URL('../.vercel/output/static/', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || '' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4342, '127.0.0.1', r));

let fail = 0;
const check = (ok, msg) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + msg);
  if (!ok) fail = 1;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4342/', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, {
  timeout: 25000,
});
await page.waitForTimeout(400);
check(
  (await page.locator('.brand-name .motion-letter').count()) === 'Humansize'.length,
  'letters live under .brand-name only',
);
check((await page.locator('.brand-at .motion-letter').count()) === 0, '@ span untouched by letter intro');

const hoverMs = await page.evaluate(() => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-hover').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? (raw.endsWith('ms') ? n : n * 1000) : 160;
});
await page.hover('.brand-toggle');
await page.waitForTimeout(hoverMs + 50);

const m = await page.evaluate(() => {
  const at = document.querySelector('.brand-at');
  const name = document.querySelector('.brand-name');
  const shift = document.querySelector('.brand-shift');
  const ar = at?.getBoundingClientRect();
  const nr = name?.getBoundingClientRect();
  const csAt = at ? getComputedStyle(at) : null;
  const csShift = shift ? getComputedStyle(shift) : null;
  const translate = csShift && csShift.transform !== 'none' ? new DOMMatrix(csShift.transform).m41 : 0;
  return {
    atOpacity: csAt ? parseFloat(csAt.opacity) : 0,
    overlap: ar && nr ? ar.right - nr.left : 0,
    translate,
  };
});
check(m.atOpacity > 0.95, `@ visible on hover (opacity ${m.atOpacity})`);
check(m.overlap <= 0.5, `no @/Humansize overlap (${m.overlap.toFixed(2)}px)`);
check(Math.abs(m.translate) < 1.5, `word centered on hover (${m.translate.toFixed(2)}px)`);
check((await page.locator('.intro-tune').count()) === 0, 'no Smoothing debug panel in production capture');

await browser.close();
server.close();
console.log(fail ? 'brand-intro-hover FAIL' : 'brand-intro-hover OK');
process.exit(fail);
