import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
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
await new Promise((r) => server.listen(4339, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4339/';

const failures = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
await page.goto(`${BASE}#space`, { waitUntil: 'load' });
await page.waitForFunction(() => {
  const nav = document.querySelector('[data-arrow-nav]');
  return nav && nav.dataset.kind === 'gallery' && nav.classList.contains('is-controls') && !nav.classList.contains('is-intro');
}, null, { timeout: 20000 });
await page.waitForTimeout(300);

const hoverable = await page.evaluate(() => matchMedia('(hover: hover) and (pointer: fine)').matches);
const state = () => {
  const hud = document.querySelector('[data-nav-scrub]');
  const box = hud?.getBoundingClientRect();
  const current = document.querySelector('.arrow-scrub-num.is-on');
  const track = hud?.querySelector('[data-nav-scrub-track]');
  const tx = track?.style.transform.match(/translate3d\((-?[\d.]+)px/);
  const dots = [...document.querySelectorAll('.arrow-dot')].map((el) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, right: r.right, x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  return {
    dots,
    index: [...document.querySelectorAll('.arrow-dot')].findIndex((el) => el.classList.contains('is-on')),
    hidden: !!hud?.hidden,
    num: (current?.textContent || '').trim(),
    tx: tx ? Number(tx[1]) : NaN,
    hudLeft: box ? Math.round(box.left) : 0,
    hudRight: box ? Math.round(box.right) : 0,
    hudMid: box ? Math.round(box.left + box.width / 2) : 0,
    full: !!document.querySelector('[data-arrow-nav]')?.classList.contains('is-full'),
  };
};

const start = await page.evaluate(state);
if (start.dots.length < 4) failures.push(`expected a multi-slide gallery, got ${start.dots.length} dots`);
if (start.hidden !== true) failures.push('scrub HUD was visible before hover');

if (!hoverable) {
  failures.push('this browser did not report a fine hover pointer');
} else {
  await page.mouse.move(start.dots[0].x, start.dots[0].y, { steps: 2 });
  await page.waitForTimeout(150);
  const first = await page.evaluate(state);
  if (first.hidden) failures.push('scrub HUD did not show on hover');
  if (first.num !== '1') failures.push(`hovering the first dot showed ${first.num}`);
  if (Math.abs(first.hudMid - Math.round(start.dots[0].x)) > 2) {
    failures.push(`HUD was not centred on the cursor at the first dot (${first.hudMid} vs ${Math.round(start.dots[0].x)})`);
  }
  if (first.index !== start.index) failures.push(`hover changed the slide (${start.index} -> ${first.index})`);

  const last = start.dots[start.dots.length - 1];
  await page.mouse.move(last.x, last.y, { steps: 2 });
  await page.waitForTimeout(150);
  const end = await page.evaluate(state);
  if (end.num !== String(end.dots.length)) failures.push(`hovering the last dot showed ${end.num}`);
  if (Math.abs(end.hudMid - Math.round(last.x)) > 2) {
    failures.push(`HUD was not centred on the cursor at the last dot (${end.hudMid} vs ${Math.round(last.x)})`);
  }

  for (const i of [1, Math.floor(start.dots.length / 2), start.dots.length - 2]) {
    await page.mouse.move(start.dots[i].x, start.dots[i].y, { steps: 2 });
    await page.waitForTimeout(80);
    const at = await page.evaluate(state);
    if (at.num !== String(i + 1)) failures.push(`hovering dot ${i + 1} showed ${at.num}`);
  }

  const a = start.dots[3];
  const b = start.dots[4];
  const steps = [];
  for (let i = 0; i <= 4; i += 1) {
    await page.mouse.move(a.x + ((b.x - a.x) * i) / 4, a.y, { steps: 1 });
    await page.waitForTimeout(60);
    steps.push((await page.evaluate(state)).tx);
  }
  if (new Set(steps).size !== steps.length) failures.push(`numbers did not slide between dots (${steps.join(', ')})`);
  if (!steps.every((n, i) => i === 0 || n < steps[i - 1])) failures.push(`numbers did not move leftwards (${steps.join(', ')})`);

  const pad = await page.evaluate(() => {
    const el = document.querySelector('[data-nav-dots]');
    const box = el.getBoundingClientRect();
    const dots = [...el.children].map((dot) => dot.getBoundingClientRect());
    const top = Math.min(...dots.map((dot) => dot.top));
    const bottom = Math.max(...dots.map((dot) => dot.bottom));
    return { up: Math.round(top - box.top), down: Math.round(box.bottom - bottom) };
  });
  if (Math.abs(pad.up - pad.down) > 1) failures.push(`hover target is asymmetric (${pad.up}px above, ${pad.down}px below)`);

  for (const [side, y] of [['above', a.y - pad.up / 2], ['below', a.y + pad.down / 2]]) {
    await page.mouse.move(a.x, y, { steps: 2 });
    await page.waitForTimeout(120);
    const near = await page.evaluate(state);
    if (near.hidden) failures.push(`no HUD ${side} the dots`);
    if (near.num !== '4') failures.push(`HUD ${side} the dots showed ${near.num}`);
  }

  const grab = await page.evaluate(() => {
    const el = document.querySelector('[data-nav-dots]');
    const box = el.getBoundingClientRect();
    const dots = [...el.children].map((dot) => dot.getBoundingClientRect());
    const firstDot = dots[0];
    return {
      left: box.left,
      right: box.right,
      firstLeft: firstDot.left,
      lastRight: dots[dots.length - 1].right,
      y: firstDot.top + firstDot.height / 2,
    };
  });
  if (grab.firstLeft - grab.left < 4) failures.push(`no grab room before the first dot (${Math.round(grab.firstLeft - grab.left)}px)`);
  for (const [side, x] of [['left', grab.left + 6], ['right', grab.right - 6]]) {
    await page.mouse.move(x, grab.y, { steps: 2 });
    await page.waitForTimeout(120);
    const held = await page.evaluate(state);
    const want = side === 'left' ? '1' : String(held.dots.length);
    if (held.hidden) failures.push(`no HUD in the ${side} grab area`);
    if (held.num !== want) failures.push(`${side} grab area showed ${held.num}`);
  }

  const mark = await page.evaluate(() => {
    const dots = [...document.querySelectorAll('.arrow-dot')];
    const on = dots.map((dot, i) => (dot.classList.contains('is-hover') ? i : -1)).filter((i) => i >= 0);
    return {
      on,
      bg: on.map((i) => getComputedStyle(dots[i]).backgroundColor),
      ink: getComputedStyle(document.querySelector('[data-arrow-nav]')).getPropertyValue('--ink').trim(),
    };
  });
  const wantInk = mark.ink === '#fff' || mark.ink === 'rgb(255, 255, 255)' ? 'rgb(255, 255, 255)' : 'rgb(0, 0, 0)';
  if (mark.on.length !== 1) failures.push(`${mark.on.length} dots highlighted while hovering the right grab area`);
  if (mark.on[0] !== start.dots.length - 1) failures.push(`highlighted dot ${mark.on[0] + 1}, expected the last`);
  if (mark.bg[0] !== wantInk) failures.push(`highlighted dot is ${mark.bg[0]}, expected ${wantInk}`);

  const activeIndex = start.index;
  await page.mouse.move(start.dots[activeIndex].x, start.dots[activeIndex].y, { steps: 2 });
  await page.waitForTimeout(120);
  const overActive = await page.evaluate((i) => {
    const dots = [...document.querySelectorAll('.arrow-dot')];
    return { hover: dots[i].classList.contains('is-hover'), bg: getComputedStyle(dots[i]).backgroundColor };
  }, activeIndex);
  if (overActive.hover) failures.push('the active dot took the hover highlight');

  await page.mouse.move(40, 40);
  await page.waitForTimeout(150);
  const cleared = await page.evaluate(() => document.querySelectorAll('.arrow-dot.is-hover').length);
  if (cleared) failures.push(`hover highlight stayed after leaving (${cleared})`);

  const now = await page.evaluate(state);
  const from = now.dots[7];
  const to = now.dots[8];
  const aimX = Math.round(from.x + (to.x - from.x) * 0.7);
  await page.mouse.move(aimX, from.y, { steps: 2 });
  await page.waitForTimeout(80);
  const aimed = await page.evaluate(state);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(600);
  const clicked = await page.evaluate(state);
  if (clicked.index + 1 !== Number(aimed.num)) failures.push(`click went to ${clicked.index + 1} but the HUD showed ${aimed.num}`);
  if (clicked.full) failures.push('a dot click opened fullscreen');

  await page.mouse.move(40, 40);
  await page.waitForTimeout(150);
  if (!(await page.evaluate(state)).hidden) failures.push('scrub HUD stayed visible after leaving the dots');
}

await page.close();
await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('arrow-nav-hover: ok');
