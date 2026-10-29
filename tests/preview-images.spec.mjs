
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';

const BASE = (process.env.PREVIEW_BASE || process.env.BASE_URL || 'https://humansize.de').replace(
  /\/$/,
  '',
);

function token() {
  const fromEnv = process.env.PREVIEW_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (fromEnv) return fromEnv.trim();
  try {
    return execSync('gh auth token', { encoding: 'utf8' }).trim();
  } catch {
    return '';
  }
}

async function assertImages(page, label) {
  const result = await page.evaluate(async () => {
    const imgs = [...document.querySelectorAll('main img')];
    await Promise.all(
      imgs.map(
        (img) =>
          img.complete
            ? Promise.resolve()
            : new Promise((resolve) => {
                img.addEventListener('load', resolve, { once: true });
                img.addEventListener('error', resolve, { once: true });
              }),
      ),
    );
    return imgs.map((img) => ({
      alt: img.alt || '',
      src: (img.currentSrc || img.src || '').slice(0, 120),
      naturalWidth: img.naturalWidth,
      complete: img.complete,
    }));
  });

  if (!result.length) {
    throw new Error(`${label}: expected at least one <img> in main`);
  }
  const broken = result.filter((r) => !(r.naturalWidth > 0));
  if (broken.length) {
    console.error(
      `${label}: broken images:\n` + broken.map((b) => `  - ${b.naturalWidth}px ${b.alt} ${b.src}`).join('\n'),
    );
    throw new Error(`${label}: ${broken.length}/${result.length} images failed to load`);
  }
  console.log(`${label}: ${result.length} images OK`);
  return result;
}

async function checkInfoNotStuck(page) {
  const info = await page.evaluate(() => {
    const section = document.querySelector('main .info');
    if (!section) return { present: false };
    const list = section.querySelector('.info-list');
    const cs = list ? getComputedStyle(list) : null;
    return {
      present: true,
      hasFadeIn: section.classList.contains('fade-in'),
      opacity: cs ? cs.opacity : null,
      color: cs ? cs.color : null,
    };
  });
  if (!info.present) {
    console.log('info: (no info section on this page)');
    return;
  }
  if (info.hasFadeIn) {
    throw new Error('info section unexpectedly has fade-in (would explain grey text)');
  }
  if (info.opacity !== '1') {
    throw new Error(`info list opacity stuck at ${info.opacity}, expected 1`);
  }
  console.log(`info: no fade-in, opacity=${info.opacity} (not a stuck scroll-fade)`);
}

const auth = token();
if (!auth) {
  console.error('preview-images: no GitHub token (set PREVIEW_TOKEN or run gh auth login)');
  process.exit(1);
}

const browser = await chromium.launch();
const context = await browser.newContext({
  extraHTTPHeaders: { authorization: `Bearer ${auth}` },
});

try {

  {
    const page = await context.newPage();
    const url = `${BASE}/preview/conversation-design-institute?branch=main`;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
    if (!res || res.status() !== 200) {
      throw new Error(`CDI preview HTTP ${res?.status()} — ${url}`);
    }
    await page.waitForSelector('main img', { timeout: 30000 });
    await assertImages(page, 'conversation-design-institute');
    await checkInfoNotStuck(page);
    await page.close();
  }

  {
    const page = await context.newPage();
    const url = `${BASE}/preview/analogue-af1?branch=main`;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
    if (!res || res.status() !== 200) {
      throw new Error(`AF1 preview HTTP ${res?.status()} — ${url}`);
    }
    await page.waitForSelector('main img', { timeout: 30000 });
    await assertImages(page, 'analogue-af1');
    await checkInfoNotStuck(page);
    await page.close();
  }

  {
    const page = await context.newPage();
    const url = `${BASE}/preview/analogue-counters/?branch=main`;
    const res = await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
    if (!res || res.status() !== 200) {
      throw new Error(`couters preview HTTP ${res?.status()} — ${url}`);
    }
    await page.waitForSelector('main .process img, main img', { timeout: 30000 });
    const processCount = await page.locator('main .process img').count();
    if (processCount < 1) throw new Error('analogue-counters preview: expected process images');
    await assertImages(page, 'analogue-counters (incl. process)');
    await page.close();
  }

  console.log('preview-images OK');
} finally {
  await browser.close();
}
