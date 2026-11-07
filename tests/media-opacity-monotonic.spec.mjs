import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) =>
  existsSync(join(d, 'index.html')),
);
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png' };
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4344, '127.0.0.1', r));

const lines = [];
const log = (s) => {
  lines.push(s);
  console.log(s);
};
let fail = 0;

const skip = new Set(['canvas', 'admin', 'keystatic-upload', 'preview', 'api']);
function pages(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name.startsWith('_') || skip.has(name)) continue;
      found.push(...pages(path));
    } else if (name === 'index.html') {
      const url = `/${relative(root, dir).split('\\').join('/')}`;
      found.push(url === '/' ? '/' : `${url.replace(/\/$/, '')}/`);
    } else if (name === '404.html') found.push('/404.html');
  }
  return found;
}
const routes = pages(root).sort();
log(`routes ${routes.join(' ')}`);

const browser = await chromium.launch();
for (const url of routes) {
  for (const width of [390, 1440]) {
  const name = `${url} ${width}`;
  const page = await browser.newPage({
    viewport: { width, height: width < 700 ? 844 : 900 },
    isMobile: width < 700,
    hasTouch: width < 700,
    reducedMotion: 'no-preference',
  });
  await page.goto(`http://127.0.0.1:4344${url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, { timeout: 20000 });
  const audit = await page.evaluate(() => {
    const ui = '.mark, .shop-mark, .services-landing-mark, .brand, .site-header, .site-footer, .hero, .mark-wrap, nav, .project-mark, .shop-detail-mark, .shop-ring, [data-spin-mark]';
    const loose = [];
    document.querySelectorAll('main img, main video').forEach((el) => {
      if (el.closest(ui)) return;
      if (el.closest('.scroll-media') || el.classList.contains('scroll-media')) return;
      const img = el instanceof HTMLImageElement ? el : null;
      const w = Number(img?.getAttribute('width') || 0);
      const h = Number(img?.getAttribute('height') || 0);
      if (img && w > 0 && h > 0 && w <= 128 && h <= 128 && !(img.getAttribute('alt') || '').trim()) return;
      loose.push(`${el.tagName}:${img?.getAttribute('alt') || el.getAttribute('aria-label') || ''}`);
    });
    const marked = [...document.querySelectorAll('.shop-mark, .mark, .services-landing-mark, [data-spin-mark], .project-mark svg')].filter(
      (el) => el.classList.contains('scroll-media') || el.closest('.scroll-media'),
    ).length;
    return { loose, marked };
  });
  if (audit.loose.length || audit.marked) {
    log(`FAIL ${name}: loose ${audit.loose.join('|') || 'none'} marks ${audit.marked}`);
    fail = 1;
  }
  const range = await page.evaluate(() => {
    const layoutTop = (el) => {
      const rect = el.getBoundingClientRect();
      const shift = new DOMMatrix(getComputedStyle(el).transform).m42 || 0;
      return rect.top - shift;
    };
    const frames = [...document.querySelectorAll('.scroll-media')];
    const frame = frames.find((el) => layoutTop(el) > innerHeight * 1.05 + 40);
    if (!frame) return frames.length ? { inView: frames.length } : null;
    frame.setAttribute('data-opacity-probe', '1');
    const top = layoutTop(frame) + scrollY;
    const project =
      location.pathname.startsWith('/work/') ||
      location.pathname === '/' ||
      location.pathname.startsWith('/shop');
    const past = project ? innerHeight * 0.12 : 0;
    return {
      project,
      start: Math.max(0, Math.round(top - innerHeight * 1.05 - 12)),
      end: Math.round(top + frame.offsetHeight + 24 + past),
    };
  });
  if (!range) {
    log(`ok   ${name}: no media`);
    await page.close();
    continue;
  }
  if (range.inView) {
    const stuck = await page.evaluate(() =>
      [...document.querySelectorAll('.scroll-media')].some((el) => parseFloat(getComputedStyle(el).opacity) < 0.95),
    );
    if (stuck) {
      log(`FAIL ${name}: in-view media below full opacity`);
      fail = 1;
    } else log(`ok   ${name}: ${range.inView} in-view`);
    await page.close();
    continue;
  }
  const read = () =>
    page.evaluate(() => {
      const frame = document.querySelector('[data-opacity-probe]');
      return frame ? parseFloat(getComputedStyle(frame).opacity) : -1;
    });
  const samples = [];
  const back = [];
  const steps = 48;
  let drop = false;
  let rise = false;
  for (let i = 0; i <= steps; i++) {
    const y = Math.round(range.start + ((range.end - range.start) * i) / steps);
    await page.evaluate((yy) => scrollTo(0, yy), y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const o = await read();
    samples.push(o);
    const prev = samples[samples.length - 2];
    if (prev !== undefined && o < prev - 0.02) drop = true;
  }
  for (let i = steps; i >= 0; i--) {
    const y = Math.round(range.start + ((range.end - range.start) * i) / steps);
    await page.evaluate((yy) => scrollTo(0, yy), y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const o = await read();
    back.push(o);
    const prev = back[back.length - 2];
    if (prev !== undefined && o > prev + 0.02) rise = true;
  }
  const final = samples[samples.length - 1];
  const returned = back[back.length - 1];
  let ok = !drop && !rise && final >= 0.99 && samples[0] <= 0.05 && returned <= 0.05;
  if (range.project) {
    const down = (() => {
      let peak = samples[0];
      let falling = false;
      let reversed = false;
      for (let i = 1; i < samples.length; i++) {
        const delta = samples[i] - samples[i - 1];
        if (!falling && delta < -0.02) falling = true;
        if (!falling) peak = Math.max(peak, samples[i]);
        if (falling && delta > 0.02) reversed = true;
      }
      return { peak, falling, reversed };
    })();
    const up = (() => {
      let peak = back[0];
      let rising = false;
      let falling = false;
      let reversed = false;
      for (let i = 1; i < back.length; i++) {
        const delta = back[i] - back[i - 1];
        if (!rising && delta > 0.02) rising = true;
        if (rising) peak = Math.max(peak, back[i]);
        if (rising && !falling && delta < -0.02) falling = true;
        if (falling && delta > 0.02) reversed = true;
      }
      return { peak, rising, falling, reversed };
    })();
    ok =
      samples[0] <= 0.05 &&
      final <= 0.05 &&
      returned <= 0.05 &&
      down.peak >= 0.99 &&
      down.falling &&
      !down.reversed &&
      up.peak >= 0.99 &&
      up.rising &&
      up.falling &&
      !up.reversed;
  }
  if (!ok) fail = 1;
  log(
    `${ok ? 'ok  ' : 'FAIL'} ${name}: start ${samples[0].toFixed(3)} end ${final.toFixed(3)} back ${returned.toFixed(3)} drop ${drop} rise ${rise}${range.project ? ' exit-fade' : ''}`,
  );
  log(`  ${name} samples: ${samples.map((n) => n.toFixed(3)).join(' ')}`);
  log(`  ${name} back: ${back.map((n) => n.toFixed(3)).join(' ')}`);
  await page.close();
  }
}

const outDir = process.env.ARTIFACTS || join(ROOT, 'artifacts');
mkdirSync(outDir, { recursive: true });
const out = join(outDir, 'opacity-per-frame.txt');
writeFileSync(out, lines.join('\n') + '\n');
log(`wrote ${out}`);

await browser.close();
server.close();
if (fail) {
  console.error('media-opacity-monotonic FAIL');
  process.exit(1);
}
console.log('media-opacity-monotonic OK');
