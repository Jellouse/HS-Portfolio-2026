
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png', '.woff2': 'font/woff2' };
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
await new Promise((r) => server.listen(4335, '127.0.0.1', r));
const browser = await chromium.launch();
const failures = [];
const check = (ok, label) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) failures.push(label); };
const B = 'http://127.0.0.1:4335';
for (const [label, opt] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }]]) {
  const p = await (await browser.newContext(opt)).newPage();
  await p.goto(B + '/shop/', { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const shop = await p.evaluate(() => { const t = document.querySelector('.shop-head-title').getBoundingClientRect(); const r = document.querySelector('.shop-ring').getBoundingClientRect(); return { text: t.top, c: (r.top + r.bottom) / 2, top: r.top, below: t.top - r.bottom, w: r.width, x: r.left + r.width / 2 }; });
  const hp = await (await browser.newContext(opt)).newPage();
  await hp.goto(B + '/?intro=raf', { waitUntil: 'load' });
  await hp.waitForSelector('[data-intro-ready]', { state: 'attached', timeout: 30000 });
  await hp.waitForSelector('[data-intro-settled]', { state: 'attached', timeout: 30000 });
  const home = await hp.evaluate(() => {
    const t = document.querySelector('.site-header .brand').getBoundingClientRect();
    const r = document.querySelector('[data-hero-blob]').getBoundingClientRect();
    const copy = document.querySelector('.about p');
    return {
      text: t.top,
      c: (r.top + r.bottom) / 2,
      top: r.top,
      bottom: r.bottom,
      left: r.left,
      right: r.right,
      h: r.height,
      w: r.width,
      below: t.top - r.bottom,
      vw: innerWidth,
      copyTop: copy ? Math.round(copy.getBoundingClientRect().top) : NaN,
    };
  });
  const shopCopy = await p.evaluate(() => { const el = document.querySelector('.shop-intro p'); return el ? Math.round(el.getBoundingClientRect().top) : NaN; });
  await hp.close();
  check(Math.abs(shop.text - home.text) <= 1, `${label}: name blocks at the same top (home ${home.text}, shop ${shop.text})`);
  check(Math.abs(home.copyTop - shopCopy) <= 2, `${label}: first body copy aligns (home ${home.copyTop}, shop ${shopCopy})`);
  check(home.copyTop >= (label === 'mobile' ? 844 : 900) - 40, `${label}: home copy starts just below the viewport (${home.copyTop})`);
  if (label === 'mobile') check(Math.abs(shop.c - home.c) <= 12, `${label}: face and ring share the band (${home.c.toFixed(1)}/${shop.c.toFixed(1)})`);
  else check(Math.abs(shop.c) <= 1.5 && Math.abs(shop.w - 980) <= 2 && shop.text === 695, `desktop: ring 68vw, centre on the page top, name at 695 (c ${shop.c.toFixed(1)}, w ${shop.w.toFixed(0)}, text ${shop.text})`);

  const clipper = await p.evaluate(() => { let e = document.querySelector('.shop-ring-canvas').parentElement; const bad = []; while (e && e !== document.documentElement) { const c = getComputedStyle(e); if (/hidden|clip|scroll|auto/.test(c.overflowX + c.overflowY) || c.clipPath !== 'none' || /paint|strict|content/.test(c.contain)) bad.push(e.tagName + '.' + e.className); e = e.parentElement; } return bad.join(','); });
  check(clipper === '', `${label}: no ancestor clips the ring (${clipper || 'none'})`);
  const painted = await p.evaluate(() => { const c = document.querySelector('.shop-ring-canvas'); const m = c.closest('.shop-mark'); if (!m.classList.contains('at-top') || getComputedStyle(c).visibility !== 'visible') return 'canvas not shown'; const x = c.getContext('2d'); const h = c.height; let top = 0, bot = 0; const row = (y) => { const d = x.getImageData(0, y, c.width, 1).data; let n = 0; for (let i = 3; i < d.length; i += 4) n += d[i] > 0; return n; }; for (let y = 0; y < h / 2; y += 8) top += row(y); for (let y = Math.ceil(h / 2); y < h; y += 8) bot += row(y); return top > 0 && Math.abs(top - bot) / bot < 0.1 ? 'ok' : `top ${top} bottom ${bot}`; });
  check(painted === 'ok', `${label}: full ring painted, both halves (${painted})`);

  const fixedCheck = (sel) => `(() => { const l = document.querySelector('${sel}'); if (getComputedStyle(l).position !== 'fixed') return 'not fixed'; let e = l.parentElement; while (e && e !== document.documentElement) { const c = getComputedStyle(e); if (c.transform !== 'none' || c.filter !== 'none' || c.perspective !== 'none' || /transform|filter|perspective/.test(c.willChange) || /paint|layout|strict|content/.test(c.contain) || (c.backdropFilter && c.backdropFilter !== 'none')) return 'containing block ' + e.tagName + '.' + e.className; e = e.parentElement; } return 'ok'; })()`;
  check((await p.evaluate(fixedCheck('.shop-ring-layer'))) === 'ok', `${label}: ring layer is viewport-fixed (${await p.evaluate(fixedCheck('.shop-ring-layer'))})`);
  const hp2 = await (await browser.newContext(opt)).newPage();
  await hp2.goto(B + '/', { waitUntil: 'load' });
  await hp2.waitForSelector('[data-intro-ready]');
  check((await hp2.evaluate(fixedCheck('[data-hero-variant="blob"]'))) === 'ok', `${label}: home face host is viewport-fixed (${await hp2.evaluate(fixedCheck('[data-hero-variant="blob"]'))})`);
  const b0 = await hp2.evaluate(() => document.querySelector('.mark-blob').getBoundingClientRect().top);
  await hp2.evaluate(() => scrollTo(0, 3000));
  await hp2.waitForFunction(() => document.querySelector('.mark-blob').getBoundingClientRect().bottom < 0);
  await hp2.evaluate(() => scrollTo(0, 0));
  await hp2.waitForFunction((b) => Math.abs(document.querySelector('.mark-blob').getBoundingClientRect().top - b) < 1, b0);
  check(true, `${label}: fixed face scrolls away with the page and returns to rest at top`);
  await hp2.close();
  check(Math.abs(shop.x - 195 * (label === 'mobile' ? 1 : 1440 / 390)) <= 1, `${label}: ring centred horizontally`);
  if (label === 'mobile') {
    check(Math.abs(shop.c - home.c) <= 12, `${label}: face and ring share the band (${home.c.toFixed(1)}/${shop.c.toFixed(1)})`);
    check(home.left >= -2 && home.right <= home.vw + 2 && home.w <= home.vw + 1, `mobile: face inside the viewport (${home.left.toFixed(0)}–${home.right.toFixed(0)}, ${home.w.toFixed(0)})`);
    check(Math.abs(home.w / home.h - 1.3) < 0.08, `mobile: face about 1.3:1 (${(home.w / home.h).toFixed(2)})`);
    check(home.top < 220 && home.bottom < home.text && home.text - home.bottom > 80 && home.text - home.bottom < 220, `mobile: face sits above the name (top ${home.top.toFixed(0)}, bottom ${home.bottom.toFixed(0)}, name ${home.text.toFixed(0)})`);
  }
  const R = Number(await p.getAttribute('[data-shop-head]', 'data-ring-r'));
  await p.evaluate((y) => scrollTo(0, y), R);
  await p.waitForTimeout(800);
  const a = await p.locator('.shop-mark').boundingBox();
  check(await p.evaluate(() => !document.querySelector('.shop-ring-wrap, [data-shop-ring] .project-menu')), `${label}: no ring menu on /shop`);
  const order = await p.evaluate(() => [...document.querySelectorAll('.shop-menu > *')].map((e) => e.textContent.trim()).join(','));
  check(order === 'Home,About,Contact', `${label}: shop menu order ${order}`);
  if (label === 'desktop') {
    await p.evaluate(() => scrollTo(0, 0));
    await p.waitForTimeout(400);
    const look = (sel) => p.evaluate((s) => { const c = getComputedStyle(document.querySelector(s)); return c.color + ' ' + c.opacity; }, sel);
    const rest = await look('.shop-menu > a');
    await p.hover('.shop-menu > a');
    await p.waitForTimeout(400);
    const hov = await look('.shop-menu > a');
    const other = await look('.shop-menu > button');
    check(rest.startsWith('rgb(1') || rest !== hov, `shop menu starts gray (${rest})`);
    check(/ 1$/.test(hov) && hov !== rest && other === rest, `shop menu: hovered item turns ink, others stay gray (${hov} / ${other})`);
    await p.evaluate((y) => scrollTo(0, y), Number(await p.getAttribute('[data-shop-head]', 'data-ring-r')));
    await p.waitForTimeout(800);
  }
  await p.goto(B + (await p.getAttribute('.shop-title', 'href')), { waitUntil: 'load' });
  await p.waitForTimeout(3000);
  const d = await p.locator('.shop-mark').boundingBox();
  check(Math.abs(a.y - d.y) <= 2 && Math.abs(a.width - d.width) <= 1 && Math.abs(a.x - d.x) <= 1, `${label}: ring at R matches detail icon (${a.y.toFixed(1)}/${d.y.toFixed(1)}, ${a.width.toFixed(1)}/${d.width.toFixed(1)})`);
}
const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await p.goto(B + '/', { waitUntil: 'load' });
await p.waitForTimeout(500);
const home = await p.evaluate(() => [...document.querySelectorAll('[data-main-menu] > *')].map((e) => e.textContent.trim()).join(','));
check(home === 'About,Shop,Contact', `home menu ${home}`);
check((await p.textContent('.brand-name')).trim() === 'Humansize', 'brand reads Humansize');

const soc = () => p.evaluate(() => ({ exp: document.querySelector('[data-socials-toggle]').getAttribute('aria-expanded'), menu: !document.querySelector('[data-main-menu]').hidden, items: [...document.querySelectorAll('[data-socials]:not([hidden]) > a')].map((a) => a.textContent.trim() + '=' + a.getAttribute('href')).join(',') }));
await p.click('[data-socials-toggle]');
let st0 = await soc();
check(st0.exp === 'true' && !st0.menu && st0.items === 'Instagram=https://instagram.com/humansize.d,LinkedIn=https://www.linkedin.com/in/johannschnettker/,X=https://x.com/humansize_d,Email=mailto:schnettker.johann@gmail.com', `socials open (${st0.items})`);
await p.click('[data-socials-toggle]');
check((await soc()).menu, 'second click closes socials');
await p.click('[data-socials-toggle]');
await p.mouse.move(720, 100);
check((await soc()).menu, 'pointer far away closes socials');
await p.focus('[data-socials-toggle]');
await p.keyboard.press('Enter');
check((await soc()).exp === 'true', 'keyboard opens socials');
await p.keyboard.press('Escape');
check((await soc()).menu && (await p.evaluate(() => document.activeElement.matches('[data-socials-toggle]'))), 'Esc closes socials, focus stays on Humansize');
await p.click('[data-socials-toggle]');
await p.evaluate(() => scrollTo(0, 200));
await p.waitForTimeout(200);
check((await soc()).menu, 'scrolling away closes socials');
await p.evaluate(() => scrollTo(0, 0));

for (const [lab, o, top] of [['desktop', { viewport: { width: 1440, height: 900 } }, 70], ['mobile', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true }, 57]]) {
  const q = await (await browser.newContext(o)).newPage();
  const off = [];
  for (const u of [B + '/work/analogue-counters/', B + (await (async () => { const z = await (await browser.newContext()).newPage(); await z.goto(B + '/shop/'); const h = await z.getAttribute('.shop-title', 'href'); await z.close(); return h; })())]) {
    await q.goto(u, { waitUntil: 'load' });
    await q.waitForTimeout(2500);
    off.push(await q.evaluate(() => { const w = document.querySelector('[data-project-menu]'); const n = w.querySelector('.project-menu'); w.classList.add('is-open'); const r = n.getBoundingClientRect(), m = w.getBoundingClientRect(); return Math.round(r.top + parseFloat(getComputedStyle(n).paddingTop) - m.top); }));
  }
  check(off[0] === top && off[1] === top, `${lab}: small-icon menu offset ${off.join('/')} (want ${top})`);
  await q.close();
}
await p.click('.site-menu [data-contact-open]');
await p.waitForTimeout(700);
await p.click('[data-service="Other"]');
await p.waitForTimeout(300);
const st = () => p.evaluate(() => { const t = document.querySelector('#contact-project'); return { align: getComputedStyle(t).textAlign, top: Math.round(t.getBoundingClientRect().top), h: Math.round(t.getBoundingClientRect().height) }; });
await p.type('#contact-project', 'Short');
await p.waitForTimeout(400);
const s1 = await st();
check(await p.evaluate(() => getComputedStyle(document.querySelector('#contact-project')).letterSpacing === getComputedStyle(document.querySelector('.brand')).letterSpacing), 'contact text uses the site tracking');
await p.type('#contact-project', ' words');
await p.waitForTimeout(400);
const s1b = await st();
check(s1.align === 'center' && s1.top === s1b.top, `one line: centred, no move while typing (${s1.align}, ${s1.top}/${s1b.top})`);
await p.focus('#contact-project');
await p.keyboard.insertText(' and more words so that it wraps well past the first line of this field');
await p.waitForFunction((top) => {
  const t = document.querySelector('#contact-project');
  if (!t) return false;
  const r = t.getBoundingClientRect();
  return getComputedStyle(t).textAlign === 'left' && Math.round(r.height) === 58 && Math.round(r.top) < top;
}, s1.top);
const s2 = await st();
check(s2.align === 'left' && s2.h === 58 && s2.top < s1.top, `two lines: left, grew, re-centred (${s2.align}, h ${s2.h}, top ${s2.top})`);
const hover = await p.evaluate(() => { const r = document.querySelector('.contact-dots').getBoundingClientRect(); return [r.left - 100, r.top + 2]; });
await p.mouse.move(hover[0], hover[1]);
await p.waitForTimeout(400);
check(await p.evaluate(() => getComputedStyle(document.querySelector('.contact-back')).opacity === '1'), 'Back shows with the pointer 100px left of the dots');
await browser.close();
server.close();
if (failures.length) { console.error('shop-intro FAIL'); process.exit(1); }
console.log('shop-intro: ok');
