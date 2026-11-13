// Every service step should fit between the back and Inquire buttons
// on phone and desktop, with no scrolling.
//
// npm run build && npm run test:service-steps
import { chromium } from 'playwright';
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
await new Promise((r) => server.listen(4347, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4347/';
const SHOTS = process.env.ARROW_SHOTS || join(ROOT, 'docs/agents/evidence');
mkdirSync(SHOTS, { recursive: true });

const failures = [];
const browser = await chromium.launch();
const pages = [
  { id: 'digital-build', path: 'services/digital-build/' },
  { id: 'physical-build', path: 'services/physical-build/' },
];
const views = [
  { name: 'phone', viewport: { width: 390, height: 844 }, edge: 16 },
  { name: 'desktop', viewport: { width: 1440, height: 900 }, edge: 48 },
];

const inspect = () => {
  const root = document.querySelector('[data-service-steps]');
  const stage = root?.querySelector('.service-step-stage');
  const step = root?.querySelector('.service-step:not([hidden])');
  const back = root?.querySelector('.arrow-back');
  const inquire = root?.querySelector('.service-inquire');
  const left = root?.querySelector(".arrow-pill[data-dir='left']");
  const right = root?.querySelector(".arrow-pill[data-dir='right']");
  if (!root || !stage || !step || !back || !inquire) return null;
  const slack = 1;
  const stageBox = stage.getBoundingClientRect();
  const stepBox = step.getBoundingClientRect();
  const backBox = back.getBoundingClientRect();
  const inquireBox = inquire.getBoundingClientRect();
  const gapTop = backBox.bottom;
  const gapBottom = inquireBox.top;
  const overflowY = stage.scrollHeight - stage.clientHeight;
  const overflowX = stage.scrollWidth - stage.clientWidth;
  const style = getComputedStyle(stage);
  const title = (step.querySelector('.service-step-title, .service-step-kicker, .service-step-body')?.textContent || '').trim().split('\n')[0].slice(0, 40);
  const frame = step.querySelector('.frame');
  const media = step.querySelector('.frame img, .frame video');
  let mediaRatio = null;
  if (frame && media) {
    const box = frame.getBoundingClientRect();
    const natural = media.tagName === 'VIDEO'
      ? { w: media.videoWidth, h: media.videoHeight }
      : { w: media.naturalWidth, h: media.naturalHeight };
    mediaRatio = {
      frame: box.height > 1 ? box.width / box.height : 0,
      natural: natural.h > 0 ? natural.w / natural.h : 0,
      frameW: box.width,
      frameH: box.height,
    };
  }
  return {
    title,
    isMedia: step.classList.contains('is-media'),
    hasText: !!step.querySelector('.service-step-body, .service-step-title, .service-step-kicker'),
    hasImages: !!step.querySelector('.service-step-images'),
    overflowY,
    overflowX,
    stageTop: stageBox.top,
    stageBottom: stageBox.bottom,
    stepTop: stepBox.top,
    stepBottom: stepBox.bottom,
    gapTop,
    gapBottom,
    fitsGap: stepBox.top + slack >= gapTop && stepBox.bottom - slack <= gapBottom,
    edge: parseFloat(style.getPropertyValue('--arrow-edge')),
    left: left ? left.getBoundingClientRect().left : null,
    right: right ? window.innerWidth - right.getBoundingClientRect().right : null,
    stepCount: root.querySelectorAll('[data-step]').length,
    mediaRatio,
  };
};

for (const view of views) {
  const page = await browser.newPage({ viewport: view.viewport, colorScheme: 'light' });
  await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  for (const entry of pages) {
    await page.goto(`${BASE}${entry.path}`, { waitUntil: 'load' });
    await page.waitForSelector('[data-service-steps] .service-step-stage', { timeout: 15000 });
    await page.evaluate(() => document.fonts.ready);
    const count = await page.evaluate(() => document.querySelectorAll('[data-service-steps] [data-step]').length);
    if (count < 2) failures.push(`${view.name} ${entry.id}: expected several steps, got ${count}`);
    for (let i = 0; i < count; i++) {
      if (i > 0) await page.click("[data-service-steps] .arrow-pill[data-dir='right']");
      await page.waitForFunction(() => {
        const step = document.querySelector('[data-service-steps] .service-step:not([hidden])');
        if (!step) return false;
        if (!step.classList.contains('is-media')) return true;
        const frame = step.querySelector('.frame');
        const media = step.querySelector('.frame img, .frame video');
        if (!frame || !media) return false;
        if (media.tagName === 'IMG' && media.naturalWidth < 2) return false;
        const box = frame.getBoundingClientRect();
        return box.width > 40 && box.height > 40;
      }, { timeout: 10000 });
      const info = await page.evaluate(inspect);
      const label = `${view.name} ${entry.id} step ${i + 1}${info?.title ? ` (${info.title})` : ''}`;
      if (!info) {
        failures.push(`${label}: missing layout`);
        continue;
      }
      if (Math.abs(info.edge - view.edge) > 0.5) {
        failures.push(`${label}: --arrow-edge is ${info.edge}, want ${view.edge}`);
      }
      if (info.overflowY > 1) failures.push(`${label}: stage scrolls vertically by ${info.overflowY.toFixed(1)}px`);
      if (info.overflowX > 1) failures.push(`${label}: stage scrolls horizontally by ${info.overflowX.toFixed(1)}px`);
      if (!info.fitsGap) {
        failures.push(`${label}: content ${info.stepTop.toFixed(1)}–${info.stepBottom.toFixed(1)} leaves the button gap ${info.gapTop.toFixed(1)}–${info.gapBottom.toFixed(1)}`);
      }
      if (info.isMedia && info.hasText && info.hasImages === false) {
        failures.push(`${label}: media step is missing its image`);
      }
      if (!info.isMedia && info.hasImages) {
        failures.push(`${label}: text step also includes an image`);
      }
      if (info.isMedia) {
        if (!info.mediaRatio || info.mediaRatio.frameW < 40 || info.mediaRatio.frameH < 40) {
          failures.push(`${label}: media frame is missing or collapsed (${info.mediaRatio?.frameW ?? 0}×${info.mediaRatio?.frameH ?? 0})`);
        } else if (info.mediaRatio.natural > 0) {
          const drift = Math.abs(info.mediaRatio.frame - info.mediaRatio.natural) / info.mediaRatio.natural;
          if (drift > 0.03) {
            failures.push(`${label}: frame ratio ${info.mediaRatio.frame.toFixed(3)} does not match image ${info.mediaRatio.natural.toFixed(3)}`);
          }
        }
      }
      if (/^FAQ$/i.test(info.title || '')) {
        const exclusive = await page.evaluate(() => {
          const items = [...document.querySelectorAll('[data-service-steps] .service-step:not([hidden]) .service-faq')];
          if (items.length < 2) return { ok: true, reason: 'fewer than two items' };
          items[0].open = true;
          items[1].open = true;
          const open = items.filter((d) => d.open).length;
          items.forEach((d) => { d.open = false; });
          return { ok: open === 1, open };
        });
        if (!exclusive.ok) {
          failures.push(`${label}: expected one open FAQ, got ${exclusive.open}`);
        }
      }
      const shotName = `${view.name}-${entry.id}-step-${String(i + 1).padStart(2, '0')}.png`;
      if (i === 0 || info.isMedia || /aluminium|3d print|framer|faq/i.test(info.title || '')) {
        await page.screenshot({ path: join(SHOTS, `service-fit-${shotName}`), scale: 'css' });
      }
    }
  }
  await page.close();
}

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('service-steps-layout: ok');
