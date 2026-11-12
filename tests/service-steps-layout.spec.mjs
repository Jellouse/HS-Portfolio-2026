// Service-step center copy must not run into the L/R buttons. On a phone the
// text fades out with a gradient mask before the arrows; the arrows sit on a
// tight edge pad, not the page margin.
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
await new Promise((r) => server.listen(4341, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4341/';

const SHOTS = process.env.SERVICE_SHOTS || join(ROOT, 'docs/agents/evidence');
mkdirSync(SHOTS, { recursive: true });

const failures = [];
const must = (ok, msg) => { if (!ok) failures.push(msg); };
const overlap = (a, b) => {
  const w = Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x));
  const h = Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
  return w * h;
};

const viewports = {
  phone: { width: 390, height: 844, edge: 16, maxEdge: 20, fade: true },
  desktop: { width: 1440, height: 900, edge: 48, maxEdge: 64, fade: false },
};

const pages = ['services/digital-build/', 'services/physical-build/'];

const inspect = (expectFade) => {
  const box = (el) => {
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height };
  };
  const overlap = (a, b) => {
    const w = Math.max(0, Math.min(a.r, b.r) - Math.max(a.x, b.x));
    const h = Math.max(0, Math.min(a.b, b.b) - Math.max(a.y, b.y));
    return w * h;
  };
  const inkRects = (root) => {
    const rects = [];
    const walk = (node) => {
      if (node.nodeType === 3) {
        const text = node.textContent || '';
        if (!text.trim()) return;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const r of range.getClientRects()) {
          if (r.width >= 1 && r.height >= 1) rects.push({ x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height, t: text.trim().slice(0, 40) });
        }
        return;
      }
      if (node.nodeType === 1 && !node.hidden) [...node.childNodes].forEach(walk);
    };
    walk(root);
    return rects;
  };
  const root = document.querySelector('[data-service-steps]');
  const stage = root?.querySelector('.service-step-stage');
  const buttons = [...root?.querySelectorAll('.arrow-pill[data-dir="left"], .arrow-pill[data-dir="right"]') || []].map((el) => ({ dir: el.dataset.dir, hidden: el.hidden, box: box(el) })).filter((el) => el.box);
  const copy = root?.querySelector('[data-step]:not([hidden])');
  const cs = stage ? getComputedStyle(stage) : null;
  const host = root ? getComputedStyle(root) : null;
  return {
    vw: innerWidth,
    vh: innerHeight,
    edge: host ? parseFloat(host.getPropertyValue('--arrow-edge')) : NaN,
    fade: host ? parseFloat(host.getPropertyValue('--stage-fade')) : NaN,
    mask: cs ? (cs.maskImage || cs.webkitMaskImage || 'none') : 'none',
    stage: box(stage),
    buttons,
    ink: copy ? inkRects(copy) : [],
  };
};

const browser = await chromium.launch();

for (const [name, vp] of Object.entries(viewports)) {
  for (const path of pages) {
    const id = path.split('/').filter(Boolean).pop();
    const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'load', timeout: 30000 });
    await page.waitForSelector('[data-service-steps] .service-step-stage', { timeout: 15000 });
    await page.waitForTimeout(200);
    const data = await page.evaluate(inspect, vp.fade);
    const tag = `${name} ${id}`;

    must(Number.isFinite(data.edge) && Math.round(data.edge) === vp.edge, `${tag}: --arrow-edge is ${data.edge}, expected ${vp.edge}`);

    for (const btn of data.buttons) {
      const inset = btn.dir === 'left' ? btn.box.x : data.vw - btn.box.r;
      // A scrollbar can grow the right inset a little; the left edge is the source of truth.
      const slack = btn.dir === 'right' ? 16 : 1;
      must(Math.abs(inset - vp.edge) <= slack || (btn.dir === 'right' && inset >= vp.edge && inset <= vp.maxEdge + slack),
        `${tag}: ${btn.dir} button inset ${inset.toFixed(1)}px, expected about ${vp.edge}px`);
      must(inset + 0.5 >= 12, `${tag}: ${btn.dir} button crowds the edge (${inset.toFixed(1)}px)`);
      must(inset <= vp.maxEdge + slack, `${tag}: ${btn.dir} button was not moved outward (${inset.toFixed(1)}px, max ${vp.maxEdge}px)`);
      must(Math.abs(btn.box.x - Math.round(btn.box.x)) < 0.51 && Math.abs(btn.box.w - Math.round(btn.box.w)) < 0.51,
        `${tag}: ${btn.dir} button is not whole pixels (${btn.box.x}, ${btn.box.w})`);
    }

    if (vp.fade) {
      must(/linear-gradient/i.test(data.mask), `${tag}: stage is missing a gradient mask (${data.mask})`);
      must(data.fade >= 24, `${tag}: --stage-fade is ${data.fade}, expected at least 24px`);
    }

    const fade = vp.fade ? data.fade || 24 : 0;
    // The mask does not shrink getClientRects, so visible copy is the ink
    // clipped to the unfaded core of the stage.
    const core = data.stage && fade
      ? { x: data.stage.x + fade, r: data.stage.r - fade, y: data.stage.y, b: data.stage.b }
      : data.stage;
    for (const btn of data.buttons) {
      for (const ink of data.ink) {
        const visible = core
          ? { ...ink, x: Math.max(ink.x, core.x), r: Math.min(ink.r, core.r) }
          : ink;
        if (visible.r <= visible.x) continue;
        const area = overlap(visible, btn.box);
        must(area < 0.5, `${tag}: text "${ink.t}" overlaps the ${btn.dir} button by ${area.toFixed(1)}px²`);
        const vertically = Math.min(visible.b, btn.box.b) - Math.max(visible.y, btn.box.y) > 0;
        if (!vertically) continue;
        const gap = btn.dir === 'left' ? visible.x - btn.box.r : btn.box.x - visible.r;
        const minGap = fade ? fade - 1 : 16;
        must(gap + 0.5 >= minGap, `${tag}: text "${ink.t}" is ${gap.toFixed(1)}px from the ${btn.dir} button, expected at least ${minGap}px`);
      }
    }

    const file = join(SHOTS, `service-steps-${name}-${id}-after.png`);
    await page.screenshot({ path: file, fullPage: false });
    await context.close();
  }
}

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('service-steps-layout: ok');
