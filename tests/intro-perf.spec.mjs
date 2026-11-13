// Frame timings for the homepage intro on an emulated iPhone 12.
// Usage: npm run build && node tests/intro-perf.spec.mjs [--throttle=4] [--browser=chromium|webkit] [--runs=3] [--min-fps=50] [--desktop]
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const arg = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=')[1] : fallback;
};
const THROTTLE = Number(arg('throttle', '4'));
const BROWSER = arg('browser', 'chromium');
const RUNS = Number(arg('runs', '3'));
const BUDGET = Number(arg('budget', '0'));
const MIN_FPS = Number(arg('min-fps', '0'));
// --desktop: a 1440x900 retina laptop window instead of the phone.
const DESKTOP = process.argv.includes('--desktop');

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.json': 'application/json' };
const root = [process.env.STATIC, join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].filter(Boolean).find((d) => existsSync(join(d, 'index.html')));
if (!root) { console.error('Run npm run build first.'); process.exit(1); }
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4334, '127.0.0.1', r));

const engine = BROWSER === 'webkit' ? webkit : chromium;
const browser = await engine.launch(BROWSER === 'chromium' ? { channel: process.env.CHANNEL || undefined, args: (process.env.CHROME_ARGS || '').split(' ').filter(Boolean) } : {});

const collect = () => {
  window.__frames = [];
  window.__long = [];
  let last = 0;
  const tick = (now) => {
    if (last) window.__frames.push([now, now - last]);
    last = now;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  try {
    new PerformanceObserver((list) => list.getEntries().forEach((e) => window.__long.push([e.startTime, e.duration]))).observe({ type: 'longtask', buffered: true });
  } catch {}
};

const stats = (frames, long, from, to) => {
  const d = frames.filter(([t]) => t >= from && t <= to).map(([, dt]) => dt).sort((a, b) => a - b);
  const pct = (p) => d[Math.min(d.length - 1, Math.floor(p * d.length))] ?? 0;
  const span = to - from;
  const dropped = Math.max(0, Math.round(span / 16.667) - d.length);
  const lt = long.filter(([t]) => t >= from && t <= to);
  return {
    frames: d.length,
    fps: +(d.length / (span / 1000)).toFixed(1),
    p50: +pct(0.5).toFixed(1),
    p95: +pct(0.95).toFixed(1),
    max: +(d.at(-1) ?? 0).toFixed(1),
    over33: d.filter((x) => x > 33.4).length,
    dropped,
    longTasks: lt.length,
    longMs: Math.round(lt.reduce((s, [, x]) => s + x, 0)),
  };
};

const results = [];
for (let run = 0; run < RUNS; run++) {
  const ctx = await browser.newContext(
    DESKTOP
      ? { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }
      : {
          viewport: { width: 390, height: 844 },
          deviceScaleFactor: 3,
          isMobile: BROWSER !== 'firefox',
          hasTouch: true,
          userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
        },
  );
  await ctx.addInitScript(collect);
  const page = await ctx.newPage();
  if (BROWSER === 'chromium' && THROTTLE > 1) {
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
  }
  await page.goto('http://127.0.0.1:4334/', { waitUntil: 'commit' });
  await page.waitForTimeout(9500);
  const { frames, long, nav } = await page.evaluate(() => ({ frames: window.__frames, long: window.__long, nav: performance.getEntriesByType('navigation')[0]?.domContentLoadedEventEnd ?? 0 }));
  const first = frames[0]?.[0] ?? 0;
  results.push({ intro: stats(frames, long, first, first + 7200), all: stats(frames, long, 0, first + 9000), firstFrame: Math.round(first) });
  await ctx.close();
}
const avg = (key, part) => +(results.reduce((s, r) => s + r[part][key], 0) / results.length).toFixed(1);
const keys = Object.keys(results[0].intro);
console.log(JSON.stringify({ browser: BROWSER, throttle: BROWSER === 'chromium' ? THROTTLE : 1, runs: RUNS, intro: Object.fromEntries(keys.map((k) => [k, avg(k, 'intro')])), whole: Object.fromEntries(keys.map((k) => [k, avg(k, 'all')])), firstFrame: avg('firstFrame', 'results' in {} ? 'intro' : 'intro') && results.map((r) => r.firstFrame) }, null, 1));
await browser.close();
server.close();
if (BUDGET && avg('p95', 'intro') > BUDGET) { console.error(`intro p95 ${avg('p95', 'intro')}ms over ${BUDGET}ms`); process.exit(1); }
if (MIN_FPS && avg('fps', 'intro') < MIN_FPS) { console.error(`intro fps ${avg('fps', 'intro')} is under ${MIN_FPS}`); process.exit(1); }
