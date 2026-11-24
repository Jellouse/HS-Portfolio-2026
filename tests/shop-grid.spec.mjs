// /shop is a fullscreen vase gallery: one product per screen, edge to edge,
// controls on the page margins, and the mobile crop below 760.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
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
await new Promise((r) => server.listen(4341, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4341';

const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };

const browser = await chromium.launch();
const read = (page) => page.evaluate(() => {
  const nav = document.querySelector('[data-arrow-nav]');
  const gallery = document.querySelector('[data-nav-gallery]');
  const img = document.querySelector('[data-nav-photo]');
  const pill = document.querySelector('[data-nav-project]');
  const box = (el) => { const r = el.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]; };
  return {
    screen: nav?.dataset.screen,
    kind: nav?.dataset.kind,
    cover: nav?.classList.contains('is-cover'),
    gallery: box(gallery),
    photo: box(img),
    src: img?.currentSrc || '',
    natural: [img?.naturalWidth || 0, img?.naturalHeight || 0],
    pill: (pill?.textContent || '').replace(/\s+/g, ' ').trim(),
    href: pill?.getAttribute('href') || '',
    dots: document.querySelectorAll('.arrow-dot').length,
    on: [...document.querySelectorAll('.arrow-dot')].indexOf(document.querySelector('.arrow-dot.is-on')),
    back: box(document.querySelector('[data-dir="up"]')),
    prev: box(document.querySelector('[data-dir="left"]')),
    next: box(document.querySelector('[data-dir="right"]')),
  };
});

for (const [name, vp, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['phone', { width: 390, height: 695 }, true]]) {
  const page = await browser.newPage({ viewport: vp, isMobile: mobile, hasTouch: mobile });
  await page.goto(`${BASE}/shop/`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.querySelector('[data-arrow-nav]')?.dataset.screen === 'shop', null, { timeout: 20000 });
  await page.waitForTimeout(600);
  const first = await read(page);

  check(first.screen === 'shop' && first.kind === 'gallery', `${name}: /shop opens the shop gallery`);
  check(first.cover === true, `${name}: gallery is fullscreen`);
  check(
    first.gallery[0] === 0 && first.gallery[1] === 0 && first.gallery[2] === vp.width && first.gallery[3] === vp.height,
    `${name}: gallery covers the viewport (${first.gallery.join('x')})`,
  );
  check(first.photo[2] === vp.width && first.photo[3] === vp.height, `${name}: the photo fills the frame (${first.photo.join('x')})`);
  check(first.dots === 4, `${name}: four vases (${first.dots})`);
  check(/^Type \d+/.test(first.pill) && first.href.startsWith('/shop/'), `${name}: pill reads "${first.pill}" -> ${first.href}`);
  check(mobile ? first.pill.endsWith('+') : first.pill.endsWith('Learn more'), `${name}: pill action "${first.pill}"`);

  const pad = mobile ? 20 : 48;
  check(first.prev[0] === pad, `${name}: previous sits ${pad}px from the left (${first.prev[0]})`);
  check(first.next[0] + first.next[2] === vp.width - pad, `${name}: next sits ${pad}px from the right (${vp.width - first.next[0] - first.next[2]})`);
  check(first.back[1] === pad, `${name}: back sits ${pad}px from the top (${first.back[1]})`);

  // the mobile file is a different crop, not the desktop file scaled
  check(first.natural[0] > 0, `${name}: photo loaded (${first.natural.join('x')})`);
  check(mobile ? first.natural[1] > first.natural[0] : first.natural[0] > first.natural[1], `${name}: ${mobile ? 'portrait' : 'landscape'} crop (${first.natural.join('x')})`);

  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(500);
  const second = await read(page);
  check(second.on === 1 && second.src !== first.src, `${name}: next moves to the second vase`);
  await page.keyboard.press('ArrowLeft');
  await page.waitForTimeout(500);
  check((await read(page)).src === first.src, `${name}: previous returns to the first vase`);

  await page.keyboard.press('Escape');
  await page.waitForFunction(() => location.pathname === '/', null, { timeout: 10000 });
  check(true, `${name}: back leaves the shop`);

  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error(`\nshop gallery: ${failures.length} failed`);
  process.exit(1);
}
console.log('\nshop gallery: ok');
