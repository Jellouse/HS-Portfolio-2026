// Links in split reveal hosts keep a visible underline at rest.
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
const root = '.vercel/output/static';
const M = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!existsSync(f) || !statSync(f).isFile()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': M[extname(f)] || '' });
  r.end(readFileSync(f));
}).listen(4346);
let failed = false;
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const b = await type.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await pg.goto('http://127.0.0.1:4346/', { waitUntil: 'load' });
  await pg.waitForTimeout(1200);
  const bad = await pg.evaluate(() =>
    [...document.querySelectorAll('.is-split a.reveal-word')]
      .filter((a) => {
        const cs = getComputedStyle(a);
        const deco = cs.textDecorationLine.includes('underline');
        const border = parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none';
        return !deco && !border && cs.backgroundImage === 'none';
      })
      .map((a) => a.textContent.trim()),
  );
  const count = await pg.locator('.is-split a.reveal-word').count();
  if (!count || bad.length) { failed = true; console.error(`${name}: ${count} links, no underline on: ${bad.join(' | ')}`); }
  else console.log(`${name}: ${count} split links underlined`);
  await b.close();
}
server.close();
process.exit(failed ? 1 : 0);
