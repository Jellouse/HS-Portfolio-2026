
// Landing face glances L/R/U/D with the cursor, and stares forward over the mark.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.mp4': 'video/mp4',
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
await new Promise((r) => server.listen(4357, '127.0.0.1', r));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4357/', { waitUntil: 'load' });
await page.waitForFunction(() => {
  const nav = document.querySelector('[data-arrow-nav]');
  return nav && !nav.classList.contains('is-intro') && nav.querySelector('.arrow-face-blob.is-face-settled');
});

const failures = [];
const face = await page.locator('[data-nav-face]').boundingBox();
if (!face) failures.push('missing face');
else {
  const cx = face.x + face.width / 2;
  const cy = face.y + face.height / 2;
  const cases = [
    ['right', cx + face.width * 2, cy, 'right'],
    ['left', cx - face.width * 2, cy, 'left'],
    ['up', cx, cy - face.height * 2, 'up'],
    ['down', cx, cy + face.height * 2, 'down'],
    ['center', cx, cy, null],
  ];
  for (const [name, x, y, expect] of cases) {
    await page.mouse.move(x, y);
    // Ease-glance is heavy up front (82% in); wait out the 200ms transition.
    await page.waitForTimeout(280);
    const glance = await page.locator('.arrow-face-blob').getAttribute('data-glance');
    if (glance !== expect) failures.push(`${name}: glance=${glance} expected ${expect}`);
    const transform = await page.locator('[data-face-features]').evaluate((el) => getComputedStyle(el).transform);
    const m = transform.match(/matrix\(([^)]+)\)/);
    const parts = m ? m[1].split(',').map((n) => Number(n.trim())) : null;
    const tx = parts ? parts[4] : 0;
    const ty = parts ? parts[5] : 0;
    if (expect === null && (Math.abs(tx) > 0.5 || Math.abs(ty) > 0.5)) {
      failures.push(`${name}: transform ${transform}`);
    }
    if (expect === 'right' && !(tx > 1)) failures.push(`${name}: transform ${transform}`);
    if (expect === 'left' && !(tx < -1)) failures.push(`${name}: transform ${transform}`);
    if (expect === 'up' && !(ty < -1)) failures.push(`${name}: transform ${transform}`);
    if (expect === 'down' && !(ty > 1)) failures.push(`${name}: transform ${transform}`);
  }
}

await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('face-glance: ok');
