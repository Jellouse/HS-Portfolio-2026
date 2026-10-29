/**
 * Main nav letter intro runs once; scrolling and menu-scroll-out must not replay it.
 *   npm run build && node tests/nav-intro-once.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const root = new URL('../.vercel/output/static/', import.meta.url).pathname;
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const server = createServer((req, res) => {
  let path = decodeURIComponent(req.url.split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = join(root, path);
  if (!existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || '' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4343, '127.0.0.1', r));

let fail = 0;
const check = (ok, msg) => {
  console.log((ok ? 'ok   ' : 'FAIL ') + msg);
  if (!ok) fail = 1;
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4343/', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, {
  timeout: 25000,
});
await page.waitForTimeout(600);

const snapshot = () =>
  page.evaluate(() => {
    const letters = [...document.querySelectorAll('.site-menu[data-main-menu] .motion-letter')];
    const running = letters.filter((l) => l.getAnimations().some((a) => a.playState === 'running')).length;
    const clearish = letters.filter((l) => {
      const c = getComputedStyle(l).color;
      return c === 'rgba(0, 0, 0, 0)' || c === 'transparent';
    }).length;
    return { letters: letters.length, running, clearish };
  });

const before = await snapshot();
check(before.letters >= 12, `nav split into letters (${before.letters})`);
check(before.running === 0 && before.clearish === 0, 'nav letters settled after intro');

await page.evaluate(() => scrollTo(0, Math.round(innerHeight * 0.7)));
await page.waitForTimeout(800);
await page.evaluate(() => scrollTo(0, 0));
await page.waitForTimeout(800);

const after = await snapshot();
check(after.running === 0, `no letter animations after scroll (${after.running} running)`);
check(after.clearish === 0, `nav letters stay visible (${after.clearish} still clear)`);

await browser.close();
server.close();
console.log(fail ? 'nav-intro-once FAIL' : 'nav-intro-once OK');
process.exit(fail);
