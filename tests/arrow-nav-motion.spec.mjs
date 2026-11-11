// Drives the homepage arrow nav through its transitions, freezes each one at
// several points mid-flight, and checks that no moving control paints on the
// wrong side of the hub. Each direction owns the half-plane on its side of
// the hub centre. A control that leaves or arrives has to stay inside it, so it
// slides out of and into the face instead of across open page background.
//
// npm run build && npm run test:arrow-motion
// ARROW_SHOTS=dir saves one mid-flight frame per step for review.
import { chromium, devices } from 'playwright';
import sharp from 'sharp';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
if (!root) { console.error('Run npm run build first.'); process.exit(1); }
const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find((f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile());
  if (!file) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4336, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4336/';

const SHOTS = process.env.ARROW_SHOTS || '';
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const SAMPLES = [30, 60, 120, 200, 300, 420];
const SHOT_AT = Number(process.env.ARROW_SHOT_AT || 200);
// A pixel counts as painted by a control when a channel moves this much.
const INK = 24;
// Antialiasing on the hub line is allowed to spill this far.
const EDGE = 1;
// Stray pixels tolerated per direction and frame.
const STRAY = 3;

const failures = [];
const browser = await chromium.launch();

const allTargets = [
  { name: 'desktop', options: { viewport: { width: 1440, height: 900 } }, touch: false },
  // The size of the browser window in the bug recording.
  { name: 'laptop', options: { viewport: { width: 920, height: 574 }, deviceScaleFactor: 2 }, touch: false },
  { name: 'iphone', options: { ...devices['iPhone 13'], viewport: { width: 390, height: 844 } }, touch: true },
];

const only = (process.env.ARROW_TARGETS || '').split(',').filter(Boolean);
const targets = only.length ? allTargets.filter((t) => only.includes(t.name)) : allTargets;
for (const target of targets) {
  const context = await browser.newContext({ ...target.options, colorScheme: 'light' });
  const page = await context.newPage();
  await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForFunction(() => {
    const nav = document.querySelector('[data-arrow-nav]');
    return nav && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
  }, null, { timeout: 20000 });
  await page.waitForTimeout(400);

  const mark = () => page.evaluate(() => { window.__pre = new Set(document.getAnimations()); });

  const fresh = () => page.waitForFunction(() => document.getAnimations().some((a) => !window.__pre.has(a)), null, { timeout: 3000 });

  const freeze = (at) => page.evaluate(async (at) => {
    // Let pending style changes (the pressed colour fading out) start first.
    await new Promise((r) => requestAnimationFrame(() => r()));
    getComputedStyle(document.body).color;
    const all = document.getAnimations();
    all.forEach((a) => a.pause());
    if (at != null) all.filter((a) => !window.__pre.has(a)).forEach((a) => { a.currentTime = at; });
  }, at);

  const resume = () => page.evaluate(() => document.getAnimations().forEach((a) => a.play()));

  const press = async (dir) => {
    const box = await page.evaluate((dir) => {
      const el = document.querySelector(`[data-arrow-nav] [data-dir="${dir}"]:not(.arrow-flight)`);
      if (!el || el.hidden) return null;
      const r = el.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }, dir);
    if (!box) throw new Error(`${dir} control is not on screen`);
    if (target.touch) await page.touchscreen.tap(box.x, box.y);
    else {
      await page.mouse.click(box.x, box.y);
      // Park the pointer so hover colour does not change between captures.
      await page.mouse.move(1, 1);
    }
  };

  const back = () => page.evaluate(() => history.back());

  // Everything moving, grouped by the direction that owns it.
  const moving = () => page.evaluate(() => {
    const nav = document.querySelector('[data-arrow-nav]');
    const slot = nav.querySelector('.arrow-slot').getBoundingClientRect();
    const hub = { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 };
    const groups = {};
    nav.querySelectorAll('[data-dir], [data-ghost-dir]').forEach((el) => {
      const ghost = el.classList.contains('arrow-flight');
      const dir = el.dataset.dir || el.dataset.ghostDir;
      const flying = el.getAnimations().some((a) => !window.__pre.has(a) && a.effect?.getKeyframes().some((k) => k.transform));
      if (!ghost && !flying) return;
      (groups[dir] ||= []).push(el);
    });
    window.__groups = groups;
    const face = nav.querySelector('[data-nav-face]');
    const f = face && !face.hidden ? face.querySelector('[data-nav-scale]').getBoundingClientRect() : null;
    const disc = f && f.width ? { x: f.left + f.width / 2, y: f.top + f.height / 2, r: Math.min(f.width, f.height) / 2 } : null;
    return { hub, disc, dirs: Object.keys(groups) };
  });

  const setHidden = (dir, hidden) => page.evaluate(([dir, hidden]) => {
    window.__groups[dir].forEach((el) => { el.style.visibility = hidden ? 'hidden' : ''; });
  }, [dir, hidden]);

  const raw = async () => {
    const buf = await page.screenshot({ scale: 'css' });
    const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    return { data, width: info.width, height: info.height, buf };
  };

  const outside = (dir, x, y, hub) => {
    if (dir === 'left') return x + 0.5 > hub.x + EDGE;
    if (dir === 'right') return x + 0.5 < hub.x - EDGE;
    if (dir === 'up') return y + 0.5 > hub.y + EDGE;
    return y + 0.5 < hub.y - EDGE;
  };

  const checkMask = async (label) => {
    const { hub, disc, dirs } = await moving();
    if (!dirs.length) return null;
    // Touch every group once so the frozen frame is painted the same way
    // (main thread, not compositor) in every capture below.
    for (const dir of dirs) await setHidden(dir, true);
    await raw();
    for (const dir of dirs) await setHidden(dir, false);
    const full = await raw();
    // A second plain frame marks pixels that change on their own (the face).
    const again = await raw();
    for (const dir of dirs) {
      await setHidden(dir, true);
      const bare = await raw();
      await setHidden(dir, false);
      let stray = 0;
      let box = null;
      for (let y = 0; y < full.height; y++) {
        for (let x = 0; x < full.width; x++) {
          const i = (y * full.width + x) * 4;
          const d = Math.max(Math.abs(full.data[i] - bare.data[i]), Math.abs(full.data[i + 1] - bare.data[i + 1]), Math.abs(full.data[i + 2] - bare.data[i + 2]));
          if (d < INK || !outside(dir, x, y, hub)) continue;
          const noise = Math.max(Math.abs(full.data[i] - again.data[i]), Math.abs(full.data[i + 1] - again.data[i + 1]), Math.abs(full.data[i + 2] - again.data[i + 2]));
          if (noise >= INK) continue;
          // The face sits on top of every control, so nothing under it is visible.
          if (disc && Math.hypot(x + 0.5 - disc.x, y + 0.5 - disc.y) < disc.r - EDGE) continue;
          stray += 1;
          box = box ? { l: Math.min(box.l, x), t: Math.min(box.t, y), r: Math.max(box.r, x), b: Math.max(box.b, y) } : { l: x, t: y, r: x, b: y };
        }
      }
      if (process.env.ARROW_DEBUG && stray > STRAY) {
        const tag = `${target.name}-${label}-${dir}`.replace(/[^\w@-]+/g, '_');
        await sharp(full.buf).toFile(join(process.env.ARROW_DEBUG, `${tag}-full.png`));
        await sharp(bare.data, { raw: { width: bare.width, height: bare.height, channels: 4 } }).png().toFile(join(process.env.ARROW_DEBUG, `${tag}-bare.png`));
      }
      if (stray > STRAY) failures.push(`${target.name} ${label}: ${dir} paints ${stray}px past the hub (${box.l},${box.t} to ${box.r},${box.b}; hub ${Math.round(hub.x)},${Math.round(hub.y)})`);
    }
    return full.buf;
  };

  const settle = async (label, screen) => {
    await page.waitForTimeout(900);
    const state = await page.evaluate(() => {
      const nav = document.querySelector('[data-arrow-nav]');
      const ghosts = nav.querySelectorAll('.arrow-flight, .arrow-clip').length + document.querySelectorAll('.arrow-copy-ghost').length;
      const pinned = nav.dataset.kind === 'gallery'
        ? []
        : [...nav.querySelectorAll('[data-dir]')].filter((el) => !el.hidden && (el.style.position || el.style.transform || el.style.clipPath)).map((el) => el.dataset.dir);
      const flying = [...nav.querySelectorAll('[data-dir]')].filter((el) => el.getAnimations().length).map((el) => el.dataset.dir);
      return { screen: nav.dataset.screen, ghosts, pinned, flying };
    });
    if (state.screen !== screen) failures.push(`${target.name} ${label}: ended on ${state.screen}, expected ${screen}`);
    if (state.ghosts) failures.push(`${target.name} ${label}: ${state.ghosts} stale clones left after settling`);
    if (state.pinned.length) failures.push(`${target.name} ${label}: ${state.pinned.join(', ')} still pinned after settling`);
    if (state.flying.length) failures.push(`${target.name} ${label}: ${state.flying.join(', ')} still animating after settling`);
  };

  const step = async (label, act, screen) => {
    await mark();
    await act();
    await fresh();
    for (const at of SAMPLES) {
      await freeze(at);
      const buf = await checkMask(`${label} @${at}ms`);
      if (SHOTS && buf && at === SHOT_AT) await sharp(buf).toFile(join(SHOTS, `${target.name}-${label}.png`));
    }
    await resume();
    await settle(label, screen);
  };

  await step('landing-to-physical', () => press('right'), 'physical');
  await step('physical-to-landing', () => press('up'), 'landing');
  await step('landing-to-digital', () => press('left'), 'digital');
  await step('digital-to-web', () => press('left'), 'web');
  await step('web-to-digital', () => press('up'), 'digital');
  await step('digital-to-landing', () => press('up'), 'landing');
  await step('landing-to-physical-2', () => press('right'), 'physical');
  await step('physical-to-space', () => press('right'), 'space');
  await step('space-browser-back', back, 'physical');
  await step('physical-browser-back', back, 'landing');
  await step('landing-to-about', () => press('down'), 'about');
  await step('about-to-landing', () => press('up'), 'landing');
  // Leaving the about screen after reading down the page: the page jumps
  // back to the top in the same frame the controls start to move.
  await step('landing-to-about-2', () => press('down'), 'about');
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.waitForTimeout(200);
  const scrolled = await page.evaluate(() => window.scrollY);
  if (!scrolled) failures.push(`${target.name}: the about screen did not scroll`);
  await step('about-scrolled-escape', () => page.keyboard.press('Escape'), 'landing');
  await step('landing-to-shop', () => press('up'), 'shop');
  await step('shop-to-landing', () => press('up'), 'landing');

  // Rapid taps: each one lands while the last transition is still moving.
  const rapid = [
    ['right', 140],
    ['up', 110],
    ['left', 90],
    ['left', 160],
    ['up', 70],
    ['up', 0],
  ];
  for (const [i, [dir, wait]] of rapid.entries()) {
    await mark();
    await press(dir);
    await fresh();
    await freeze(null);
    await checkMask(`rapid tap ${i + 1} (${dir})`);
    await resume();
    if (wait) await page.waitForTimeout(wait);
  }
  for (const at of SAMPLES) {
    await freeze(at);
    await checkMask(`rapid final @${at}ms`);
  }
  await resume();
  await settle('rapid taps', 'landing');
  await context.close();
}

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('arrow-nav-motion: ok');
