// Deterministic stills of the phone intro at fixed times (fake clock), for before/after comparison.
// Usage: node tests/intro-frames.mjs --out=/tmp/frames-before
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const OUT = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1] ?? '/tmp/intro-frames';
const DPR = Number(process.argv.find((a) => a.startsWith('--dpr='))?.split('=')[1] ?? 3);
const W = Number(process.argv.find((a) => a.startsWith('--w='))?.split('=')[1] ?? 390);
const H = Number(process.argv.find((a) => a.startsWith('--h='))?.split('=')[1] ?? 844);
mkdirSync(OUT, { recursive: true });
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
const root = [process.env.STATIC, join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].filter(Boolean).find((d) => existsSync(join(d, 'index.html')));
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4336, '127.0.0.1', r));
const browser = await (process.env.BROWSER === 'webkit' ? webkit : chromium).launch();
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: W < 760, hasTouch: W < 760 });
const page = await ctx.newPage();
await page.clock.install({ time: new Date('2026-11-11T13:00:00+09:00') });
await page.clock.pauseAt(new Date('2026-11-11T13:00:01+09:00'));
await page.goto('http://127.0.0.1:4336/?t=12:00', { waitUntil: 'load' });
await page.evaluate(() => document.fonts.ready);
let at = 0;
const TIMES = (process.env.TIMES || '0,500,1500,2500,3500,4500,5500,6500,7400').split(',').map(Number);
for (const t of TIMES) {
  await page.clock.runFor(t - at || 1);
  at = t;
  await page.waitForTimeout(150);
  await page.screenshot({ path: join(OUT, `t${String(t).padStart(4, '0')}.png`), animations: 'allow' });
}
await browser.close();
server.close();
console.log('saved', OUT);
