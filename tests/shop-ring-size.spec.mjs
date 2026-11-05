/**
 * Playwright check: shop hero ring is min(100vw, 50vh), square, centred on the viewport top edge.
 * Run after `npm run build`: node tests/shop-ring-size.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { shopRingWidth } from '../src/lib/intro-layout.ts';

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
await new Promise((r) => server.listen(4336, '127.0.0.1', r));

const browser = await chromium.launch();
const failures = [];
const check = (ok, label) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`);
  if (!ok) failures.push(label);
};

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport });
  await page.goto('http://127.0.0.1:4336/shop/', { waitUntil: 'load' });
  await page.waitForSelector('[data-shop-head][data-ring-ready]', { timeout: 15000 });
  await page.waitForSelector('.shop-mark.has-canvas', { timeout: 15000 });
  await page.waitForTimeout(200);

  const m = await page.evaluate(() => {
    const head = document.querySelector('[data-shop-head]');
    const ring = document.querySelector('.shop-ring');
    const mark = document.querySelector('.shop-ring .shop-mark');
    if (!head || !ring || !mark) return null;
    const r = ring.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = window.innerHeight;
    const cssW = getComputedStyle(head).getPropertyValue('--ring-w').trim();
    return {
      vw,
      vh,
      cssW,
      dataW: head.getAttribute('data-ring-w'),
      w: r.width,
      h: r.height,
      cx: r.left + r.width / 2,
      cy: (r.top + r.bottom) / 2,
      markW: mark.offsetWidth,
      markH: mark.offsetHeight,
    };
  });

  if (!m) {
    failures.push(`${label}: shop ring nodes missing`);
    await page.close();
    continue;
  }

  const want = shopRingWidth(m.vh, m.vw);
  check(Math.abs(m.w - want) <= 2, `${label}: ring width ${m.w.toFixed(0)}px (want ${want}px)`);
  check(Math.abs(m.h - want) <= 2, `${label}: ring height ${m.h.toFixed(0)}px (want ${want}px)`);
  const visible = await page.evaluate(() => {
    const ring = document.querySelector('.shop-ring');
    if (!ring) return 0;
    const r = ring.getBoundingClientRect();
    return Math.max(0, r.bottom);
  });
  check(Math.abs(visible - Math.round(want / 2)) <= 3, `${label}: visible below top ${visible.toFixed(0)}px (~${Math.round(want / 2)}px, half ring)`);
  check(Math.abs(m.w - m.h) <= 2, `${label}: ring stays square`);
  check(Math.abs(m.cy) <= 1.5, `${label}: ring centre on viewport top (cy ${m.cy.toFixed(1)})`);
  check(Math.abs(m.cx - m.vw / 2) <= 1.5, `${label}: ring centred horizontally`);
  check(m.dataW === String(want), `${label}: data-ring-w ${m.dataW} (want ${want})`);
  check(parseFloat(m.cssW) === want, `${label}: --ring-w ${m.cssW} (want ${want}px)`);
  check(Math.abs(m.markW - want) <= 2 && Math.abs(m.markH - want) <= 2, `${label}: mark fills ring (${m.markW.toFixed(0)}×${m.markH.toFixed(0)})`);

  await page.close();
}

{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto('http://127.0.0.1:4336/', { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, {
    timeout: 45000,
  });
  await page.click('.site-menu a[href="/shop"]');
  await page.waitForURL(/\/shop\/?$/);
  await page.waitForSelector('[data-shop-head][data-ring-ready]', { timeout: 15000 });
  const w = await page.evaluate(() => document.querySelector('.shop-ring')?.getBoundingClientRect().width);
  check(Math.abs(w - shopRingWidth(900, 1440)) <= 2, `client nav: ring width ${w?.toFixed(0)}px (want 900px)`);
  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error('shop-ring-size FAIL');
  process.exit(1);
}
console.log('shop-ring-size: ok');
