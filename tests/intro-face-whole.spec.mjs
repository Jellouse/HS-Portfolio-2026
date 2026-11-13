// The intro face stays whole through the shrink and the small face is there
// after it, on desktop and phone. Catches a face clipped by a hard edge (a
// GPU pass drawing into a stale region) or a face that vanishes mid-intro.
// Fake clock, screenshots, red pixels measured against the face slot.
// Usage: node tests/intro-face-whole.spec.mjs [--browser=chromium|webkit]
import { chromium, webkit } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const BROWSERS = (process.argv.find((a) => a.startsWith('--browser='))?.split('=')[1] ?? 'chromium,webkit').split(',');
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
await new Promise((r) => server.listen(4337, '127.0.0.1', r));

const SIZES = [
  { label: 'desktop', width: 1440, height: 900, dpr: 2 },
  { label: 'desktop-1x', width: 1440, height: 900, dpr: 1 },
  { label: 'phone', width: 390, height: 844, dpr: 3 },
];
const TIMES = [300, 900, 1500, 2100, 2700, 3300, 3900, 4500, 5100, 5700, 6300, 8200];

// Red face pixels, in CSS px.
const measure = async (buf, dpr) => {
  const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
  let n = 0, x0 = Infinity, x1 = -1, y0 = Infinity, y1 = -1;
  for (let y = 0; y < info.height; y += 2) {
    for (let x = 0; x < info.width; x += 2) {
      const i = (y * info.width + x) * info.channels;
      if (data[i] > 120 && data[i + 1] < 90 && data[i + 2] < 90) {
        n++;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return n ? { n, x0: x0 / dpr, x1: x1 / dpr, y0: y0 / dpr, y1: y1 / dpr } : { n: 0 };
};

const failures = [];
for (const name of BROWSERS) {
  const engine = name === 'webkit' ? webkit : chromium;
  const browser = await engine.launch();
  for (const size of SIZES) {
    const phone = size.width < 760;
    const ctx = await browser.newContext({ viewport: { width: size.width, height: size.height }, deviceScaleFactor: size.dpr, isMobile: phone && name !== 'firefox', hasTouch: phone });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-11-11T13:00:00+09:00') });
    await page.clock.pauseAt(new Date('2026-11-11T13:00:01+09:00'));
    await page.goto('http://127.0.0.1:4337/?t=12:00', { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    let at = 0;
    const rows = [];
    for (const t of TIMES) {
      await page.clock.runFor(t - at);
      at = t;
      await page.waitForTimeout(120);
      const slot = await page.evaluate(() => {
        const nav = document.querySelector('[data-arrow-nav]');
        const r = nav?.querySelector('.arrow-face-scale')?.getBoundingClientRect();
        return r && { cx: r.left + r.width / 2, cy: r.top + r.height / 2, w: r.width, h: r.height, intro: nav.classList.contains('is-intro') };
      });
      const m = await measure(await page.screenshot({ animations: 'allow' }), size.dpr);
      rows.push({ t, slot, m });
      const tag = `${name} ${size.label} t=${t}`;
      if (!slot) { failures.push(`${tag}: no face slot`); continue; }
      if (!m.n) { failures.push(`${tag}: no face on screen`); continue; }
      // Face drawn wider than the screen is clipped by the viewport, not by us.
      const left = m.x0 > 1 ? slot.cx - m.x0 : null;
      const right = m.x1 < size.width - 2 ? m.x1 - slot.cx : null;
      // The displaced face reaches about 0.7x as far left of the slot centre
      // as right of it (the filter offset). A clipped side drops well below.
      if (left !== null && right !== null && slot.intro) {
        const ratio = left / Math.max(1, right);
        if (ratio < 0.6 || ratio > 1.6) failures.push(`${tag}: face lopsided on its slot (left ${left.toFixed(0)}px, right ${right.toFixed(0)}px), clipped?`);
      }
    }
    const last = rows[rows.length - 1];
    if (last.slot?.intro) failures.push(`${name} ${size.label}: intro still running at ${last.t}ms`);
    if (last.m.n && last.slot && Math.max(last.m.x1 - last.m.x0, last.m.y1 - last.m.y0) > Math.max(last.slot.w, last.slot.h) * 1.6) {
      failures.push(`${name} ${size.label}: resting face larger than its slot`);
    }
    console.log(`${name} ${size.label}: ${rows.map((r) => `${r.t}:${r.m.n ? Math.round(r.m.x1 - r.m.x0) : 0}`).join(' ')}`);
    await ctx.close();
  }
  await browser.close();
}
server.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('intro face whole: ok');
