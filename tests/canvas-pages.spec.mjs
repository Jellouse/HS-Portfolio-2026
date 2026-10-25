// /canvas must show every public page. Compares the canvas page list (rendered by the built
// Vercel function) with every HTML page in the static build. Run `npm run build` first.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const root = '.vercel/output/static';
const fn = '.vercel/output/functions/_render.func/dist/server/entry.mjs';
if (!existsSync(fn)) { console.error('Run npm run build first.'); process.exit(1); }

// Not public pages (tools); keep in sync with EXCLUDE in src/lib/canvas-pages.ts.
const NOT_PUBLIC = new Set(['/keystatic-upload/']);
const built = [];
const walk = (dir) => {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== '_astro') walk(p); continue; }
    if (!e.name.endsWith('.html')) continue;
    const rel = '/' + p.slice(root.length + 1);
    built.push(rel === '/404.html' ? '/404' : rel.replace(/index\.html$/, ''));
  }
};
walk(root);
const expected = built.filter((p) => !NOT_PUBLIC.has(p)).sort();

process.env.VERCEL_ENV = 'preview'; // open mode, no GitHub login
const { default: handler } = await import(new URL('../' + fn, import.meta.url));
// Static assets from the build (as on Vercel), everything else through the function.
const TYPES = { js: 'text/javascript', css: 'text/css', svg: 'image/svg+xml', webp: 'image/webp', woff2: 'font/woff2' };
const server = http.createServer((q, r) => {
  const file = join(root, decodeURIComponent(q.url.split('?')[0]));
  if (q.url.startsWith('/_astro/') && existsSync(file) && statSync(file).isFile()) {
    r.writeHead(200, { 'content-type': TYPES[file.split('.').pop()] || 'application/octet-stream' });
    return r.end(readFileSync(file));
  }
  return handler(q, r);
});
await new Promise((r) => server.listen(4521, '127.0.0.1', r));
const html = await (await fetch('http://127.0.0.1:4521/canvas')).text();
const m = html.match(/<script id="canvas-data" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(m, '/canvas has no canvas-data');
const listed = JSON.parse(m[1]).pages.map((p) => p.path);

const missing = expected.filter((p) => !listed.includes(p));
const extra = listed.filter((p) => !expected.includes(p));
assert.deepEqual(missing, [], `public pages missing from /canvas: ${missing.join(', ')}`);
assert.deepEqual(extra, [], `/canvas lists pages that are not built: ${extra.join(', ')}`);
assert.ok(listed.includes('/shop/') && listed.some((p) => /^\/shop\/[^/]+\/$/.test(p)), 'shop pages on /canvas');
assert.ok(!listed.includes('/admin/') && !listed.includes('/admin'), '/admin is not on /canvas');

// Board layout: a regular grid on a dark board. Page styles must not leak onto /canvas
// (global.css has its own .frame rule: position relative + radius, which stairsteps the board).
const { chromium } = await import('playwright');
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route('**/*', (r) => (r.request().resourceType() === 'document' && !r.request().url().endsWith('/canvas') ? r.fulfill({ body: '<html></html>', contentType: 'text/html' }) : r.continue()));
await page.goto('http://127.0.0.1:4521/canvas', { waitUntil: 'load' });
await page.waitForSelector('.frame');
const board = await page.evaluate(() => {
  const frames = [...document.querySelectorAll('#canvas-data ~ * .frame, .frame')];
  return {
    bg: getComputedStyle(document.body).backgroundColor,
    sheets: [...document.querySelectorAll('link[rel=stylesheet]')].map((l) => l.getAttribute('href')),
    frames: frames.map((f) => ({ pos: getComputedStyle(f).position, top: f.style.top, left: f.style.left, y: Math.round(f.getBoundingClientRect().y) })),
  };
});
if (process.env.CANVAS_SHOT) await page.screenshot({ path: process.env.CANVAS_SHOT });
await browser.close();
server.close();
assert.ok(!/rgb\(255, 255, 255\)|rgba\(0, 0, 0, 0\)/.test(board.bg), `board background is ${board.bg}`);
assert.deepEqual(board.sheets, [], `page stylesheets leaked onto /canvas: ${board.sheets.join(', ')}`);
assert.ok(board.frames.length >= listed.length, 'one frame per page and width');
for (const f of board.frames) assert.equal(f.pos, 'absolute', 'frames are absolutely placed');
const rows = new Map();
for (const f of board.frames) rows.set(f.top, [...(rows.get(f.top) || []), f]);
for (const [top, fs] of rows) {
  assert.equal(new Set(fs.map((f) => f.y)).size, 1, `frames in the row at ${top} do not share one y (stairstep)`);
}
// Pages are columns (each at every width), rows are hosts: every page has its frames in each row.
for (const [top, fs] of rows) {
  assert.ok(fs.length >= listed.length, `row at ${top} has ${fs.length} frames for ${listed.length} pages`);
  assert.equal(new Set(fs.map((f) => f.left)).size, fs.length, `frames in the row at ${top} overlap`);
}
console.log(`canvas pages OK: ${listed.length} pages (${listed.join(' ')})`);
process.exit(0);
