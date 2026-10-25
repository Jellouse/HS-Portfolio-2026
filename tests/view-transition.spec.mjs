/**
 * Shared-element page transition: the Industrial Bloom ring (view-transition-name ib-mark)
 * morphs between /shop and /shop/<slug> in both directions. Checks the mark exists on both,
 * the morph actually runs, arrival is at the top, the load spin does not replay, the mark
 * ends on the 90deg grid, and there are no console errors.
 *
 *   npm run build && npm run test:vt
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.avif': 'image/avif' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
if (!root) { console.error('Run npm run build first.'); process.exit(1); }
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404); return res.end(); }
  // Cacheable like production: re-fetching every asset on each navigation can push the
  // new page's first render past Chrome's cross-document transition window.
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream', 'cache-control': file.includes('/_astro/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4333, '127.0.0.1', r));


const BASE = 'http://127.0.0.1:4333';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(String(e)));
await page.addInitScript(() => {
  addEventListener('pagereveal', (e) => {
    const vt = e.viewTransition;
    window.__vt = { ran: !!vt, morph: false, done: false };
    if (!vt) { window.__vt.done = 'none'; return; }
    vt.ready.then(() => {
      window.__vt.morph = document.getAnimations().some((a) => a.effect?.pseudoElement === '::view-transition-group(ib-mark)');
      // the incoming mark must not be running the load spin
      window.__vt.spin = document.querySelector('[data-spin-mark]').getAnimations().length;
    });
    vt.finished.then(() => (window.__vt.done = true), () => (window.__vt.done = 'skipped'));
  });
});
const failures = [];
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const vtName = () => page.evaluate(() => getComputedStyle(document.querySelector('[data-spin-mark]')).viewTransitionName);

const go = async (label, click, expectPath) => {
  // Chrome skips a cross-document transition ('opt-in disabled') when you navigate again
  // within about a second of arriving; let the page settle first, like a real visit.
  await page.waitForLoadState('load');
  await wait(1500);
  await page.evaluate(() => scrollTo(0, 200));
  await wait(400);
  await Promise.all([page.waitForURL(`${BASE}${expectPath}`), click()]);
  await page.waitForFunction(() => window.__vt && window.__vt.done, null, { timeout: 5000 });
  const vt = await page.evaluate(() => window.__vt);
  const y = await page.evaluate(() => scrollY);
  const name = await vtName();
  await wait(1000);
  const a = await page.evaluate(() => Number(/rotate\(([-\d.e]+)deg\)/.exec(document.querySelector('[data-spin-mark]').style.transform)?.[1]));
  console.log(`${label}: vt=${vt.ran} morph=${vt.morph} spinAnims=${vt.spin} scrollY=${y} name=${name} rest=${a}deg`);
  if (name !== 'ib-mark') failures.push(`${label}: mark has view-transition-name ${name}`);
  if (!vt.ran || !vt.morph || vt.done !== true) failures.push(`${label}: shared-element morph did not run`);
  if (vt.spin) failures.push(`${label}: load spin replayed after in-site navigation`);
  if (y !== 0) failures.push(`${label}: arrived at scrollY ${y}`);
  if (!(Math.abs(a / 90 - Math.round(a / 90)) * 90 < 0.01)) failures.push(`${label}: mark rests at ${a}deg`);
};

await page.goto(`${BASE}/shop/`, { waitUntil: 'load' });
await wait(1800);
if ((await vtName()) !== 'ib-mark') failures.push('/shop: mark is not a shared element');
await go('/shop -> detail', () => page.evaluate(() => document.querySelector('a.shop-pair').click()), '/shop/thorn-vase/');
await go('detail -> /shop', () => page.click('.shop-detail-mark a'), '/shop/');
await go('/shop -> detail again', () => page.evaluate(() => document.querySelector('a.shop-pair').click()), '/shop/thorn-vase/');

await browser.close();
server.close();
if (errors.length) failures.push(...errors.map((e) => `console: ${e}`));
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('view transition OK');
