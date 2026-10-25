/**
 * Every visible text block outside the first screen must get the site's scroll-in text
 * reveal (blur-to-sharp per line): it starts in the pre-animation state (words transparent
 * and blurred) and reaches the final state (opaque, no blur) once scrolled into view.
 * Crawls every built page, including /shop and /shop/*.
 *
 *   npm run build && npm run test:reveal
 *
 * Deliberate exceptions (ALLOW):
 * - .site-header: the fixed name/@Humansize header and Tokyo time (opacity-only by design).
 * - .skip, .sr-only: never visible.
 * - [data-no-reveal]: blocks that animate themselves (the /shop Details panel; tested below).
 * - .shop-head: the /shop title row sits in the first screen.
 * - .shop-button: the bordered Buy button on /shop/*; a control, so its label never blurs
 *   inside a static border.
 * Pages skipped: /canvas and /keystatic* (tools, not site pages), 404.
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ALLOW = '.site-header, .skip, .sr-only, [data-no-reveal], .shop-head, .shop-button';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
if (!root) { console.error('Run npm run build first.'); process.exit(1); }

const pages = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) { if (name !== '_astro') walk(p); }
    else if (name === 'index.html') pages.push('/' + relative(root, dir).replace(/\\/g, '/') + (dir === root ? '' : '/'));
  }
})(root);
const urls = pages.map((p) => p.replace(/^\/\//, '/')).filter((p) => !/^\/(canvas|keystatic)/.test(p)).sort();

const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4331, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4331';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const failures = [];
let checked = 0;

for (const url of urls) {
  await page.goto(BASE + url, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(400);
  // Text blocks below the first screen, and whether each sits in a reveal host.
  const blocks = await page.evaluate((ALLOW) => {
    const out = [];
    let id = 0;
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      if (!/\S/.test(n.textContent)) continue;
      const el = n.parentElement;
      if (!el || el.closest(ALLOW) || el.closest('script, style, noscript, svg, template')) continue;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height || cs.visibility === 'hidden' || cs.display === 'none') continue;
      if (r.top + scrollY < innerHeight) continue; // first screen shows immediately
      const host = el.closest('.is-split');
      const key = host || el;
      if (seen.has(key)) continue;
      seen.add(key);
      key.dataset.revealTest = String(++id);
      const word = host?.querySelector('.reveal-word');
      const ws = word && getComputedStyle(word);
      out.push({ id, text: (key.textContent || '').trim().slice(0, 50), host: !!host, opacity: ws ? +ws.opacity : 1, filter: ws ? ws.filter : 'none' });
    }
    return out;
  }, ALLOW);
  for (const b of blocks) {
    checked += 1;
    if (!b.host) { failures.push(`${url}: no text reveal on "${b.text}"`); continue; }
    if (!(b.opacity < 0.5 && /blur\((?!0px)/.test(b.filter))) failures.push(`${url}: "${b.text}" not in pre-animation state (opacity ${b.opacity}, ${b.filter})`);
  }
  for (const b of blocks.filter((x) => x.host)) {
    await page.evaluate((id) => document.querySelector(`[data-reveal-test="${id}"]`).scrollIntoView({ block: 'center' }), b.id);
    await page.waitForTimeout(120);
    const end = await page.evaluate((id) => [...document.querySelectorAll(`[data-reveal-test="${id}"] .reveal-word`)].every((w) => { const s = getComputedStyle(w); return +s.opacity > 0.99 && !/blur\((?!0px)/.test(s.filter); }), b.id);
    if (!end) failures.push(`${url}: "${b.text}" did not reach the final state in view`);
  }
  console.log(`${url}: ${blocks.length} below-the-fold text blocks`);
}

// /shop Details panel: closed by default, opens to the final state, closes again.
await page.goto(BASE + '/shop/', { waitUntil: 'load' });
const btn = page.locator('.shop-details').first();
await btn.scrollIntoViewIfNeeded();
if ((await btn.getAttribute('aria-expanded')) !== 'false') failures.push('/shop: Details not closed by default');
await btn.click();
await page.waitForTimeout(800);
const open = await page.evaluate(() => { const b = document.querySelector('.shop-details'); const p = document.getElementById(b.getAttribute('aria-controls')); return b.getAttribute('aria-expanded') === 'true' && !p.hidden && p.getBoundingClientRect().height > 20 && [...p.querySelectorAll('.reveal-word')].every((w) => +getComputedStyle(w).opacity > 0.99); });
if (!open) failures.push('/shop: Details did not open fully');
await btn.press('Enter');
await page.waitForTimeout(800);
const closed = await page.evaluate(() => { const b = document.querySelector('.shop-details'); return b.getAttribute('aria-expanded') === 'false' && document.getElementById(b.getAttribute('aria-controls')).hidden; });
if (!closed) failures.push('/shop: Details did not close via keyboard');

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log(`text reveal OK: ${checked} blocks on ${urls.length} pages`);
