import { skyColor, skyInk, skyLock, skyYiq, skyRgb, type SkyInk } from '../lib/sky';

let timer = 0;
let hold: number | null = null;
let painted = '';

function minutesNow() {
  if (hold !== null) return hold;
  const date = new Date();
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

function hexFromCss(color: string) {
  const match = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?\s*\)/);
  if (!match) return null;
  if (match[4] !== undefined && Number(match[4]) === 0) return null;
  const bytes = [match[1], match[2], match[3]].map((part) =>
    Math.max(0, Math.min(255, Math.round(Number(part)))).toString(16).padStart(2, '0'),
  );
  return `#${bytes.join('')}`;
}

/** Paint the canvas, the page, and the browser chrome from the color already in use. */
export function syncThemeColor() {
  const hex = hexFromCss(getComputedStyle(document.documentElement).backgroundColor);
  if (!hex) return;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta && meta.content.toLowerCase() !== hex) meta.content = hex;
}

function applyPageBackground(color: string) {
  const root = document.documentElement;
  root.style.setProperty('--page-bg', color);
  root.style.backgroundColor = color;
  if (document.body) document.body.style.backgroundColor = color;
  syncThemeColor();
}

export function paintSky() {
  const sky = document.querySelector<HTMLElement>('[data-sky]');
  const root = document.documentElement;
  if (!sky) {
    syncThemeColor();
    return;
  }
  const minutes = minutesNow();
  const color = skyColor(minutes);
  if (color !== painted) {
    painted = color;
    sky.style.backgroundColor = color;
    applyPageBackground(color);
  }
  const prev: SkyInk | null = root.dataset.skyInk === 'white' || root.dataset.skyInk === 'black' ? root.dataset.skyInk : null;
  const next = skyInk(skyYiq(skyRgb(minutes)), prev);
  if (next !== prev) {
    root.dataset.skyInk = next;
    document.dispatchEvent(new Event('sky-ink'));
  }
}

export function initSky() {
  const sky = document.querySelector<HTMLElement>('[data-sky]');
  if (!sky || sky.dataset.bound) return;
  sky.dataset.bound = '';
  const locked = skyLock(location.search);
  if (locked !== null) hold = locked;
  const tick = () => {
    if (document.hidden) return;
    paintSky();
  };
  tick();
  if (!timer) timer = window.setInterval(tick, 1000);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tick();
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', tick);
}
