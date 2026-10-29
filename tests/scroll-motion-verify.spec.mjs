/**
 * Timed proof of the letter intro and the media fade-in.
 * Animations are paused at creation (capture hook) so frames land on exact times,
 * including before the intro would have finished during navigation.
 *
 *   npm run build && ARTIFACTS=/opt/cursor/artifacts node tests/scroll-motion-verify.spec.mjs
 */
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const ARTIFACTS = process.env.ARTIFACTS || join(ROOT, 'artifacts');
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.woff2': 'font/woff2',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) =>
  existsSync(join(d, 'index.html')),
);
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find(
    (f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile(),
  );
  if (!file) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
mkdirSync(ARTIFACTS, { recursive: true });
const tmpRoot = join(ARTIFACTS, 'scroll-motion-cells');
mkdirSync(tmpRoot, { recursive: true });
await new Promise((r) => server.listen(4338, '127.0.0.1', r));
const ORIGIN = 'http://127.0.0.1:4338';

function holdSource(pauseLetters) {
  return `(() => {
    const orig = Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      const anim = orig.call(this, keyframes, options);
      if (${pauseLetters} && this.classList && this.classList.contains('motion-letter')) {
        anim.pause();
        (window.__captureAnims ||= []).push(anim);
      }
      if (this.classList && this.classList.contains('frame')) {
        anim.pause();
        (window.__frameAnims ||= []).push(anim);
      }
      return anim;
    };
  })();`;
}

const browser = await chromium.launch();

async function composeGrid(name, cells) {
  const pad = 20;
  const sheet = await browser.newPage();
  const cols = 3;
  const cellW = cells[0].w;
  const rows = Math.ceil(cells.length / cols);
  const maxH = Math.max(...cells.map((c) => c.h));
  await sheet.setViewportSize({
    width: cols * cellW + pad * (cols + 1),
    height: rows * (maxH + 56) + pad * 2 + 36,
  });
  const figures = cells
    .map((c) => {
      const b64 = readFileSync(c.path).toString('base64');
      return `<figure style="width:${cellW}px"><figcaption>${c.label}</figcaption><img src="data:image/png;base64,${b64}" width="${c.w}" height="${c.h}" alt=""></figure>`;
    })
    .join('');
  const html = `<!doctype html><style>
    *{box-sizing:border-box;margin:0;font:13px/18px ui-monospace,Menlo,monospace}
    body{background:#111;color:#ddd;padding:${pad}px}
    h1{margin-bottom:12px;font-size:15px;color:#fff}
    .grid{display:grid;grid-template-columns:repeat(${cols},${cellW}px);gap:${pad}px;align-items:start}
    figcaption{min-height:40px;padding:0 0 6px;color:#9cf;white-space:pre-wrap}
    img{display:block;width:${cellW}px;height:auto;background:#fff}
  </style><body><h1>${name}</h1><div class="grid">${figures}</div></body>`;
  await sheet.setContent(html, { waitUntil: 'load' });
  await sheet.waitForTimeout(100);
  const out = join(ARTIFACTS, `${name}.png`);
  await sheet.screenshot({ path: out, fullPage: true });
  await sheet.close();
  console.log(`wrote ${out}`);
}

function context() {
  return browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'no-preference',
    deviceScaleFactor: 1,
  });
}

async function seek(page, ms) {
  await page.evaluate((t) => {
    for (const anim of window.__captureAnims || []) anim.currentTime = t;
  }, ms);
}

async function headerShot(page, path) {
  const box = await page.locator('.site-header').boundingBox();
  if (!box) throw new Error('no header');
  const y = Math.max(0, Math.floor(box.y - 16));
  const height = Math.min(900 - y, Math.ceil(box.height + 32));
  await page.screenshot({ path, clip: { x: 0, y, width: 1440, height } });
  return { w: 1440, h: height };
}

async function letterProbe(page) {
  return page.evaluate(() => {
    const ink = (el) => (el ? getComputedStyle(el).color : 'missing');
    const brand = document.querySelector('.brand-name .motion-letter');
    const nav = document.querySelector('.site-menu[data-main-menu] .motion-letter');
    const navLast = document.querySelector('.site-menu[data-main-menu] button:last-of-type .motion-letter:last-child');
    const n = document.querySelectorAll('.brand-name .motion-letter, .site-menu[data-main-menu] .motion-letter').length;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    return { brand: ink(brand), nav: ink(nav), navLast: ink(navLast), n, reduced, anims: (window.__captureAnims || []).length };
  });
}

const introTimes = [0, 150, 300, 450, 600, 900];
const introCtx = await context();
await introCtx.addInitScript({ content: holdSource(true) });
const introPage = await introCtx.newPage();
await introPage.goto(`${ORIGIN}/`, { waitUntil: 'load' });
await introPage.waitForFunction(() => (window.__captureAnims || []).length >= 20, null, { timeout: 15000 });
const probe0 = await letterProbe(introPage);
if (probe0.reduced) throw new Error('intro skipped: prefers-reduced-motion is reduce');
if (probe0.anims < 20) throw new Error(`intro did not start (${probe0.anims} animations)`);

const introCells = [];
for (const t of introTimes) {
  await seek(introPage, t);
  await introPage.waitForTimeout(30);
  const p = await letterProbe(introPage);
  const file = join(tmpRoot, `intro-${t}.png`);
  const size = await headerShot(introPage, file);
  introCells.push({
    path: file,
    w: size.w,
    h: size.h,
    label: `t=${t}ms\nHumansize ${p.brand}\nnav first ${p.nav}\nnav last ${p.navLast}`,
  });
  console.log(`intro t=${t} brand=${p.brand} nav=${p.nav} last=${p.navLast}`);
}
const endMs = await introPage.evaluate(() => {
  const anims = window.__captureAnims || [];
  return Math.max(...anims.map((a) => a.effect.getTiming().delay + a.effect.getTiming().duration));
});
await seek(introPage, endMs);
await introPage.waitForTimeout(30);
const pend = await letterProbe(introPage);
const endFile = join(tmpRoot, 'intro-end.png');
const endSize = await headerShot(introPage, endFile);
introCells.push({
  path: endFile,
  w: endSize.w,
  h: endSize.h,
  label: `t=${Math.round(endMs)}ms end\nHumansize ${pend.brand}\nnav first ${pend.nav}\nnav last ${pend.navLast}`,
});
console.log(`intro end t=${endMs} brand=${pend.brand} nav=${pend.nav} last=${pend.navLast}`);
await composeGrid('home-intro-desktop', introCells);
await introCtx.close();

function alphaOf(color) {
  const m = /rgba?\(([^)]+)\)/.exec(color);
  if (!m) return 1;
  const parts = m[1].split(',').map((s) => s.trim());
  if (parts.length < 4) return 1;
  return parseFloat(parts[3]);
}
const startA = alphaOf(introCells[0].label.split('\n')[1].replace('Humansize ', ''));
const midBrand = introCells.find((c) => c.label.startsWith('t=300'));
if (startA > 0.15) console.error('WARN intro t=0 Humansize is not light');
if (midBrand && alphaOf(midBrand.label.split('\n')[2].replace('nav ', '')) > 0.85 && alphaOf(midBrand.label.split('\n')[1].replace('Humansize ', '')) < 0.2) {
  console.error('WARN nav inked before Humansize');
}

async function frameOpacity(page) {
  return page.evaluate(() => {
    const frame = window.__frameAnims?.[0]?.effect?.target || document.querySelector('main .frame');
    if (!frame) return { opacity: -1, revealed: false };
    return {
      opacity: parseFloat(getComputedStyle(frame).opacity),
      revealed: frame.classList.contains('is-viewport-revealed'),
    };
  });
}

const mediaCtx = await context();
await mediaCtx.addInitScript({ content: holdSource(false) });
const mediaPage = await mediaCtx.newPage();
await mediaPage.goto(`${ORIGIN}/`, { waitUntil: 'load' });
await mediaPage.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, {
  timeout: 20000,
});
await mediaPage.evaluate(() => {
  const frame = document.querySelector('main .frame');
  const r = frame.getBoundingClientRect();
  scrollTo(0, Math.max(0, scrollY + r.top - innerHeight * 0.45));
});
await mediaPage.waitForFunction(() => (window.__frameAnims || []).length > 0, null, { timeout: 15000 });

async function shotMedia(page, file) {
  const clip = await page.evaluate(() => {
    const frame = window.__frameAnims[0].effect.target;
    const r = frame.getBoundingClientRect();
    const y = Math.max(0, Math.min(Math.floor(r.top - 24), 900 - 200));
    const height = Math.min(560, Math.max(200, Math.ceil(Math.min(r.bottom, 900) - y)));
    return { x: 0, y, width: 1440, height };
  });
  await page.screenshot({ path: file, clip });
  return clip;
}

const mediaCells = [];
async function pushMedia(label, file) {
  const o = await frameOpacity(mediaPage);
  const clip = await shotMedia(mediaPage, file);
  mediaCells.push({
    path: file,
    w: 640,
    h: Math.round((640 / clip.width) * clip.height),
    label: `${label}\nopacity ${o.opacity.toFixed(2)}`,
  });
  console.log(`${label} opacity=${o.opacity.toFixed(3)} revealed=${o.revealed}`);
  return o.opacity;
}

const frameAnimIndex = 0;
await mediaPage.evaluate((idx) => {
  window.__frameAnims[idx].currentTime = 0;
}, frameAnimIndex);
await pushMedia('entered, fade t=0', join(tmpRoot, 'media-0.png'));

for (const target of [0.3, 0.7]) {
  let lo = 0;
  let hi = 700;
  let opacity = 0;
  for (let i = 0; i < 10; i++) {
    const mid = (lo + hi) / 2;
    await mediaPage.evaluate(
      ({ idx, ms }) => {
        window.__frameAnims[idx].currentTime = ms;
      },
      { idx: frameAnimIndex, ms: mid },
    );
    opacity = (await frameOpacity(mediaPage)).opacity;
    if (opacity < target) lo = mid;
    else hi = mid;
  }
  await pushMedia(`about ${Math.round(target * 100)}% (t=${Math.round((lo + hi) / 2)}ms)`, join(tmpRoot, `media-${target}.png`));
}

await mediaPage.evaluate((idx) => {
  const anim = window.__frameAnims[idx];
  anim.currentTime = anim.effect.getTiming().duration;
}, frameAnimIndex);
await mediaPage.waitForTimeout(40);
const full = await pushMedia('fully visible', join(tmpRoot, 'media-full.png'));

await mediaPage.evaluate(() => {
  scrollTo(0, 0);
});
await mediaPage.waitForTimeout(80);
await mediaPage.evaluate((idx) => {
  const frame = window.__frameAnims[idx].effect.target;
  const r = frame.getBoundingClientRect();
  scrollTo(0, Math.max(0, scrollY + r.top - innerHeight * 0.35));
}, frameAnimIndex);
await mediaPage.waitForTimeout(80);
const back = await pushMedia('after scroll up and down', join(tmpRoot, 'media-back.png'));
await composeGrid('home-media-scroll-desktop', mediaCells);

if (full < 0.95) console.error('WARN full opacity', full);
if (back < 0.95) console.error('WARN opacity dropped after scroll', back);

await mediaCtx.close();

async function recordMp4(name, run) {
  const videoDir = join(ARTIFACTS, 'videos');
  mkdirSync(videoDir, { recursive: true });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'no-preference',
    recordVideo: { dir: videoDir, size: { width: 1440, height: 900 } },
  });
  const page = await ctx.newPage();
  await run(page);
  const webm = await page.video().path();
  await page.close();
  await ctx.close();
  const mp4 = join(ARTIFACTS, `${name}.mp4`);
  execFileSync(
    'ffmpeg',
    ['-y', '-i', webm, '-t', '5', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4],
    { stdio: 'ignore' },
  );
  console.log(`wrote ${mp4}`);
}

await recordMp4('home-intro-desktop', async (page) => {
  await page.goto(`${ORIGIN}/`, { waitUntil: 'commit' });
  await page.waitForTimeout(5000);
});

await recordMp4('atomic-scroll-desktop', async (page) => {
  await page.goto(`${ORIGIN}/work/atomic-ski/`, { waitUntil: 'load' });
  await page.waitForTimeout(1400);
  const max = await page.evaluate(() => Math.min(document.body.scrollHeight - innerHeight, 1600));
  const steps = 28;
  for (let i = 0; i <= steps; i++) {
    await page.evaluate((y) => scrollTo(0, y), Math.round((max * i) / steps));
    await page.waitForTimeout(120);
  }
});

await browser.close();
server.close();
console.log('verify done');
