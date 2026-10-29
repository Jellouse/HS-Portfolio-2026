/** Long-task check while scrolling a project page (target: no tasks over 50ms). */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';

const root = new URL('../.vercel/output/static/', import.meta.url).pathname;
const M = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2' };
const s = createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p.endsWith('/')) p += 'index.html';
  const f = join(root, p);
  if (!existsSync(f) || !statSync(f).isFile()) {
    r.writeHead(404);
    return r.end();
  }
  r.writeHead(200, { 'content-type': M[extname(f)] || '' });
  r.end(readFileSync(f));
}).listen(4371);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://127.0.0.1:4371/work/atomic-ski/', { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.classList.contains('is-scroll-intro-ready'));
await page.evaluate(() => {
  window.__longTasks = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) window.__longTasks.push(e.duration);
  }).observe({ type: 'longtask', buffered: true });
});
const max = await page.evaluate(async () => {
  const step = 120;
  const end = Math.min(document.body.scrollHeight - innerHeight, 2800);
  for (let y = 0; y <= end; y += step) {
    scrollTo(0, y);
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  }
  return Math.max(0, ...(window.__longTasks || []));
});
console.log(`max long task during scroll: ${max.toFixed(1)}ms`);
await browser.close();
s.close();
if (max > 50) process.exit(1);
