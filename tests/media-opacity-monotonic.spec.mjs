import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync, writeFileSync } from 'node:fs';
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

const browser = await chromium.launch();
for (const [name, url, width] of [
  ['home 390', '/', 390],
  ['home 1440', '/', 1440],
  ['atomic 390', '/work/atomic-ski/', 390],
  ['atomic 1440', '/work/atomic-ski/', 1440],
]) {
  const page = await browser.newPage({
    viewport: { width, height: width < 700 ? 844 : 900 },
    isMobile: width < 700,
    hasTouch: width < 700,
    reducedMotion: 'no-preference',
  });
  await page.goto(`http://127.0.0.1:4344${url}`, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, { timeout: 20000 });
  const range = await page.evaluate(() => {
    const frames = [...document.querySelectorAll('main .frame')];
    const frame = frames.find((el) => el.getBoundingClientRect().top > innerHeight + 40) || frames.at(-1);
    if (!frame) return null;
    frame.setAttribute('data-opacity-probe', '1');
    const top = frame.getBoundingClientRect().top + scrollY;
    return { start: Math.max(0, Math.round(top - innerHeight - 12)), end: Math.round(top + frame.offsetHeight + 24) };
  });
  if (!range) {
    log(`FAIL ${name}: no frame`);
    fail = 1;
    await page.close();
    continue;
  }
  const samples = [];
  const steps = 48;
  let drop = false;
  for (let i = 0; i <= steps; i++) {
    const y = Math.round(range.start + ((range.end - range.start) * i) / steps);
    await page.evaluate((yy) => scrollTo(0, yy), y);
    await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
    const o = await page.evaluate(() => {
      const frame = document.querySelector('[data-opacity-probe]');
      return frame ? parseFloat(getComputedStyle(frame).opacity) : -1;
    });
    samples.push(o);
    const prev = samples[samples.length - 2];
    if (prev !== undefined && o < prev - 0.02) drop = true;
  }
  const final = samples[samples.length - 1];
  const ok = !drop && final >= 0.99 && samples[0] <= 0.05;
  if (!ok) fail = 1;
  log(`${ok ? 'ok  ' : 'FAIL'} ${name}: start ${samples[0].toFixed(3)} end ${final.toFixed(3)} drop ${drop}`);
  log(`  ${name} samples: ${samples.map((n) => n.toFixed(3)).join(' ')}`);
  await page.close();
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
