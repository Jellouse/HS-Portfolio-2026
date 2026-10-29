
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4337, '127.0.0.1', r));
const browser = await chromium.launch();
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const op = (sel) => page.evaluate((s) => +getComputedStyle(document.querySelector(s)).opacity, sel);
const at = async (y) => { await page.evaluate((v) => window.scrollTo(0, v), y); await page.waitForTimeout(300); };
for (const [url, sel] of [['/', '.site-menu[data-main-menu]'], ['/shop/', '.shop-menu']]) {
  await page.goto(`http://127.0.0.1:4337${url}`, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  await at(0); check((await op(sel)) > 0.99, `${url} menu visible at top`);
  await at(2000); check((await op(sel)) < 0.01, `${url} menu faded past intro`);
  await page.focus(`${sel} > *`); await page.waitForTimeout(100);
  check((await op(sel)) > 0.99, `${url} menu back on keyboard focus`);
  await page.evaluate(() => document.activeElement.blur());
  await at(0); check((await op(sel)) > 0.99, `${url} menu back on scroll up`);
}
await browser.close(); server.close();
if (failures.length) process.exit(1);
