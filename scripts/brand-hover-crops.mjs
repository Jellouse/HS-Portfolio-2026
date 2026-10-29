
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
  const at = document.querySelector('.brand-at');
  return !!at && at.getBoundingClientRect().width > 0;
});

const hoverMs = await page.evaluate(() => {
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--dur-hover').trim();
  const n = parseFloat(raw);
  return Number.isFinite(n) ? (raw.endsWith('ms') ? n : n * 1000) : 160;
});

const clipHeader = async (path) => {
  const box = await page.locator('.site-header').boundingBox();
  if (!box) throw new Error('no header box');
  await page.screenshot({ path, clip: box });
};

const metrics = () =>
  page.evaluate(() => {
    const at = document.querySelector('.brand-at');
    const name = document.querySelector('.brand-name');
    const shift = document.querySelector('.brand-shift');
    const ar = at?.getBoundingClientRect();
    const nr = name?.getBoundingClientRect();
    const csAt = at ? getComputedStyle(at) : null;
    const csShift = shift ? getComputedStyle(shift) : null;
    const m = csShift ? new DOMMatrix(csShift.transform).m41 : 0;
    return {
      atW: ar?.width ?? 0,
      tokenW: ar?.width ?? 0,
      atOpacity: csAt ? parseFloat(csAt.opacity) : 0,
      wordTranslate: m,
      pairGap: ar && nr ? nr.left - ar.right : 0,
      overlap: ar && nr ? ar.right - nr.left : 0,
    };
  });

const setProgress = (p) =>
  page.evaluate((progress) => {
    const at = document.querySelector('.brand-at');
    const shift = document.querySelector('.brand-shift');
    const wa = at.getBoundingClientRect().width;
    at.style.transition = 'none';
    shift.style.transition = 'none';
    at.style.opacity = String(progress);
    shift.style.transform = `translateX(${(-wa / 2) * (1 - progress)}px)`;
  }, p);

const snapshots = [];
const crops = [];

await clipHeader(join(outDir, 'header-rest.png'));
snapshots.push({ label: 'rest', p: 0, ...(await metrics()) });
crops.push(`${outDir}/header-rest.png`);

for (const p of [0.2, 0.5, 0.8]) {
  await setProgress(p);
  const file = join(outDir, `header-hover-${Math.round(p * 100)}.png`);
  await clipHeader(file);
  snapshots.push({ label: `${Math.round(p * 100)}%`, p, ...(await metrics()) });
  crops.push(file);
}

await page.reload({ waitUntil: 'networkidle' });
await page.waitForFunction(() => {
  const at = document.querySelector('.brand-at');
  return !!at && at.getBoundingClientRect().width > 0;
});
await page.hover('.brand-toggle');
await page.waitForTimeout(hoverMs + 40);
await clipHeader(join(outDir, 'header-hover-end.png'));
snapshots.push({ label: 'end', p: 1, ...(await metrics()) });
crops.push(`${outDir}/header-hover-end.png`);

await browser.close();
server.close();

const failures = [];
const wa = snapshots.find((s) => s.label === 'end')?.tokenW ?? 0;
for (const s of snapshots) {
  if (s.overlap > 0.5) failures.push(`${s.label}: @ overlaps H by ${s.overlap.toFixed(2)}px`);
}
const end = snapshots.find((s) => s.label === 'end');
if (end && end.atOpacity < 0.95) failures.push('end @ opacity');
if (end && Math.abs(end.wordTranslate) > 1.5) failures.push(`end translate ${end.wordTranslate}px (want 0)`);
const rest = snapshots.find((s) => s.label === 'rest');
if (rest && Math.abs(rest.wordTranslate + wa / 2) > 2) failures.push(`rest translate ${rest.wordTranslate}px`);

console.log(JSON.stringify({ outDir, hoverMs, snapshots, crops }, null, 2));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('brand-hover-crops: ok');
