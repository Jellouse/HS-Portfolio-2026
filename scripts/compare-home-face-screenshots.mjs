
import { chromium, devices } from 'playwright';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';

const preview =
  process.argv[2] || 'https://hs-portfolio-2026-git-feedback-batch-johanns-projects-b8b79093.vercel.app';
const prod = process.argv[3] || 'https://humansize.de';
const bypass = process.env.VERCEL_AUTOMATION_BYPASS_SECRET || process.env.VERCEL_PROTECTION_BYPASS;
const outDir = process.env.ARTIFACT_DIR || '/opt/cursor/artifacts/screenshots/home-face-compare';
mkdirSync(outDir, { recursive: true });

const cases = [
  { tag: 'desktop-1440', viewport: { width: 1440, height: 900 }, mobile: false },
  { tag: 'iphone-390', viewport: { width: 390, height: 844 }, mobile: true, ua: devices['iPhone 13'] },
];

const measure = (page) =>
  page.evaluate(() => {
    const svg = document.querySelector('[data-hero-blob]');
    const host = document.querySelector('[data-hero-variant="blob"]');
    if (!svg || !host) return null;
    const r = svg.getBoundingClientRect();
    const introW = parseFloat(getComputedStyle(document.querySelector('[data-hero-root]')).getPropertyValue('--intro-w'));
    const scale = new DOMMatrix(getComputedStyle(host).transform).a;
    return {
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      left: Math.round(r.left),
      right: Math.round(r.right),
      w: Math.round(r.width),
      h: Math.round(r.height),
      ratio: +(r.width / r.height).toFixed(4),
      introW: Math.round(introW),
      scale: +scale.toFixed(4),
      inView: r.top >= -2 && r.left >= -2 && r.right <= innerWidth + 2,
    };
  });

async function shots(page, base, label, scrollY) {
  const url = `${base.replace(/\/$/, '')}/?intro=raf`;
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForSelector('[data-intro-ready]', { state: 'attached', timeout: 120000 });
  await page.waitForSelector('[data-intro-settled]', { state: 'attached', timeout: 120000 });
  await page.evaluate((y) => window.scrollTo(0, y), scrollY);
  await page.waitForTimeout(400);
  await page.waitForSelector('[data-intro-settled]', { timeout: 60000 });
  const m = await measure(page);
  const scrollTag = scrollY === 0 ? 'rest' : 'mid';
  const file = join(outDir, `${label}-${scrollTag}.png`);
  await page.screenshot({ path: file, fullPage: false });
  return { file, m };
}

const browser = await chromium.launch();
const report = [];
const failures = [];

for (const c of cases) {
  for (const [host, name] of [
    [preview, 'preview'],
    [prod, 'main'],
  ]) {
    const ctxOpts = {
      viewport: c.viewport,
      isMobile: c.mobile,
      hasTouch: c.mobile,
      extraHTTPHeaders: bypass ? { 'x-vercel-protection-bypass': bypass } : undefined,
      ...(c.ua ? { userAgent: c.ua.userAgent, deviceScaleFactor: c.ua.deviceScaleFactor } : {}),
    };
    const context = await browser.newContext(ctxOpts);
    const page = await context.newPage();
    const R = await page
      .goto(`${host.replace(/\/$/, '')}/?intro=raf`, { waitUntil: 'networkidle', timeout: 120000 })
      .then(() => page.waitForSelector('[data-intro-ready]', { state: 'attached', timeout: 120000 }))
      .then(() => page.getAttribute('[data-hero-root]', 'data-intro-r'))
      .then((r) => Number(r));
    await page.close();
    const page2 = await context.newPage();
    const rest = await shots(page2, host, `${c.tag}-${name}`, 0);
    const midY = Math.max(0, Math.round(R / 2));
    const mid = await shots(page2, host, `${c.tag}-${name}-scroll`, midY);
    await context.close();
    report.push({ case: c.tag, host: name, rest, mid, R });
    if (rest.m && !rest.m.inView && c.mobile) failures.push(`${c.tag} ${name} rest: face not fully in view ${JSON.stringify(rest.m)}`);
    if (rest.m && Math.abs(rest.m.ratio - 559 / 249) > 0.02) failures.push(`${c.tag} ${name} bad aspect ${rest.m.ratio}`);
  }

  const prev = report.find((x) => x.case === c.tag && x.host === 'preview')?.rest.m;
  const main = report.find((x) => x.case === c.tag && x.host === 'main')?.rest.m;
  if (prev && main) {
    const dw = Math.abs(prev.w - main.w);
    const dh = Math.abs(prev.h - main.h);
    if (dw > 3 || dh > 3) failures.push(`${c.tag} size vs main: preview ${prev.w}x${prev.h} main ${main.w}x${main.h}`);
  }
}

await browser.close();

console.log(JSON.stringify({ preview, prod, outDir, report, failures }, null, 2));
if (failures.length) {
  console.error('FAILURES:\n' + failures.join('\n'));
  process.exit(1);
}
console.log('compare-home-face-screenshots: ok');
