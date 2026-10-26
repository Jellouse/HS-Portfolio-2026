/**
 * Round 5: /shop ring lands on the /shop/<slug> icon spot, shop menu opens when small,
 * contact text centred on one line then left, block only moves when lines change, menu order.
 *
 *   npm run build && npm run test:shop-intro
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
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
await new Promise((r) => server.listen(4335, '127.0.0.1', r));
const browser = await chromium.launch();
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
const B = 'http://127.0.0.1:4335';
for (const [label, opt] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const p = await (await browser.newContext(opt)).newPage();
  await p.goto(B + '/shop/', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const top0 = await p.evaluate(() => { const r = document.querySelector('.shop-mark').getBoundingClientRect(); return Math.round(r.top + r.height / 2); });
  check(Math.abs(top0) <= 1, `${label}: ring starts half cut off (centre y ${top0})`);
  const R = Number(await p.getAttribute('[data-shop-head]', 'data-ring-r'));
  await p.evaluate((y) => scrollTo(0, y), R);
  await p.waitForTimeout(800);
  const a = await p.locator('.shop-mark').boundingBox();
  if (label === 'desktop') await p.hover('[data-shop-ring]'); else await p.tap('[data-shop-ring]');
  await p.waitForTimeout(500);
  check(await p.evaluate(() => document.querySelector('.shop-ring-wrap').classList.contains('is-open')), `${label}: small ring opens the menu`);
  const order = await p.evaluate(() => [...document.querySelectorAll('.shop-ring-wrap .project-menu > *')].map((e) => e.textContent.trim()).join(','));
  check(order === 'Home,Shop,Contact', `${label}: shop menu order ${order}`);
  await p.goto(B + (await p.getAttribute('.shop-title', 'href')), { waitUntil: 'load' });
  await p.waitForTimeout(3000); // load spin settles on 90deg
  const d = await p.locator('.shop-mark').boundingBox();
  check(Math.abs(a.y - d.y) <= 2 && Math.abs(a.width - d.width) <= 1 && Math.abs(a.x - d.x) <= 1, `${label}: ring at R matches detail icon (${a.y.toFixed(1)}/${d.y.toFixed(1)}, ${a.width.toFixed(1)}/${d.width.toFixed(1)})`);
}
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(B + '/', { waitUntil: 'load' });
await p.waitForTimeout(500);
const home = await p.evaluate(() => [...document.querySelectorAll('.site-menu > *')].map((e) => e.textContent.trim()).join(','));
check(home === 'About,Shop,Contact', `home menu ${home}`);
check((await p.textContent('.brand')).trim() === '@Humansize', 'brand reads @Humansize');
await p.click('.site-menu [data-contact-open]');
await p.waitForTimeout(700);
await p.click('[data-service="Other"]');
await p.waitForTimeout(300);
const st = () => p.evaluate(() => { const t = document.querySelector('#contact-project'); return { align: getComputedStyle(t).textAlign, top: Math.round(t.getBoundingClientRect().top), h: Math.round(t.getBoundingClientRect().height) }; });
await p.type('#contact-project', 'Short');
await p.waitForTimeout(400);
const s1 = await st();
await p.type('#contact-project', ' words');
await p.waitForTimeout(400);
const s1b = await st();
check(s1.align === 'center' && s1.top === s1b.top, `one line: centred, no move while typing (${s1.align}, ${s1.top}/${s1b.top})`);
await p.type('#contact-project', ' and more words so that it wraps well past the first line of this field');
await p.waitForTimeout(500);
const s2 = await st();
check(s2.align === 'left' && s2.h === 58 && s2.top < s1.top, `two lines: left, grew, re-centred (${s2.align}, h ${s2.h}, top ${s2.top})`);
const hover = await p.evaluate(() => { const r = document.querySelector('.contact-dots').getBoundingClientRect(); return [r.left - 100, r.top + 2]; });
await p.mouse.move(hover[0], hover[1]);
await p.waitForTimeout(400);
check(await p.evaluate(() => getComputedStyle(document.querySelector('.contact-back')).opacity === '1'), 'Back shows with the pointer 100px left of the dots');
await browser.close();
server.close();
if (failures.length) { console.error('shop-intro FAIL'); process.exit(1); }
console.log('shop-intro: ok');
