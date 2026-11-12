// Service-step copy fades only where it would hit the back and Inquire
// buttons, not across the full width, and not left and right. The L/R
// arrows sit on a tighter edge pad, not the page margin.
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
  phone: { width: 390, height: 844, edge: 16, maxEdge: 20 },
  desktop: { width: 1440, height: 900, edge: 48, maxEdge: 64 },
};

const pages = ['services/digital-build/', 'services/physical-build/'];

const inspect = () => {
  const box = (el) => {
    if (!el || el.hidden) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: r.x, y: r.y, r: r.right, b: r.bottom, w: r.width, h: r.height };
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
  const sides = [...root?.querySelectorAll('.arrow-pill[data-dir="left"], .arrow-pill[data-dir="right"]') || []].map((el) => ({ dir: el.dataset.dir, box: box(el) })).filter((el) => el.box);
  const ends = [
    { dir: 'up', box: box(root?.querySelector('.arrow-back, .arrow-pill[data-dir="up"]')) },
    { dir: 'inquire', box: box(root?.querySelector('.service-inquire')) },
  ].filter((el) => el.box);
  const copy = root?.querySelector('[data-step]:not([hidden])');
  const cs = stage ? getComputedStyle(stage) : null;
  const host = root ? getComputedStyle(root) : null;
  return {
    vw: innerWidth,
    vh: innerHeight,
    edge: host ? parseFloat(host.getPropertyValue('--arrow-edge')) : NaN,
    fade: host ? parseFloat(host.getPropertyValue('--stage-fade')) : NaN,
    mask: cs ? (cs.maskImage || cs.webkitMaskImage || 'none') : 'none',
    maskSize: cs ? (cs.maskSize || cs.webkitMaskSize || '') : '',
    maskPosition: cs ? (cs.maskPosition || cs.webkitMaskPosition || '') : '',
    maskComposite: cs ? `${cs.maskComposite || ''} ${cs.webkitMaskComposite || ''}` : '',
    fadeTopW: host ? parseFloat(host.getPropertyValue('--fade-top-w')) : NaN,
    fadeTopH: host ? parseFloat(host.getPropertyValue('--fade-top-h')) : NaN,
    fadeBottomW: host ? parseFloat(host.getPropertyValue('--fade-bottom-w')) : NaN,
    fadeBottomH: host ? parseFloat(host.getPropertyValue('--fade-bottom-h')) : NaN,
    stage: box(stage),
    sides,
    ends,
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
    const data = await page.evaluate(inspect);
    const tag = `${name} ${id}`;

    must(Number.isFinite(data.edge) && Math.round(data.edge) === vp.edge, `${tag}: --arrow-edge is ${data.edge}, expected ${vp.edge}`);
    must(/linear-gradient/i.test(data.mask), `${tag}: stage is missing a gradient mask (${data.mask})`);
    must(!/to right|to left|90deg|270deg/i.test(data.mask), `${tag}: mask fades left/right, expected top and bottom (${data.mask})`);
    must((data.maskSize || '').split(',').filter(Boolean).length >= 3, `${tag}: mask is not split into button-local layers (${data.maskSize})`);
    must(data.fade >= 24, `${tag}: --stage-fade is ${data.fade}, expected at least 24px`);

    const back = data.ends.find((btn) => btn.dir === 'up');
    const inquire = data.ends.find((btn) => btn.dir === 'inquire');
    if (back) {
      must(Math.abs(data.fadeTopW - back.box.w) <= 2, `${tag}: --fade-top-w is ${data.fadeTopW}, expected back width ${back.box.w.toFixed(1)}`);
    }
    if (inquire) {
      must(Math.abs(data.fadeBottomW - inquire.box.w) <= 2, `${tag}: --fade-bottom-w is ${data.fadeBottomW}, expected inquire width ${inquire.box.w.toFixed(1)}`);
    }

    for (const btn of data.sides) {
      const inset = btn.dir === 'left' ? btn.box.x : data.vw - btn.box.r;
      const slack = btn.dir === 'right' ? 16 : 1;
      must(Math.abs(inset - vp.edge) <= slack || (btn.dir === 'right' && inset >= vp.edge && inset <= vp.maxEdge + slack),
        `${tag}: ${btn.dir} button inset ${inset.toFixed(1)}px, expected about ${vp.edge}px`);
      must(inset + 0.5 >= 12, `${tag}: ${btn.dir} button crowds the edge (${inset.toFixed(1)}px)`);
    }

    for (const btn of data.sides) {
      for (const ink of data.ink) {
        const area = overlap(ink, btn.box);
        must(area < 0.5, `${tag}: text "${ink.t}" overlaps the ${btn.dir} button by ${area.toFixed(1)}px²`);
      }
    }

    const file = join(SHOTS, `service-steps-${name}-${id}-vertical-after.png`);
    await page.screenshot({ path: file, fullPage: false });

    for (let i = 0; i < 8; i++) {
      const tall = await page.evaluate(() => {
        const stage = document.querySelector('.service-step-stage');
        return stage ? stage.scrollHeight - stage.clientHeight > 40 : false;
      });
      if (tall) break;
      const right = page.locator('.service-steps .arrow-pill[data-dir="right"]');
      if (await right.isHidden()) break;
      await right.click();
      await page.waitForTimeout(400);
    }

    const tall = await page.evaluate(() => {
      const stage = document.querySelector('.service-step-stage');
      return stage ? stage.scrollHeight - stage.clientHeight > 40 : false;
    });
    if (tall) {
      await page.evaluate(() => {
        const stage = document.querySelector('.service-step-stage');
        if (stage) stage.scrollTop = Math.min(160, stage.scrollHeight);
      });
      await page.waitForTimeout(150);
      const long = await page.evaluate(inspect);
      const longTag = `${tag} long`;
      for (const btn of long.ends) {
        const area = long.stage ? overlap(long.stage, btn.box) : 0;
        must(area > 100, `${longTag}: stage does not reach the ${btn.dir} button (overlap ${area.toFixed(1)}px²)`);
      }
      const back = long.ends.find((btn) => btn.dir === 'up');
      const inquire = long.ends.find((btn) => btn.dir === 'inquire');
      if (back) {
        must(Math.abs(long.fadeTopW - back.box.w) <= 2, `${longTag}: --fade-top-w is ${long.fadeTopW}, expected back width ${back.box.w.toFixed(1)}`);
        must(long.fadeTopH + 0.5 >= back.box.h, `${longTag}: --fade-top-h is ${long.fadeTopH}, expected at least back height ${back.box.h.toFixed(1)}`);
      }
      if (inquire) {
        must(Math.abs(long.fadeBottomW - inquire.box.w) <= 2, `${longTag}: --fade-bottom-w is ${long.fadeBottomW}, expected inquire width ${inquire.box.w.toFixed(1)}`);
      }
      await page.screenshot({ path: join(SHOTS, `service-steps-${name}-${id}-vertical-long.png`), fullPage: false });
    }

    await context.close();
  }
}

await browser.close();
server.close();
if (failures.length) { console.error(failures.join('\n')); process.exit(1); }
console.log('service-steps-layout: ok');
