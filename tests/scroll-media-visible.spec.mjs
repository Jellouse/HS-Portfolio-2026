/**
 * Scroll motion: media must become visible after intro on home, shop, and project pages.
 *   npm run build && node tests/scroll-media-visible.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4340, '127.0.0.1', r));

const browser = await chromium.launch();
let fail = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fail = 1;
};

async function visibleMedia(page) {
  return page.evaluate(() => {
    let best = { ok: false, o: 0, nw: 0 };
    for (const frame of document.querySelectorAll('main .frame')) {
      const img = frame.querySelector('img');
      if (!img || !img.naturalWidth) continue;
      const o = parseFloat(getComputedStyle(frame).opacity);
      const imgO = parseFloat(getComputedStyle(img).opacity);
      if (o > best.o) best = { ok: o > 0.4 && imgO > 0.4, o, nw: img.naturalWidth, imgO };
    }
    return {
      ...best,
      pending: document.documentElement.classList.contains('is-scroll-intro-pending'),
    };
  });
}

for (const [name, vp, url, scrollPrep] of [
  ['desktop atomic', { width: 1440, height: 900 }, '/work/atomic-ski/', async (page) => {
    const top = await page.evaluate(() => {
      const f = document.querySelectorAll('main .frame')[2];
      const r = f.getBoundingClientRect();
      return r.top + scrollY + r.height / 2;
    });
    await page.evaluate((y) => scrollTo(0, Math.max(0, Math.round(y - innerHeight / 2))), top);
  }],
  ['mobile atomic', { width: 390, height: 844, isMobile: true }, '/work/atomic-ski/', async (page) => {
    const top = await page.evaluate(() => {
      const f = document.querySelectorAll('main .frame')[1];
      const r = f.getBoundingClientRect();
      return r.top + scrollY + r.height / 2;
    });
    await page.evaluate((y) => scrollTo(0, Math.max(0, Math.round(y - innerHeight / 2))), top);
  }],
  ['desktop home', { width: 1440, height: 900 }, '/', async (page) => {
    await page.evaluate(() => {
      const frame = document.querySelector('.feed .card .frame');
      if (!frame) return;
      const r = frame.getBoundingClientRect();
      scrollTo(0, Math.max(0, scrollY + r.top + r.height / 2 - innerHeight / 2));
    });
  }],
  ['desktop shop', { width: 1440, height: 900 }, '/shop/', async (page) => {
    await page.evaluate(() => {
      const frame = document.querySelector('.shop-pair .frame');
      if (!frame) return;
      const r = frame.getBoundingClientRect();
      scrollTo(0, Math.max(0, scrollY + r.top + r.height / 2 - innerHeight / 2));
    });
  }],
]) {
  const page = await browser.newPage({ viewport: vp, ...(vp.isMobile ? { isMobile: true, hasTouch: true } : {}) });
  await page.goto(`http://127.0.0.1:4340${url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-scroll-intro-ready'), null, { timeout: 20000 });
  await page.waitForTimeout(3800);
  await scrollPrep(page);
  await page.waitForTimeout(400);
  const v = await page.evaluate(() => {
    const scope = location.pathname === '/' ? '.feed .card .frame' : 'main .frame';
    let best = { ok: false, o: 0, nw: 0 };
    for (const frame of document.querySelectorAll(scope)) {
      const img = frame.querySelector('img');
      const video = frame.querySelector('video');
      const o = parseFloat(getComputedStyle(frame).opacity);
      const mediaOk =
        (img && img.naturalWidth > 0) ||
        (video && (video.readyState >= 2 || video.poster || video.videoWidth > 0));
      if (!mediaOk) continue;
      const nw = img?.naturalWidth || video?.videoWidth || 0;
      if (o > best.o) best = { ok: o > 0.4, o, nw };
    }
    return { ...best, pending: document.documentElement.classList.contains('is-scroll-intro-pending') };
  });
  check(v.ok && !v.pending, `${name}: main .frame image visible (o=${v.o}, img=${v.nw}px)`);
  await page.close();
}

await browser.close();
server.close();
process.exit(fail);
