/**
 * Header @Humansize hover: cropped screenshots at rest, mid-transition, and settled hover.
 *
 *   npm run build && node scripts/brand-hover-crops.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
};
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) =>
  existsSync(join(d, 'index.html')),
);
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find(
    (f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile(),
  );
  if (!file) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4337, '127.0.0.1', r));

const outDir = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts/screenshots/brand-hover';
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4337/', { waitUntil: 'networkidle' });
await page.waitForFunction(() => {
  const w = document.querySelector('.brand-stack')?.style.getPropertyValue('--brand-at-w');
  return w && parseFloat(w) > 0;
});

const hoverMs = await page.evaluate(() => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-hover').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? (raw.endsWith('ms') ? n : n * 1000) : 160;
});
const midMs = Math.round(hoverMs * 0.4);

const clipHeader = async (path) => {
  const box = await page.locator('.site-header').boundingBox();
  if (!box) throw new Error('no header box');
  await page.screenshot({ path, clip: box });
};

const metrics = () =>
  page.evaluate(() => {
    const stack = document.querySelector('.brand-stack');
    const at = document.querySelector('.brand-at');
    const name = document.querySelector('.brand-name');
    const word = document.querySelector('.brand-word');
    const ar = at?.getBoundingClientRect();
    const nr = name?.getBoundingClientRect();
    const csAt = at ? getComputedStyle(at) : null;
    const csWord = word ? getComputedStyle(word) : null;
    const m = csWord ? new DOMMatrix(csWord.transform).m41 : 0;
    return {
      atW: ar?.width ?? 0,
      tokenW: parseFloat(stack?.style.getPropertyValue('--brand-at-w') || '0'),
      atOpacity: csAt ? parseFloat(csAt.opacity) : 0,
      wordTranslate: m,
      pairGap: ar && nr ? nr.left - ar.right : 0,
    };
  });

await clipHeader(join(outDir, 'header-rest.png'));
const rest = await metrics();

await page.evaluate((p) => {
  const stack = document.querySelector('.brand-stack');
  const wa = parseFloat(stack.style.getPropertyValue('--brand-at-w'));
  const at = document.querySelector('.brand-at');
  const word = document.querySelector('.brand-word');
  at.style.transition = 'none';
  word.style.transition = 'none';
  at.style.opacity = String(p);
  at.style.maxWidth = `${wa * p}px`;
  word.style.transform = `translateX(${wa * (-0.5 + p)}px)`;
}, 0.4);
await clipHeader(join(outDir, 'header-mid-hover.png'));
const mid = await metrics();

await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => {
  const w = document.querySelector('.brand-stack')?.style.getPropertyValue('--brand-at-w');
  return w && parseFloat(w) > 0;
});
await page.hover('.brand-toggle');
await page.waitForTimeout(hoverMs + 40);
await clipHeader(join(outDir, 'header-hover-end.png'));
const end = await metrics();

await browser.close();
server.close();

const failures = [];
if (end.atOpacity < 0.95) failures.push(`hover end @ opacity ${end.atOpacity}`);
if (Math.abs(end.pairGap) > 1) failures.push(`@–H box gap ${end.pairGap}px`);
if (mid.atOpacity < 0.25 || mid.atOpacity > 0.55) failures.push(`mid @ opacity ${mid.atOpacity}`);
const wa = end.tokenW;
if (Math.abs(Math.abs(mid.wordTranslate) - wa * 0.1) > 2)
  failures.push(`mid word translate ${mid.wordTranslate}px (want ~${(wa * 0.1).toFixed(1)}px)`);
if (Math.abs(end.wordTranslate - wa * 0.5) > 2) failures.push(`end word translate ${end.wordTranslate}px`);

console.log(
  JSON.stringify(
    {
      outDir,
      hoverMs,
      midMs,
      rest,
      mid,
      end,
      crops: [
        `${outDir}/header-rest.png`,
        `${outDir}/header-mid-hover.png`,
        `${outDir}/header-hover-end.png`,
      ],
    },
    null,
    2,
  ),
);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('brand-hover-crops: ok');
