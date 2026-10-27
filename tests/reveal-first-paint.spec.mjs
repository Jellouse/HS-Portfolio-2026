/**
 * First paint after a hard reload: text that the reveal will animate must never be shown
 * sharp before the reveal takes over (it used to flash, then blur). Samples every frame from
 * the first one until the text is split, on desktop and mobile, for home, a project, /shop
 * and a product page. Then checks the first-screen text ends fully visible.
 */
import { chromium, devices } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
if (!root) { console.error('Run npm run build first.'); process.exit(1); }
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404); return res.end(); }
  // slow the font a little so the old gap (sharp text before the split) would show up
  const send = () => { res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' }); res.end(readFileSync(file)); };
  extname(file) === '.woff2' ? setTimeout(send, 300) : send();
});
await new Promise((r) => server.listen(4344, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4344';
const URLS = ['/', '/work/industrial-bloom/', '/shop/', '/shop/660/'];
const SEL = "main :is(p,h1,h2,h3,h4,li,blockquote,figcaption,.caption,.project-summary), .site-footer :is(p,li)";
const SKIP = '.sr-only, [data-no-reveal], [data-no-reveal] *';

// runs in the page before any of its scripts: sample each frame until all hosts are split
const probe = ({ SEL, SKIP }) => {
  const bad = new Set();
  let frames = 0;
  const check = () => {
    frames += 1;
    let pending = 0;
    for (const el of document.querySelectorAll(SEL)) {
      if (el.matches(SKIP) || el.closest('.is-split')) continue;
      const r = el.getBoundingClientRect();
      if (!r.height || r.top > innerHeight || r.bottom < 0) continue;
      pending += 1;
      // visible unless it, or an ancestor, is transparent
      let o = 1;
      for (let n = el; n && n.nodeType === 1; n = n.parentElement) o *= Number(getComputedStyle(n).opacity);
      if (o > 0.05 && el.textContent.trim()) bad.add(el.tagName + ': ' + el.textContent.trim().slice(0, 40));
    }
    if (pending || frames < 3) requestAnimationFrame(check);
    else window.__firstPaint = { frames, bad: [...bad] };
  };
  requestAnimationFrame(check);
};

const browser = await chromium.launch();
const failures = [];
for (const [label, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', devices['iPhone 13']]]) {
  const ctx = await browser.newContext({ ...opts });
  const page = await ctx.newPage();
  await page.addInitScript(probe, { SEL, SKIP });
  for (const url of URLS) {
    await page.goto(BASE + url, { waitUntil: 'load' });
    const res = await page.waitForFunction(() => window.__firstPaint, null, { timeout: 8000 }).then((h) => h.jsonValue()).catch(() => null);
    if (!res) { failures.push(`${label} ${url}: text never split`); continue; }
    if (res.bad.length) failures.push(`${label} ${url}: shown sharp before reveal: ${res.bad.slice(0, 3).join(' | ')}`);
    await page.waitForTimeout(600);
    const hidden = await page.evaluate(({ SEL, SKIP }) => [...document.querySelectorAll(SEL)].filter((el) => {
      if (el.matches(SKIP)) return false;
      const r = el.getBoundingClientRect();
      if (!r.height || r.bottom > innerHeight * 0.7 || r.bottom < 0) return false;
      return Number(getComputedStyle(el).opacity) < 0.99;
    }).length, { SEL, SKIP });
    if (hidden) failures.push(`${label} ${url}: ${hidden} first-screen text blocks not faded in`);
    console.log(`${failures.length ? '' : 'ok   '}${label} ${url} (${res.frames} frames)`);
  }
  await ctx.close();
}
await browser.close();
server.close();
if (failures.length) { failures.forEach((f) => console.log('FAIL ' + f)); console.log('reveal-first-paint FAIL'); process.exit(1); }
console.log('reveal-first-paint OK');
