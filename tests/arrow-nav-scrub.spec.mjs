// Mobile scrub on the gallery indicator: drag maps X to slide index and
// shows the number HUD only while the pointer is down.
//
// npm run build && npm run test:arrow-scrub
import { chromium } from 'playwright';
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
await new Promise((r) => server.listen(4338, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4338/';

const failures = [];
const browser = await chromium.launch();

const scrubState = () => {
  const nav = document.querySelector('[data-arrow-nav]');
  const hud = document.querySelector('[data-nav-scrub]');
  const current = document.querySelector('.arrow-scrub-num.is-on');
  const gallery = document.querySelector('[data-nav-gallery]');
  const box = gallery?.getBoundingClientRect();
  const hudBox = hud?.getBoundingClientRect();
  return {
    index: [...document.querySelectorAll('.arrow-dot')].findIndex((el) => el.classList.contains('is-on')),
    count: document.querySelectorAll('.arrow-dot').length,
    scrubbing: !!nav?.classList.contains('is-scrubbing'),
    hudHidden: !!hud?.hidden,
    current: (current?.textContent || '').trim(),
    full: !!nav?.classList.contains('is-full') || !!nav?.classList.contains('is-cover'),
    width: box ? Math.round(box.width) : 0,
    height: box ? Math.round(box.height) : 0,
    hudLeft: hudBox ? Math.round(hudBox.left + hudBox.width / 2) : 0,
  };
};

const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.goto(`${BASE}#space`, { waitUntil: 'load' });
await page.waitForFunction(() => {
  const nav = document.querySelector('[data-arrow-nav]');
  return nav && nav.dataset.kind === 'gallery' && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
}, null, { timeout: 20000 });
await page.waitForTimeout(200);

const start = await page.evaluate(scrubState);
if (start.count < 3) failures.push(`expected a multi-slide gallery, got ${start.count}`);
if (start.scrubbing || !start.hudHidden) failures.push('scrub HUD was visible before drag');

const dots = await page.evaluate(() => {
  const el = document.querySelector('[data-nav-dots]');
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top + r.height / 2, w: r.width, h: r.height };
});
if (!dots || dots.w < 8) failures.push('gallery dots were not measurable');
else {
  const midY = dots.y;
  const fromX = dots.x + 4;
  const toX = dots.x + dots.w - 4;
  const locked = await page.evaluate(() => {
    const gallery = document.querySelector('[data-nav-gallery]');
    const box = gallery?.getBoundingClientRect();
    return { width: box ? Math.round(box.width) : 0, height: box ? Math.round(box.height) : 0 };
  });
  await page.mouse.move(fromX, midY);
  await page.mouse.down();
  await page.waitForTimeout(40);
  const down = await page.evaluate(scrubState);
  if (!down.scrubbing) failures.push('is-scrubbing was not set on pointerdown');
  if (down.hudHidden) failures.push('scrub HUD stayed hidden during drag');
  if (down.current !== String(down.index + 1)) failures.push(`HUD current ${down.current} did not match index ${down.index}`);
  if (down.width !== locked.width || down.height !== locked.height) {
    failures.push(`frame resized on scrub press (${locked.width}x${locked.height} -> ${down.width}x${down.height})`);
  }

  const midX = Math.round(dots.x + dots.w * 0.65);
  await page.mouse.move(midX, midY, { steps: 8 });
  await page.waitForTimeout(40);
  const mid = await page.evaluate(scrubState);
  if (Math.abs(mid.hudLeft - midX) > 12) {
    failures.push(`HUD did not follow thumb mid-drag (hud ${mid.hudLeft}, thumb ${midX})`);
  }

  await page.mouse.move(toX, midY, { steps: 8 });
  await page.waitForTimeout(40);
  const dragged = await page.evaluate(scrubState);
  if (dragged.index <= start.index) failures.push(`scrub did not advance (start ${start.index}, end ${dragged.index})`);
  if (!dragged.scrubbing) failures.push('is-scrubbing dropped mid-drag');
  if (dragged.hudHidden) failures.push('scrub HUD hid mid-drag');
  if (dragged.current !== String(dragged.index + 1)) failures.push(`HUD current ${dragged.current} did not match index ${dragged.index} after drag`);
  if (dragged.full) failures.push('scrub opened fullscreen');
  if (dragged.width !== locked.width || dragged.height !== locked.height) {
    failures.push(`frame resized mid-scrub (${locked.width}x${locked.height} -> ${dragged.width}x${dragged.height})`);
  }
  if (dragged.hudLeft <= mid.hudLeft) {
    failures.push(`HUD did not keep moving with the thumb (${mid.hudLeft} -> ${dragged.hudLeft})`);
  }

  await page.mouse.up();
  await page.waitForTimeout(40);
  const up = await page.evaluate(scrubState);
  if (up.scrubbing) failures.push('is-scrubbing stayed after pointerup');
  if (!up.hudHidden) failures.push('scrub HUD stayed visible after pointerup');
  if (up.index !== dragged.index) failures.push(`index changed on release (${dragged.index} -> ${up.index})`);
  if (up.full) failures.push('release opened fullscreen');
}

await page.close();
await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('arrow-nav-scrub: ok');
