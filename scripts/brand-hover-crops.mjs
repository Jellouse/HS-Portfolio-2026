/**
 * Header @Humansize hover: cropped screenshots at rest, mid-transition, and settled hover.
 * Asserts @ cap height matches H and --brand-at-w is set.
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
    const ar = at?.getBoundingClientRect();
    const nr = name?.getBoundingClientRect();
    const hProbe = document.createElement('span');
    hProbe.textContent = 'H';
    hProbe.style.cssText = 'position:fixed;left:-9999px;visibility:hidden;';
    hProbe.className = 'brand-name';
    name?.parentElement?.appendChild(hProbe);
    const hr = hProbe.getBoundingClientRect();
    hProbe.remove();
    const csAt = at ? getComputedStyle(at) : null;
    const csName = name ? getComputedStyle(name) : null;
    return {
      atW: ar?.width ?? 0,
      tokenW: parseFloat(stack?.style.getPropertyValue('--brand-at-w') || '0'),
      atHeight: ar?.height ?? 0,
      hCap: hr.height,
      atOpacity: csAt ? parseFloat(csAt.opacity) : 0,
      fontSizeAt: csAt?.fontSize,
      fontSizeName: csName?.fontSize,
      letterSpacingAt: csAt?.letterSpacing,
      letterSpacingName: csName?.letterSpacing,
      atRight: ar?.right ?? 0,
      atLeft: ar?.left ?? 0,
      nameLeft: nr?.left ?? 0,
    };
  });

await clipHeader(join(outDir, 'header-rest.png'));
const rest = await metrics();

await page.hover('.brand-toggle');
await page.waitForTimeout(80);
await clipHeader(join(outDir, 'header-mid-hover.png'));
const mid = await metrics();

await page.waitForTimeout(120);
await clipHeader(join(outDir, 'header-hover-end.png'));
const end = await metrics();

await browser.close();
server.close();

const failures = [];
if (Math.abs(rest.tokenW - rest.atW) > 1 && end.atOpacity > 0.9) {
  /* token is full glyph width; at rest rect may be 0 */
}
if (end.atOpacity < 0.95) failures.push(`hover end @ opacity ${end.atOpacity}`);
if (end.atW < end.tokenW * 0.95) failures.push(`hover @ clipped: ${end.atW} vs token ${end.tokenW}`);
if (Math.abs(end.atHeight - end.hCap) > 1.5) failures.push(`cap height @ ${end.atHeight} vs H ${end.hCap}`);
if (rest.fontSizeAt !== rest.fontSizeName) failures.push(`font-size mismatch ${rest.fontSizeAt} ${rest.fontSizeName}`);
if (rest.letterSpacingAt !== rest.letterSpacingName) failures.push('letter-spacing mismatch');
if (end.atLeft < -1) failures.push(`@ clipped left ${end.atLeft}`);
const nameSlide = end.nameLeft - rest.nameLeft;
if (Math.abs(nameSlide - end.tokenW) > 2) failures.push(`name slide ${nameSlide}px expected ~${end.tokenW}px`);

console.log(
  JSON.stringify({ outDir, rest, mid, end, crops: ['header-rest.png', 'header-mid-hover.png', 'header-hover-end.png'] }, null, 2),
);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('brand-hover-crops: ok');
