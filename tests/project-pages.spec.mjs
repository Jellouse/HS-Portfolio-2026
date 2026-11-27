import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, extname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { STOP_SELECTOR, stopBoxes, stopPositions, tailRoom } from '../src/lib/project-stops.mjs';

/**
 * Every published project, at both widths, has to step cleanly. The list comes
 * from the built site, so a project added tomorrow is covered by this spec the
 * moment it is published, with no edit here.
 */

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.avif': 'image/avif', '.png': 'image/png', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.webm': 'video/webm', '.txt': 'text/plain', '.xml': 'application/xml', '.json': 'application/json' };
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) => existsSync(join(d, 'index.html')));
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}
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
await new Promise((r) => server.listen(4359, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4359';

/** Every project the build produced, so unpublished drafts are not included. */
function projectRoutes() {
  const dir = join(root, 'work');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((name) => existsSync(join(dir, name, 'index.html')))
    .map((name) => `/work/${name}/`)
    .sort();
}

const routes = projectRoutes();
if (!routes.length) {
  console.error('no project pages in the build');
  process.exit(1);
}
console.log(`checking ${routes.length} project pages`);

let fail = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fail = 1;
};

const browser = await chromium.launch();

/**
 * The measurements the page itself would take, then the positions the shared
 * module derives from them.
 */
const probe = (selector) => {
  const vh = innerHeight;
  const max = Math.max(0, Math.round(document.documentElement.scrollHeight - vh));
  const rootEl = document.querySelector('.project');
  const sections = [];
  for (const el of rootEl.children) {
    if (!el.matches(selector)) continue;
    const style = getComputedStyle(el);
    const pad = parseFloat(style.paddingTop) || 0;
    const pb = parseFloat(style.paddingBottom) || 0;
    const start = el.getBoundingClientRect().top + scrollY + pad;
    const rows = [];
    if (el.matches('.process')) {
      const grid = el.querySelector('.process-grid');
      let row = null;
      for (const frame of grid ? grid.children : []) {
        const shift = new DOMMatrix(getComputedStyle(frame).transform).m42 || 0;
        const layout = Math.round(frame.getBoundingClientRect().top + scrollY - shift - start);
        if (row && Math.abs(layout - row.start) <= 4) row.height = Math.max(row.height, frame.offsetHeight);
        else {
          row = { start: layout, height: frame.offsetHeight };
          rows.push(row);
        }
      }
    }
    sections.push({ start, height: el.offsetHeight - pad - pb, rows });
  }
  return {
    vh,
    max,
    docHeight: document.documentElement.scrollHeight,
    sections,
    tailVar: parseFloat(getComputedStyle(rootEl).getPropertyValue('--project-tail')) || 0,
    hasFooter: !!document.querySelector('.site-footer'),
    processRows: (() => {
      const grid = document.querySelector('.project .process-grid');
      if (!grid) return 0;
      const tops = new Set();
      for (const frame of grid.children) tops.add(Math.round(new DOMMatrix(getComputedStyle(frame).transform).m42 ? frame.getBoundingClientRect().top - (new DOMMatrix(getComputedStyle(frame).transform).m42 || 0) : frame.getBoundingClientRect().top));
      return tops.size;
    })(),
  };
};

const settle = async (page) => {
  let lastPixel = -1;
  for (let i = 0; i < 80; i++) {
    await page.waitForTimeout(40);
    const y = await page
      .evaluate(() => (location.pathname.startsWith('/work/') ? Math.round(scrollY) : null))
      .catch(() => null);
    if (y === null) return null;
    if (y === lastPixel) return y;
    lastPixel = y;
  }
  return lastPixel;
};

for (const route of routes) {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
    await page.goto(BASE + route, { waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, { timeout: 30000 }).catch(() => {});
    // The stop positions depend on the media's real heights, so wait for the
    // images to have decoded rather than measuring a page still filling in.
    await page.evaluate(async () => {
      const visible = (img) => {
        if (img.closest('[hidden]')) return false;
        const style = getComputedStyle(img);
        return style.display !== 'none' && style.visibility !== 'hidden';
      };
      const imgs = [...document.querySelectorAll('.project img')].filter(visible);
      for (const img of imgs) {
        img.loading = 'eager';
        if (!img.complete || !img.naturalWidth) {
          await new Promise((resolve) => {
            img.addEventListener('load', resolve, { once: true });
            img.addEventListener('error', resolve, { once: true });
            setTimeout(resolve, 8000);
          });
        }
        try { await img.decode(); } catch {}
      }
      await document.fonts.ready;
    });
    await page.waitForTimeout(400);

    const m = await page.evaluate(probe, STOP_SELECTOR);
    // The tail is read before it is applied, so measure what the room should be
    // from the page with no extra room at all. Then put it back: the script
    // wrote it inline, and leaving it off would break the rest of this run.
    const applied = await page.evaluate(
      () => getComputedStyle(document.querySelector('.project')).getPropertyValue('--project-tail').trim(),
    );
    await page.evaluate(() => document.querySelector('.project').style.setProperty('--project-tail', '0px'));
    await page.waitForTimeout(120);
    const bare = await page.evaluate(probe, STOP_SELECTOR);
    const tailWanted = tailRoom(stopBoxes(bare.sections), bare.docHeight, bare.vh);
    await page.evaluate((value) => {
      const project = document.querySelector('.project');
      if (value) project.style.setProperty('--project-tail', value);
      else project.style.removeProperty('--project-tail');
    }, applied);
    await page.waitForTimeout(120);

    const boxes = stopBoxes(m.sections);

    check(!m.hasFooter, `${route} ${width}: no footer`);
    check(boxes.length > 0, `${route} ${width}: ${boxes.length} stops`);

    // A process grid has to be more than one stop.
    if (m.processRows > 1) {
      const rows = stopBoxes(m.sections).length - (m.sections.length - 1);
      check(rows >= m.processRows, `${route} ${width}: ${m.processRows} process rows are ${rows} stops`);
    }

    if (width === 390) {
      // Phones keep their own scrolling, so nothing may be added.
      check(m.tailVar === 0, `${route} ${width}: no extra room on a phone`);
      await page.close();
      continue;
    }

    check(
      Math.abs(m.tailVar - tailWanted) <= 2,
      `${route} ${width}: room under the last stop (${m.tailVar} vs ${tailWanted})`,
    );

    // Walk the whole page. At every landing, one of the page's stops has to be
    // sitting exactly where it belongs. Measured live, because the page grows
    // the first time a video frame takes its poster, and a stale reference
    // would judge the landing against a layout that has already moved.
    const centred = () =>
      page.evaluate((selector) => {
        const vh = innerHeight;
        const max = Math.max(0, Math.round(document.documentElement.scrollHeight - vh));
        return { vh, max, tail: parseFloat(getComputedStyle(document.querySelector('.project')).getPropertyValue('--project-tail')) || 0, sections: (() => {
          const rootEl = document.querySelector('.project');
          const out = [];
          for (const el of rootEl.children) {
            if (!el.matches(selector)) continue;
            const style = getComputedStyle(el);
            const pad = parseFloat(style.paddingTop) || 0;
            const pb = parseFloat(style.paddingBottom) || 0;
            const start = el.getBoundingClientRect().top + scrollY + pad;
            const rows = [];
            if (el.matches('.process')) {
              const grid = el.querySelector('.process-grid');
              let row = null;
              for (const frame of grid ? grid.children : []) {
                const shift = new DOMMatrix(getComputedStyle(frame).transform).m42 || 0;
                const layout = Math.round(frame.getBoundingClientRect().top + scrollY - shift - start);
                if (row && Math.abs(layout - row.start) <= 4) row.height = Math.max(row.height, frame.offsetHeight);
                else {
                  row = { start: layout, height: frame.offsetHeight };
                  rows.push(row);
                }
              }
            }
            out.push({ start, height: el.offsetHeight - pad - pb, rows });
          }
          return out;
        })() };
      }, STOP_SELECTOR);

    const visited = [{ y: await settle(page) }];
    for (let i = 0; i < 80; i++) {
      await page.keyboard.press('ArrowDown');
      const y = await settle(page);
      if (y === null || y === visited[visited.length - 1].y) break;
      const live = await centred();
      const want = stopPositions(stopBoxes(live.sections), live.vh, live.max);
      const hit = want.some((stop) => Math.abs(stop - y) <= 2);
      visited.push({ y, hit, stops: want.length });
    }
    const final = await page.evaluate(probe, STOP_SELECTOR);
    const sectionCount = stopBoxes(final.sections).length;

    check(
      visited.length > 1 && Math.abs(visited[visited.length - 1].y - final.max) <= 40,
      `${route} ${width}: Down reaches the end of the page (${visited[visited.length - 1].y} vs ${final.max})`,
    );
    const missed = visited.slice(1).filter((v) => !v.hit);
    check(
      missed.length === 0,
      `${route} ${width}: every landing is on a stop (${visited.length - 1} landings${missed.length ? `, ${missed.length} off: ${missed.slice(0, 3).map((v) => v.y).join(' ')}` : ''})`,
    );
    check(
      visited.length >= sectionCount,
      `${route} ${width}: no section is skipped (${visited.length - 1} stops for ${sectionCount} sections)`,
    );

    // Back up again, one stop at a time. Leaving only happens from the top.
    // Judged live: a frame taking its poster moves the stops below it, so the
    // numbers cannot be compared against the way down. What must hold is that
    // it climbs without skipping and lands on real stops.
    const back = [];
    const backHits = [];
    for (let i = 0; i < visited.length + 4; i++) {
      await page.keyboard.press('ArrowUp');
      const y = await settle(page);
      if (y === null) break;
      if (back.length && y === back[back.length - 1]) break;
      const live = await centred();
      const want = stopPositions(stopBoxes(live.sections), live.vh, live.max);
      backHits.push(want.some((stop) => Math.abs(stop - y) <= 2));
      back.push(y);
    }
    const climbDown = back.every((y, i) => i === 0 || y < back[i - 1]);
    check(climbDown, `${route} ${width}: Up only climbs (${back.length} steps, ${back[0]} -> ${back[back.length - 1]})`);
    check(
      backHits.every(Boolean),
      `${route} ${width}: every Up landing is on a stop (${backHits.filter(Boolean).length} of ${backHits.length})`,
    );
    check(back[back.length - 1] === 0, `${route} ${width}: Up finishes at the top (${back[back.length - 1]})`);
    check(
      back.length >= visited.length - 2,
      `${route} ${width}: Up takes about as many steps as Down (${back.length} up, ${visited.length - 1} down)`,
    );

    check(/\/work\//.test(page.url()), `${route} ${width}: still on the page after retracing`);

    // One more Up, from the very top, is the exit. If the retrace already
    // took it (a page whose last landing sat at the top), that is fine too.
    if (/\/work\//.test(page.url())) await page.keyboard.press('ArrowUp');
    const left = await page
      .waitForFunction(() => !location.pathname.startsWith('/work/'), null, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    check(left, `${route} ${width}: Up at the top leaves the page`);
    await page.close();
  }
}

await browser.close();
server.close();
if (fail) {
  console.error('project-pages FAIL');
  process.exit(1);
}
console.log(`project-pages OK (${routes.length} pages)`);
