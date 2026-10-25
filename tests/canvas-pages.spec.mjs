// /canvas must show every public page. Compares the canvas page list (rendered by the built
// Vercel function) with every HTML page in the static build. Run `npm run build` first.
import assert from 'node:assert/strict';
import http from 'node:http';
import { readdirSync, existsSync } from 'node:fs';
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
const server = http.createServer((q, r) => handler(q, r));
await new Promise((r) => server.listen(4521, '127.0.0.1', r));
const html = await (await fetch('http://127.0.0.1:4521/canvas')).text();
server.close();
const m = html.match(/<script id="canvas-data" type="application\/json">([\s\S]*?)<\/script>/);
assert.ok(m, '/canvas has no canvas-data');
const listed = JSON.parse(m[1]).pages.map((p) => p.path);

const missing = expected.filter((p) => !listed.includes(p));
const extra = listed.filter((p) => !expected.includes(p));
assert.deepEqual(missing, [], `public pages missing from /canvas: ${missing.join(', ')}`);
assert.deepEqual(extra, [], `/canvas lists pages that are not built: ${extra.join(', ')}`);
assert.ok(listed.includes('/shop/') && listed.some((p) => /^\/shop\/[^/]+\/$/.test(p)), 'shop pages on /canvas');
assert.ok(!listed.includes('/admin/') && !listed.includes('/admin'), '/admin is not on /canvas');
console.log(`canvas pages OK: ${listed.length} pages (${listed.join(' ')})`);
process.exit(0);
