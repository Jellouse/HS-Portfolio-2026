// Trace the first 8s of the homepage on an emulated iPhone 12 and sum main and raster work.
// Usage: npm run build && node tests/intro-trace.mjs [--throttle=4] [--max-raster=400] [--out=trace.json]
// --max-raster fails the run when raster work during the intro goes over that many ms.
// The SVG filter intro rastered about 3500ms here; the GPU face rasters about 50ms.
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, writeFileSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
const THROTTLE = Number(process.argv.find((a) => a.startsWith('--throttle='))?.split('=')[1] ?? 4);
const MAX_RASTER = Number(process.argv.find((a) => a.startsWith('--max-raster='))?.split('=')[1] ?? 0);
const OUT = process.argv.find((a) => a.startsWith('--out='))?.split('=')[1];
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
await new Promise((r) => server.listen(4335, '127.0.0.1', r));
const browser = await chromium.launch({ channel: process.env.CHANNEL || undefined, args: (process.env.CHROME_ARGS || '').split(' ').filter(Boolean) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const cdp = await ctx.newCDPSession(page);
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'cc', 'blink', 'benchmark'] });
await page.goto('http://127.0.0.1:4335/', { waitUntil: 'commit' });
await page.waitForTimeout(8500);
const buf = await browser.stopTracing();
if (OUT) writeFileSync(OUT, buf);
const { traceEvents } = JSON.parse(buf.toString());
const sum = {};
for (const e of traceEvents) {
  if (e.ph !== 'X' || !e.dur) continue;
  if (!['Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'RasterTask', 'Commit', 'FunctionCall', 'RunTask', 'ImageDecodeTask', 'Decode Image', 'PaintImage', 'Layerize', 'UpdateLayer', 'LayerTreeHost::DoUpdateLayers', 'ProxyMain::BeginMainFrame'].includes(e.name)) continue;
  const k = e.name;
  sum[k] ??= { n: 0, ms: 0, max: 0 };
  sum[k].n++;
  sum[k].ms += e.dur / 1000;
  sum[k].max = Math.max(sum[k].max, e.dur / 1000);
}
for (const k in sum) { sum[k].ms = Math.round(sum[k].ms); sum[k].max = Math.round(sum[k].max); }
const nav = traceEvents.find((e) => e.name === 'navigationStart' || e.name === 'NavigationStartToBegin')?.ts ?? traceEvents.reduce((m, e) => (e.ts > 0 && e.ts < m ? e.ts : m), Infinity);
const frames = traceEvents.filter((e) => e.name === 'PipelineReporter' && e.ph === 'b' && e.args?.frame_reporter);
const states = {};
for (const f of frames) { const s = f.args.frame_reporter.state; states[s] = (states[s] || 0) + 1; }
const perSecond = {};
for (const e of traceEvents) {
  if (e.name !== 'RasterTask' || e.ph !== 'X') continue;
  const s = Math.floor((e.ts - nav) / 1e6);
  perSecond[s] = Math.round((perSecond[s] || 0) + e.dur / 1000);
}
console.log(JSON.stringify({ throttle: THROTTLE, sum, frameStates: states, rasterMsPerSecond: perSecond }, null, 1));
await browser.close();
server.close();
const raster = sum.RasterTask?.ms ?? 0;
if (MAX_RASTER && raster > MAX_RASTER) {
  console.error(`intro raster ${raster}ms is over ${MAX_RASTER}ms`);
  process.exit(1);
}
