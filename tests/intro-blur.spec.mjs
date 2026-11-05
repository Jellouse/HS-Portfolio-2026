import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
};
const root = [join(ROOT, '.vercel', 'output', 'static'), join(ROOT, 'dist', 'client')].find((d) =>
  existsSync(join(d, 'index.html')),
);
if (!root) {
  console.error('Run npm run build first.');
  process.exit(1);
}

const server = createServer((req, res) => {
  let path = decodeURIComponent((req.url || '/').split('?')[0]);
  if (path.endsWith('/')) path += 'index.html';
  const file = [join(root, path), join(root, path, 'index.html')].find(
    (f) => f.startsWith(root) && existsSync(f) && statSync(f).isFile(),
  );
  if (!file) {
    res.writeHead(404);
    return res.end();
  }
  res.writeHead(200, { 'content-type': MIME[extname(file)] || 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((r) => server.listen(4348, '127.0.0.1', r));
const BASE = 'http://127.0.0.1:4348';

const blurPx = (filter) => {
  const match = /blur\(([-\d.]+)px\)/.exec(filter);
  return match ? Number(match[1]) : 0;
};

const browser = await chromium.launch();
const failures = [];

async function check(page, label, viewport) {
  await page.goto(BASE + '/work/industrial-bloom/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.documentElement.classList.contains('is-letter-intro-done'), null, {
    timeout: 45000,
  });
  const ready = await page.waitForFunction(() => {
    const blocks = [...document.querySelectorAll('[data-letter-blur]')];
    if (!blocks.length) return false;
    return blocks.every((el) => el.querySelector('.reveal-word') && !el.querySelector('.motion-letter'));
  }, null, { timeout: 20000 }).then(() => true).catch(() => false);
  if (!ready) {
    const state = await page.evaluate(() => ({
      blocks: document.querySelectorAll('[data-letter-blur]').length,
      letters: document.querySelectorAll('[data-letter-blur] .motion-letter').length,
      words: document.querySelectorAll('[data-letter-blur] .reveal-word').length,
    }));
    failures.push(`${label}: intro text was not handed back to the blur (${JSON.stringify(state)})`);
    return;
  }

  const placed = await page.evaluate(() => {
    const word = document.querySelector('[data-letter-blur] .reveal-word');
    if (!word) return null;
    return { docTop: word.getBoundingClientRect().top + scrollY, text: (word.textContent || '').slice(0, 24) };
  });
  if (!placed) {
    failures.push(`${label}: no intro word to measure`);
    return;
  }

  const width = viewport.width;
  const fit = async (docTop) => {
    await page.setViewportSize({ width, height: Math.max(160, Math.round(docTop + 8)) });
    await page.waitForTimeout(300);
    return page.evaluate(() => {
      const word = document.querySelector('[data-letter-blur] .reveal-word');
      if (!word) return null;
      word.dataset.blurProbe = '1';
      const style = getComputedStyle(word);
      return {
        docTop: word.getBoundingClientRect().top + scrollY,
        text: (word.textContent || '').slice(0, 24),
        filter: style.filter,
        opacity: Number(style.opacity),
        name: style.animationName,
        top: word.getBoundingClientRect().top,
        vh: innerHeight,
      };
    });
  };
  let blurred = await fit(placed.docTop);
  if (blurred && (blurred.top < blurred.vh - blurred.vh * 0.15 || blurred.top > blurred.vh - 2)) {
    blurred = await fit(blurred.docTop);
  }
  if (!blurred) {
    failures.push(`${label}: probe word missing after resize`);
    return;
  }

  const read = () => page.evaluate(() => {
    const word = document.querySelector('[data-blur-probe]');
    if (!word) return null;
    const style = getComputedStyle(word);
    return { filter: style.filter, opacity: Number(style.opacity), name: style.animationName, top: word.getBoundingClientRect().top };
  });
  const band = blurred.vh * 0.15;
  await page.evaluate((band) => {
    const word = document.querySelector('[data-blur-probe]');
    const top = word.getBoundingClientRect().top;
    scrollTo(0, scrollY + top - (innerHeight - band - 48));
  }, band);
  await page.waitForTimeout(50);
  const sharp = await read();

  const blur = blurPx(blurred.filter);
  const clear = blurPx(sharp?.filter || '');
  if (!(blur > 0.5 && blurred.opacity < 0.85)) {
    failures.push(`${label}: "${placed.text}" not blurred in the entry band (${blurred.filter}, opacity ${blurred.opacity}, top ${Math.round(blurred.top)} / ${Math.round(blurred.vh)})`);
  }
  if (!(sharp && clear < 0.5 && sharp.opacity > 0.99)) {
    failures.push(`${label}: "${placed.text}" did not clear after scrolling (${sharp?.filter}, opacity ${sharp?.opacity})`);
  } else if (!(blur > clear + 0.5)) {
    failures.push(`${label}: "${placed.text}" blur did not change (${blurred.filter} -> ${sharp.filter})`);
  } else {
    console.log(`${label}: "${placed.text}" blur ${blur.toFixed(2)}px -> ${clear.toFixed(2)}px`);
  }

  await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(400);
  const atRest = await page.evaluate(() => {
    const parseBlur = (filter) => {
      const match = /blur\(([-\d.]+)px\)/.exec(filter);
      return match ? Number(match[1]) : 0;
    };
    const end = innerHeight * 0.85;
    for (const word of document.querySelectorAll('.is-split .reveal-word')) {
      if (word.closest('.reveal-manual, [data-no-reveal], .sr-only')) continue;
      const top = word.getBoundingClientRect().top;
      if (top < 0 || top > end) continue;
      const style = getComputedStyle(word);
      const b = parseBlur(style.filter);
      if (b > 0.5 || Number(style.opacity) < 0.99) {
        return { text: (word.textContent || '').slice(0, 24), b, opacity: style.opacity, top };
      }
    }
    return null;
  });
  if (atRest) {
    failures.push(
      `${label}: in-view copy still blurred at scroll 0 ("${atRest.text}", blur ${atRest.b}, opacity ${atRest.opacity}, top ${Math.round(atRest.top)})`,
    );
  } else {
    console.log(`${label}: in-view copy sharp at scroll 0 after reload`);
  }
}

for (const [label, viewport] of [
  ['desktop', { width: 1440, height: 900 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  const page = await browser.newPage({ viewport, reducedMotion: 'no-preference' });
  await check(page, label, viewport);
  await page.close();
}

await browser.close();
server.close();
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
console.log('intro blur OK');
