import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
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
await new Promise((r) => server.listen(4357, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4357';

let fail = 0;
const check = (ok, msg) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`);
  if (!ok) fail = 1;
};

const browser = await chromium.launch();
const STOPS = '.image-block, .pair, .text-block, .process, .info';

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));

const settle = async () => {
  let last = -1;
  for (let i = 0; i < 60; i++) {
    await page.waitForTimeout(50);
    const y = await page.evaluate(() => Math.round(scrollY));
    if (y === last) return y;
    last = y;
  }
  return last;
};
await page.goto(`${BASE}/work/atomic-ski/`, { waitUntil: 'load' });
await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, { timeout: 30000 }).catch(() => {});
await page.waitForTimeout(600);

check(!(await page.evaluate(() => !!document.querySelector('.site-footer'))), 'project page has no footer');

// Every section that fits on the screen must sit in the middle of it.
const centred = async (label) => {
  const r = await page.evaluate((STOPS) => {
    const vh = innerHeight;
    let best = null;
    for (const el of document.querySelector('.project').children) {
      if (!el.matches(STOPS)) continue;
      const b = el.getBoundingClientRect();
      if (b.bottom <= 0 || b.top >= vh) continue;
      const pad = parseFloat(getComputedStyle(el).paddingTop) || 0;
      const pb = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const h = b.height - pad - pb;
      const off = Math.round(b.top + pad + h / 2 - vh / 2);
      if (h >= vh) return { cls: el.className.split(' ')[0], off: null, h: Math.round(h), tall: true };
      if (!best || Math.abs(off) < Math.abs(best.off)) best = { cls: el.className.split(' ')[0], off, h: Math.round(h) };
    }
    return best;
  }, STOPS);
  if (r?.tall) {
    check(true, `${label}: tall ${r.cls} (${r.h}px) starts on screen`);
    return;
  }
  check(Boolean(r) && Math.abs(r.off) <= 2, `${label}: ${r?.cls} sits in the middle (off ${r?.off})`);
};

const at = () => page.evaluate(() => Math.round(scrollY));

check((await at()) === 0, 'starts at the top');

const downHits = [];
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('ArrowDown');
  downHits.push(await settle());
}
check(downHits.every((y, i) => i === 0 ? y > 0 : y > downHits[i - 1]), `Down always moves further down (${downHits.join(' ')})`);

await page.evaluate(() => scrollTo(0, 0));
await settle();
for (let i = 0; i < 3; i++) {
  await page.keyboard.press('ArrowDown');
  await settle();
  await centred(`section ${i + 1}`);
}

const upOne = await (async () => {
  await page.keyboard.press('ArrowUp');
  return settle();
})();
check(upOne === downHits[1], `Up returns to section 2 (${upOne} vs ${downHits[1]})`);

// A short scroll into a section leaves the index short of the next stop, so Up
// must step to the section above rather than fall through to Back.
await page.evaluate((y) => scrollTo(0, y + 40), downHits[1]);
await page.waitForTimeout(200);
await page.keyboard.press('ArrowUp');
const fromShort = await settle();
check(Math.abs(fromShort - downHits[0]) <= 2, `Up mid-section steps to the section above (${fromShort} vs ${downHits[0]})`);
check(
  /\/work\/atomic-ski\/?$/.test(new URL(page.url()).pathname),
  'still on the project after a mid-section Up',
);

// The last section has to reach the middle too, which needs room under it.
let last = null;
for (let i = 0; i < 60; i++) {
  const before = await at();
  await page.keyboard.press('ArrowDown');
  const y = await settle();
  if (y === before) break;
  last = y;
}
const endRoom = await page.evaluate(() => {
  const root = document.querySelector('.project');
  const tail = parseFloat(getComputedStyle(root).getPropertyValue('--project-tail')) || 0;
  return { tail, max: Math.round(document.documentElement.scrollHeight - innerHeight) };
});
check(endRoom.tail > 0, `page leaves room under the last section (${endRoom.tail}px)`);
check(Math.abs(last - endRoom.max) <= 2, `Down reaches the end of the page (${last} vs ${endRoom.max})`);
await centred('last section');

await page.evaluate(() => scrollTo(0, 0));
await settle();
await page.keyboard.press('ArrowUp');
const left = await page
  .waitForFunction(() => location.pathname === '/', null, { timeout: 8000 })
  .then(() => true)
  .catch(() => false);
check(left, `Up at the very top leaves the page (${new URL(page.url()).pathname})`);
await page.close();

{
  const product = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await product.goto(`${BASE}/shop/660/`, { waitUntil: 'load' });
  await product.waitForTimeout(800);
  check(!(await product.evaluate(() => !!document.querySelector('.site-footer'))), 'product page has no footer');
  const before = await product.evaluate(() => Math.round(scrollY));
  await product.keyboard.press('ArrowDown');
  await product.waitForTimeout(900);
  const after = await product.evaluate(() => Math.round(scrollY));
  check(after - before < 100, `product keeps the native step, no section jump (${before} -> ${after})`);
  await product.close();
}

{
  const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await phone.goto(`${BASE}/work/atomic-ski/`, { waitUntil: 'load' });
  await phone.waitForTimeout(800);
  const before = await phone.evaluate(() => Math.round(scrollY));
  await phone.keyboard.press('ArrowDown');
  await phone.waitForTimeout(900);
  const after = await phone.evaluate(() => Math.round(scrollY));
  check(after - before < 100, `phone keeps the native step, no section jump (${before} -> ${after})`);
  await phone.close();
}

{
  // Each row of a process grid is its own stop, not one big section.
  const proc = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await proc.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await proc.goto(`${BASE}/work/industrial-bloom/`, { waitUntil: 'load' });
  await proc.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, { timeout: 30000 }).catch(() => {});
  await proc.waitForTimeout(1200);

  const rows = await proc.evaluate(() => {
    const grid = document.querySelector('.project .process-grid');
    if (!grid) return 0;
    // Rows are the items sharing a top edge.
    const tops = new Set([...grid.children].map((f) => Math.round(f.getBoundingClientRect().top)));
    return tops.size;
  });
  check(rows > 2, `process grid has ${rows} rows`);

  const centres = [];
  for (let i = 0; i < 40; i++) {
    const before = await proc.evaluate(() => Math.round(scrollY));
    await proc.keyboard.press('ArrowDown');
    let last = -1;
    for (let n = 0; n < 60; n++) {
      await proc.waitForTimeout(40);
      const y = await proc.evaluate(() => Math.round(scrollY));
      if (y === last) break;
      last = y;
    }
    if (last === before) break;
    const row = await proc.evaluate(() => {
      const vh = innerHeight;
      const mid = vh / 2;
      let best = null;
      for (const f of document.querySelectorAll('.project .process-grid > .frame')) {
        const b = f.getBoundingClientRect();
        if (b.bottom < 0 || b.top > vh) continue;
        const off = Math.round(b.top + b.height / 2 - mid);
        if (!best || Math.abs(off) < Math.abs(best)) best = off;
      }
      return best;
    });
    if (row != null) centres.push(row);
  }
  const tight = centres.filter((c) => Math.abs(c) <= 24).length;
  check(
    centres.length >= 4 && tight >= 4,
    `process rows each land near the middle (${centres.length} rows, off: ${centres.join(' ')})`,
  );
  await proc.close();
}

{
  // Pressing fast has to move you fast, and still land one section per press.
  const quick = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await quick.route(/\/_vercel\/(insights|speed-insights)\//, (r) => r.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
  await quick.goto(`${BASE}/work/atomic-ski/`, { waitUntil: 'load' });
  await quick.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, { timeout: 30000 }).catch(() => {});
  await quick.waitForTimeout(1200);

  const walk = async (count, gap) => {
    await quick.evaluate(() => scrollTo(0, 0));
    await quick.waitForTimeout(400);
    const t0 = Date.now();
    for (let i = 0; i < count; i++) {
      await quick.keyboard.press('ArrowDown');
      if (i < count - 1 && gap) await quick.waitForTimeout(gap);
    }
    let last = -1;
    for (let i = 0; i < 300; i++) {
      await quick.waitForTimeout(20);
      const y = await quick.evaluate(() => Math.round(scrollY));
      if (y === last) break;
      last = y;
    }
    return { y: last, ms: Date.now() - t0 };
  };

  const fast = await walk(5, 40);
  const slow = await walk(5, 700);
  check(fast.ms < slow.ms, `fast presses finish sooner (${fast.ms}ms vs ${slow.ms}ms)`);
  check(
    Math.abs(fast.y - slow.y) <= 2,
    `one section per press at any speed (${fast.y} vs ${slow.y})`,
  );

  // Holding the key has to start slow and get faster, like the gallery.
  await quick.evaluate(() => scrollTo(0, 0));
  await quick.waitForTimeout(400);
  await quick.evaluate(() => {
    window.__log = [];
    const STOPS = '.image-block, .pair, .text-block, .process, .info';
    const vh = innerHeight;
    const max = Math.round(document.documentElement.scrollHeight - vh);
    const list = [0];
    for (const el of document.querySelector('.project').children) {
      if (!el.matches(STOPS)) continue;
      const pad = parseFloat(getComputedStyle(el).paddingTop) || 0;
      const pb = parseFloat(getComputedStyle(el).paddingBottom) || 0;
      const start = el.getBoundingClientRect().top + scrollY + pad;
      const h = el.offsetHeight - pad - pb;
      const at = Math.min(max, Math.max(0, Math.round(start - Math.max(0, (vh - Math.min(h, vh)) / 2))));
      if (at > list[list.length - 1] + 4) list.push(at);
    }
    const t0 = performance.now();
    let last = -1;
    const loop = () => {
      const y = scrollY;
      let idx = 0;
      for (let i = 0; i < list.length; i++) if (list[i] <= y + 6) idx = i;
      if (idx !== last) {
        window.__log.push([Math.round(performance.now() - t0), idx]);
        last = idx;
      }
      if (performance.now() - t0 < 3200) requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  });
  await quick.keyboard.down('ArrowDown');
  await quick.waitForTimeout(2800);
  await quick.keyboard.up('ArrowDown');
  await quick.waitForTimeout(500);
  const held = await quick.evaluate(() => window.__log);
  await quick.waitForTimeout(400);
  const afterRelease = await quick.evaluate(() => Math.round(scrollY));
  const gaps = held.slice(1).map((m, i) => m[0] - held[i][0]);
  check(held.length > 6, `holding steps repeatedly (${held.length} stops)`);
  check(gaps[0] > 300, `the first repeat waits (${gaps[0]}ms)`);
  check(gaps[1] < gaps[0] && gaps[2] < gaps[1], `each repeat comes sooner (${gaps.slice(0, 4).join(' ')})`);
  // The run stops accelerating at the end of the page, so look at the fastest
  // interval reached while it was still moving, not the gap before the last one.
  const running = Math.min(...gaps.slice(1, -1));
  check(running < 260, `it ends up running, not waiting (${running}ms between steps)`);
  await quick.waitForTimeout(500);
  check(
    (await quick.evaluate(() => Math.round(scrollY))) === afterRelease,
    'releasing the key stops the run',
  );
  // A real keyboard fires keydown over and over while a key is held. Playwright's
  // keyboard.down does not, which is how this went unnoticed: the repeats were
  // returning before preventDefault, so the browser scrolled natively on top of
  // the steps and a held arrow turned into a couple of hops then a slow crawl.
  await quick.evaluate(() => scrollTo(0, 0));
  await quick.waitForTimeout(400);
  const repeats = await quick.evaluate(async () => {
    const fire = (repeat) => {
      const event = new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, repeat });
      document.body.dispatchEvent(event);
      return event.defaultPrevented;
    };
    const prevented = [fire(false)];
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 33));
      prevented.push(fire(true));
    }
    await new Promise((r) => setTimeout(r, 600));
    return { prevented, last: prevented.slice(1).every(Boolean) };
  });
  check(repeats.last, 'repeated keydown is always prevented (no native scroll behind the steps)');

  // Holding down has to keep stepping, not settle into a linear crawl.
  const hold = await quick.evaluate(async () => {
    const fire = (repeat) =>
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true, repeat }));
    scrollTo(0, 0);
    await new Promise((r) => setTimeout(r, 350));
    const start = performance.now();
    fire(false);
    for (let i = 0; i < 85; i++) {
      await new Promise((r) => setTimeout(r, 33));
      fire(true);
    }
    await new Promise((r) => setTimeout(r, 800));
    return { travelled: Math.round(scrollY), seconds: Math.round((performance.now() - start) / 100) / 10 };
  });
  check(
    hold.travelled > 3000,
    `a held key keeps moving through the page (${hold.travelled}px in ${hold.seconds}s)`,
  );

  await quick.close();
}

await browser.close();
server.close();
if (fail) {
  console.error('project-sections FAIL');
  process.exit(1);
}
console.log('project-sections OK');
