/**
 * The text reveal never leaves in-view text blurred or hidden: load at several scroll
 * positions, jump-scroll, follow an anchor, go back and forward (bfcache), on desktop and
 * mobile. After ~1s every text block in the viewport must be fully shown.
 */
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('../.vercel/output/static/', import.meta.url).pathname;
if (!existsSync(join(root, 'index.html'))) { console.error('Run npm run build first.'); process.exit(1); }
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!f.startsWith(root) || !existsSync(f) || !statSync(f).isFile()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[extname(f)] || 'application/octet-stream' });
  r.end(readFileSync(f));
});
await new Promise((r) => server.listen(4345, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4345';

const stuck = (page) => page.evaluate(() => {
  const out = [];
  for (const host of document.querySelectorAll('.is-split:not(.reveal-manual)')) {
    const r = host.getBoundingClientRect();
    if (!r.height || r.bottom <= 0 || r.top >= innerHeight) continue;
    const bad = [...host.querySelectorAll('.reveal-word')].some((w) => {
      const s = getComputedStyle(w);
      return +s.opacity < 0.99 || /blur\((?!0px)/.test(s.filter);
    });
    if (bad || +getComputedStyle(host).opacity < 0.99) out.push(host.textContent.trim().slice(0, 40));
  }
  return out;
});

const failures = [];
const browser = await chromium.launch();
for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', devices['iPhone 13']]]) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const check = async (what) => {
    await page.waitForTimeout(1000);
    const s = await stuck(page);
    if (s.length) failures.push(`${label} ${what}: ${s.slice(0, 3).join(' | ')}`);
    else console.log(`ok   ${label} ${what}`);
  };
  for (const url of ['/', '/work/atomic-ski/', '/shop/660/']) {
    for (const f of [0, 0.4, 0.8, 1]) {
      // reload at a scroll position (browser scroll restoration)
      await page.goto(BASE + url, { waitUntil: 'load' });
      await page.evaluate((f) => scrollTo(0, (document.documentElement.scrollHeight - innerHeight) * f), f);
      await page.reload({ waitUntil: 'load' });
      await check(`${url} reload at ${f * 100}%`);
    }
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(100);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight)); // jump
    await check(`${url} jump to bottom`);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2));
    await check(`${url} jump to middle`);
  }
  await page.goto(BASE + '/#about', { waitUntil: 'load' });
  await check('/#about anchor load');
  await page.goto(BASE + '/', { waitUntil: 'load' });
  await page.evaluate(() => { location.hash = 'about'; });
  await check('/ anchor jump');
  await page.goto(BASE + '/work/atomic-ski/', { waitUntil: 'load' });
  await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight / 2));
  await page.waitForTimeout(300);
  await page.goto(BASE + '/shop/', { waitUntil: 'load' });
  await page.goBack({ waitUntil: 'load' });
  await check('back to /work/atomic-ski/');
  await page.goForward({ waitUntil: 'load' });
  await check('forward to /shop/');
  await ctx.close();
}
await browser.close();
server.close();
if (failures.length) { failures.forEach((f) => console.log('FAIL ' + f)); console.log('reveal-robust FAIL'); process.exit(1); }
console.log('reveal-robust OK');
