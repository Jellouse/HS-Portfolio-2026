/**
 * Phones: the Tokyo time and @Humansize share one row, so they must never be visible together.
 * Real taps at 375/390/430 as an iPhone: closed, name tapped (time open), menu open.
 *   npm run build && npm run test:time   |   BASE_URL=https://humansize.de npm run test:time
 */
import { webkit, chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const STATIC = join(ROOT, '.vercel', 'output', 'static');
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.gif': 'image/gif' };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function serve() {
  const srv = createServer((req, res) => {
    let p = join(STATIC, decodeURIComponent(req.url.split('?')[0]));
    if (existsSync(p) && statSync(p).isDirectory()) p = join(p, 'index.html');
    if (!existsSync(p) && existsSync(p + '.html')) p += '.html';
    if (!existsSync(p)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'content-type': MIME[extname(p)] || 'application/octet-stream' });
    res.end(readFileSync(p));
  });
  await new Promise((r) => srv.listen(4328, r));
  return srv;
}

async function launch() {
  try { return { b: await webkit.launch(), name: 'webkit' }; }
  catch { return { b: await chromium.launch(), name: 'chromium (webkit unavailable)' }; }
}

const state = (p) => p.evaluate(() => {
  const vis = (el) => { const cs = getComputedStyle(el); return cs.visibility !== 'hidden' && cs.display !== 'none' && parseFloat(cs.opacity) > 0.05; };
  const t = document.querySelector('.who .time');
  const h = document.querySelector('.contact .contact-label');
  return { time: vis(t), handle: vis(h) && vis(h.closest('.contact')) };
});

const srv = BASE ? null : await serve();
const url = (BASE || 'http://localhost:4328') + '/';
const { b, name } = await launch();
let fail = 0;
for (const w of (process.env.W ? [+process.env.W] : [375, 390, 430])) {
  const { defaultBrowserType, ...dev } = devices['iPhone 13'];
  const ctx = await b.newContext({ ...dev, viewport: { width: w, height: 844 } });
  await ctx.addInitScript(() => { try { delete Navigator.prototype.vibrate; } catch {} });
  const p = await ctx.newPage();
  await p.goto(url); await wait(1200);
  const check = async (label, expect) => {
    await wait(400);
    const s = await state(p);
    const ok = !(s.time && s.handle) && (expect === undefined || s.time === expect);
    if (!ok) fail++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${w} ${label} time=${s.time} handle=${s.handle}`);
  };
  await check('closed', false);
  await p.tap('.who > a'); await check('name tapped', true);
  await p.tap('.contact .contact-label'); await check('menu open', false);
  await p.tap('.contact .contact-label'); await check('menu closed', false);
  // Menu open: time gone at once (no fade) and stays gone until the 5s auto-close.
  await p.tap('.contact .contact-label');
  const t0 = await p.evaluate(() => { const t = getComputedStyle(document.querySelector('.who .time')); return { op: t.opacity, tr: t.transitionDuration }; });
  const instant = t0.op === '0' && /^0s/.test(t0.tr);
  let held = true;
  for (let i = 0; i < 9; i++) { await wait(500); if ((await state(p)).time) held = false; }
  const fade = await p.evaluate(() => new Promise((r) => {
    const h = document.querySelector('.site-header');
    const iv = setInterval(() => { if (h.classList.contains('is-menu-fade') || h.classList.contains('is-menu-snap')) { clearInterval(iv); r(h.classList.contains('is-menu-fade') ? 'fade' : 'snap'); } }, 20);
    setTimeout(() => r('none'), 2500);
  }));
  // Outside tap closes instantly (snap).
  await p.tap('.contact .contact-label'); await wait(200);
  await p.touchscreen.tap(12, 830);
  const snap = await p.evaluate(() => { const h = document.querySelector('.site-header'); return h.classList.contains('is-menu-snap') && /^0s/.test(getComputedStyle(h.querySelector('.who .time')).transitionDuration); });
  for (const [k, ok] of [['menu open: time hidden instantly', instant], ['menu open: time stays hidden ~4.5s', held], ['5s auto-close: crossfade', fade === 'fade'], ['outside tap: instant return', snap]]) {
    if (!ok) fail++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${w} ${k}`);
  }
  await ctx.close();
}
await b.close(); srv?.close();
console.log(`time-overlap (${name}): ${fail ? fail + ' failed' : 'all ok'}`);
process.exit(fail ? 1 : 0);
