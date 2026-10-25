/**
 * Shop pages sit on the same layout grid as project pages: shop text and images must share
 * the column edges of project text (Default, 6 cols) and Wide blocks (8 cols) at 1440 and 390.
 *
 *   npm run build && npm run test:shop-grid
 *   BASE_URL=https://humansize.de npm run test:shop-grid
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const BASE = (process.env.BASE_URL || '').replace(/\/$/, '');
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2' };

async function ensureServer() {
  if (BASE) return { url: BASE, stop: async () => {} };
  const root = join(ROOT, '.vercel', 'output', 'static');
  if (!existsSync(join(root, 'index.html'))) {
    console.error('No build. Run npm run build first, or set BASE_URL.');
    process.exit(1);
  }
  const server = createServer((req, res) => {
    let path = decodeURIComponent((req.url || '/').split('?')[0]);
    if (path.startsWith('/api/') || path.startsWith('/_vercel/')) {
      res.writeHead(404);
      return res.end();
    }
    if (path.endsWith('/')) path += 'index.html';
    const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
    if (!file) {
      res.writeHead(404);
      return res.end('not found');
    }
    res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
    res.end(readFileSync(file));
  });
  await new Promise((r) => server.listen(4341, '127.0.0.1', r));
  return { url: 'http://127.0.0.1:4341', stop: () => new Promise((r) => server.close(r)) };
}

// Project reference: Default text column and Wide image column.
const PROJECT = '/work/industrial-bloom/';
const WIDE_PROJECT = '/work/atomic-ski/';
const REF = { text: '.project.page-grid > .text-block, .project.page-grid > .info', wide: '.project.page-grid > [data-frame="wide"]' };
// Shop elements and which project column they must match.
const SHOP = {
  '/shop/': { '.shop-intro': 'text', '.shop-pair': 'wide' },
};
for (const d of readdirSync(join(ROOT, 'src/content/products'), { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  SHOP[`/shop/${d.name}/`] = { '.shop-detail-head': 'text', '.shop-detail-text': 'text', '.shop-detail-image': 'text', '.shop-detail-info': 'text', '.shop-wild-grid': 'text' };
}

const edges = (page, sel) =>
  page.evaluate((sel) => {
    const el = [...document.querySelectorAll(sel)].find((e) => e.getBoundingClientRect().width > 0);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return [Math.round(r.left), Math.round(r.right)];
  }, sel);

const { url, stop } = await ensureServer();
const browser = await chromium.launch();
let failed = false;
for (const width of [1440, 390]) {
  const page = await browser.newPage({ viewport: { width, height: 900 } });
  await page.goto(url + PROJECT, { waitUntil: 'load' });
  const ref = { text: await edges(page, REF.text) };
  await page.goto(url + WIDE_PROJECT, { waitUntil: 'load' });
  ref.wide = await edges(page, REF.wide);
  if (!ref.text || !ref.wide) throw new Error(`no project reference at ${width}: ${JSON.stringify(ref)}`);
  for (const [path, els] of Object.entries(SHOP)) {
    const res = await page.goto(url + path, { waitUntil: 'load' });
    if (!res || res.status() !== 200) continue;
    for (const [sel, kind] of Object.entries(els)) {
      const got = await edges(page, sel);
      if (!got) continue;
      const want = ref[kind];
      const ok = Math.abs(got[0] - want[0]) <= 1 && Math.abs(got[1] - want[1]) <= 1;
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${width} ${path} ${sel} ${got} vs ${kind} ${want}`);
      if (!ok) failed = true;
    }
  }
  await page.close();
}
await browser.close();
await stop();
if (failed) process.exit(1);
console.log('shop-grid OK');
