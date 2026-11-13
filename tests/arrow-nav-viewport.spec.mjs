// Simulate an X in-app visualViewport (tweet sheet, then dismissed chrome)
// and check that the arrow-nav stage follows the visible area.
//
// npm run build && npm run test:arrow-viewport
// ARROW_SHOTS=dir saves frames for review.
import { chromium, devices } from 'playwright';
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
await new Promise((r) => server.listen(4338, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4338/';

const SHOTS = process.env.ARROW_SHOTS || join(ROOT, 'docs/agents/evidence');
mkdirSync(SHOTS, { recursive: true });

const WIDTH = 390;
const FULL = 844;
const TWEET = 520;
const AFTER = 720;

const failures = [];
const browser = await chromium.launch();
const context = await browser.newContext({
  ...devices['iPhone 13'],
  viewport: { width: WIDTH, height: FULL },
  colorScheme: 'light',
});

await context.addInitScript(`(() => {
  const listeners = new Map();
  const state = { offsetTop: 0, offsetLeft: 0, width: ${WIDTH}, height: ${FULL}, scale: 1 };
  const vv = {
    get offsetTop() { return state.offsetTop; },
    get offsetLeft() { return state.offsetLeft; },
    get width() { return state.width; },
    get height() { return state.height; },
    get scale() { return state.scale; },
    addEventListener(type, fn) {
      const list = listeners.get(type) || [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type, fn) {
      const list = (listeners.get(type) || []).filter((item) => item !== fn);
      listeners.set(type, list);
    },
    dispatch(type) {
      (listeners.get(type) || []).forEach((fn) => fn());
    },
  };
  Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
  window.__setVisualViewport = (next) => {
    Object.assign(state, next);
    vv.dispatch('resize');
  };
})();`);

const page = await context.newPage();
await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

const setView = (height, extra = {}) => page.evaluate(([height, extra]) => {
  window.__setVisualViewport({ width: 390, height, offsetTop: 0, offsetLeft: 0, ...extra });
}, [height, extra]);

const metrics = () => page.evaluate(() => {
  const nav = document.querySelector('[data-arrow-nav], [data-services-hub], [data-service-steps], .arrow-nav');
  const face = nav && nav.querySelector('[data-nav-face], .arrow-face');
  const gallery = nav.querySelector('[data-nav-gallery]');
  const caption = nav.querySelector('[data-nav-caption]');
  const title = nav.querySelector('[data-nav-title]');
  const back = nav.querySelector('[data-dir="up"]');
  const n = nav.getBoundingClientRect();
  const faceHidden = !face || face.hidden || (face.closest('[hidden]') && face.closest('[hidden]') !== nav);
  const f = face && !faceHidden ? face.getBoundingClientRect() : null;
  const g = gallery && !gallery.hidden ? gallery.getBoundingClientRect() : null;
  const c = caption && !caption.hidden ? caption.getBoundingClientRect() : null;
  const t = title && !title.closest('[hidden]') ? title.getBoundingClientRect() : null;
  const b = back && !back.hidden ? back.getBoundingClientRect() : null;
  const inset = document.documentElement.hasAttribute('data-app-inset');
  const vh = getComputedStyle(document.documentElement).getPropertyValue('--app-vh').trim();
  const vt = getComputedStyle(document.documentElement).getPropertyValue('--app-vt').trim();
  const vv = window.visualViewport;
  return {
    inset,
    vh,
    vt,
    nav: { top: n.top, bottom: n.bottom, height: n.height, left: n.left, width: n.width },
    face: f && f.height ? { top: f.top, mid: f.top + f.height / 2, bottom: f.bottom } : null,
    gallery: g && g.height ? { top: g.top, mid: g.top + g.height / 2, bottom: g.bottom } : null,
    caption: c ? { top: c.top, bottom: c.bottom } : null,
    title: t ? { top: t.top, bottom: t.bottom } : null,
    back: b ? { top: b.top } : null,
    view: { top: vv.offsetTop, height: vv.height, bottom: vv.offsetTop + vv.height },
  };
});

const check = (label, m, height) => {
  const slack = 2;
  if (Math.abs(m.nav.top - m.view.top) > slack) failures.push(`${label}: stage top ${m.nav.top} not at visible top ${m.view.top}`);
  if (Math.abs(m.nav.height - height) > slack) failures.push(`${label}: stage height ${m.nav.height} want ${height}`);
  const mid = m.face?.mid ?? m.gallery?.mid;
  const midName = m.face ? 'face' : 'gallery';
  if (mid == null) failures.push(`${label}: no face or gallery to centre`);
  else if (Math.abs(mid - (m.view.top + height / 2)) > 24) {
    failures.push(`${label}: ${midName} centre ${mid.toFixed(1)} not in the visible middle ${m.view.top + height / 2}`);
  }
  if (m.caption && m.caption.bottom > m.view.bottom + slack) {
    failures.push(`${label}: caption bottom ${m.caption.bottom} is under the visible edge ${m.view.bottom}`);
  }
  if (m.title && m.title.top < m.view.top - slack) {
    failures.push(`${label}: title top ${m.title.top} is above the visible edge ${m.view.top}`);
  }
  if (m.back && m.back.top < m.view.top - slack) {
    failures.push(`${label}: back button top ${m.back.top} is above the visible edge ${m.view.top}`);
  }
};

// Gallery first so we do not wait on the intro.
await page.goto(`${BASE}#space`, { waitUntil: 'load' });
await page.waitForFunction(() => {
  const nav = document.querySelector('[data-arrow-nav]');
  return nav && nav.dataset.kind === 'gallery' && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
}, null, { timeout: 20000 });
await page.waitForTimeout(300);

const galleryFull = await metrics();
if (galleryFull.inset) failures.push('gallery at full height should not be inset');
check('gallery full', galleryFull, FULL);
await page.screenshot({ path: join(SHOTS, 'x-in-app-gallery-full.png'), scale: 'css' });

await setView(TWEET);
await page.waitForTimeout(200);
const galleryTweet = await metrics();
if (!galleryTweet.inset) failures.push('gallery with a tweet-sheet inset should set data-app-inset');
check('gallery tweet sheet', galleryTweet, TWEET);
await page.screenshot({ path: join(SHOTS, 'x-in-app-gallery-tweet.png'), scale: 'css' });

await setView(AFTER);
await page.waitForTimeout(200);
const galleryAfter = await metrics();
if (!galleryAfter.inset) failures.push('gallery after dismissing the tweet should still follow the remaining chrome');
check('gallery after tweet', galleryAfter, AFTER);
if (galleryAfter.nav.top > 8) failures.push(`gallery after tweet left a top gap (${galleryAfter.nav.top}px)`);
await page.screenshot({ path: join(SHOTS, 'x-in-app-gallery-after.png'), scale: 'css' });

await setView(FULL);
await page.waitForTimeout(200);
const galleryRestored = await metrics();
if (galleryRestored.inset) failures.push('gallery restored to 100svh should drop the inset');
check('gallery restored', galleryRestored, FULL);

await page.goto(`${BASE}`, { waitUntil: 'load' });
await page.waitForFunction(() => {
  const nav = document.querySelector('[data-arrow-nav]');
  return nav && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
}, null, { timeout: 20000 });
await page.waitForTimeout(300);

const landingFull = await metrics();
if (landingFull.inset) failures.push('landing at full height should not be inset');
check('landing full', landingFull, FULL);
await page.screenshot({ path: join(SHOTS, 'x-in-app-landing-full.png'), scale: 'css' });

await setView(TWEET);
await page.waitForTimeout(200);
const landingTweet = await metrics();
if (!landingTweet.inset) failures.push('landing with a tweet-sheet inset should set data-app-inset');
check('landing tweet sheet', landingTweet, TWEET);
await page.screenshot({ path: join(SHOTS, 'x-in-app-landing-tweet.png'), scale: 'css' });

await setView(AFTER);
await page.waitForTimeout(200);
const landingAfter = await metrics();
if (!landingAfter.inset) failures.push('landing after dismissing the tweet should still follow the remaining chrome');
check('landing after tweet', landingAfter, AFTER);
if (landingAfter.nav.top > 8) failures.push(`landing after tweet left a top gap (${landingAfter.nav.top}px)`);
await page.screenshot({ path: join(SHOTS, 'x-in-app-landing-after.png'), scale: 'css' });

const landingMid = landingAfter.face?.mid;
await page.click('[data-dir="down"]');
await page.waitForFunction(() => document.querySelector('[data-arrow-nav]')?.dataset.screen === 'about', null, { timeout: 8000 });
await page.waitForTimeout(200);
const aboutAfter = await metrics();
if (!aboutAfter.inset) failures.push('about after the tweet should keep data-app-inset');
check('about after tweet', aboutAfter, AFTER);
if (landingMid != null && aboutAfter.face && Math.abs(aboutAfter.face.mid - landingMid) > 8) {
  failures.push(`about face mid ${aboutAfter.face.mid.toFixed(1)} moved from landing ${landingMid.toFixed(1)}`);
}
await page.screenshot({ path: join(SHOTS, 'x-in-app-about-after.png'), scale: 'css' });

await page.goto(`${BASE}services/`, { waitUntil: 'load' });
await page.waitForSelector('[data-services-hub] .arrow-face', { timeout: 15000 });
await page.waitForTimeout(200);
await setView(AFTER);
await page.waitForTimeout(200);
const servicesAfter = await metrics();
if (!servicesAfter.inset) failures.push('services hub after the tweet should set data-app-inset');
check('services hub after tweet', servicesAfter, AFTER);
if (landingMid != null && servicesAfter.face && Math.abs(servicesAfter.face.mid - landingMid) > 8) {
  failures.push(`services face mid ${servicesAfter.face.mid.toFixed(1)} moved from landing ${landingMid.toFixed(1)}`);
}
await page.screenshot({ path: join(SHOTS, 'x-in-app-services-after.png'), scale: 'css' });

await page.goto(`${BASE}services/physical-build/`, { waitUntil: 'load' });
await page.waitForSelector('[data-service-steps]', { timeout: 15000 });
const stageWide = await page.evaluate(() => {
  const stage = document.querySelector('.service-step-stage');
  if (!stage) return null;
  const width = stage.getBoundingClientRect().width;
  const style = getComputedStyle(stage);
  const edge = parseFloat(style.getPropertyValue('--arrow-edge'));
  const margin = Number.isFinite(edge) && edge > 0
    ? edge
    : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--margin')) || 20;
  const control = parseFloat(style.getPropertyValue('--arrow-control')) || 48;
  return { width, margin, control, view: window.innerWidth };
});
if (!stageWide) failures.push('service detail has no text stage');
else if (stageWide.width < stageWide.view - 2 * stageWide.control - 2 * stageWide.margin - 20) {
  failures.push(`service text is too narrow (${stageWide.width}px in a ${stageWide.view}px view)`);
}

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('arrow-nav-viewport: ok');
