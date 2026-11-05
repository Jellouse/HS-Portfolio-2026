
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) =>
  existsSync(join(d, 'index.html')),
);
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}
const M = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.svg': 'image/svg+xml' };
const server = createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = [join(root, p), join(root, p, 'index.html')].find(
    (path) => path.startsWith(root) && existsSync(path) && statSync(path).isFile(),
  );
  if (!f) {
    r.writeHead(404);
    return r.end();
  }
  r.writeHead(200, { 'content-type': M[extname(f)] || '' });
  r.end(readFileSync(f));
}).listen(4346);
let failed = false;
for (const [name, type] of [['chromium', chromium], ['webkit', webkit]]) {
  const b = await type.launch();
  const pg = await b.newPage({ viewport: { width: 1280, height: 800 } });
  await pg.goto('http://127.0.0.1:4346/work/industrial-bloom/', { waitUntil: 'load' });
  await pg.waitForSelector('.is-split a.reveal-word', { timeout: 45000 });
  await pg.waitForTimeout(300);
  const bad = await pg.evaluate(() =>
    [...document.querySelectorAll('.is-split a.reveal-word')]
      .filter((a) => {
        const cs = getComputedStyle(a);
        const deco = cs.textDecorationLine.includes('underline');
        const bg = cs.backgroundImage !== 'none' && cs.backgroundSize !== '0px';
        const border = parseFloat(cs.borderBottomWidth) > 0 && cs.borderBottomStyle !== 'none';
        return !deco && !bg && !border;
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
