import { skyColor, skyInk, skyLock, skyYiq, skyRgb, type SkyInk } from '../lib/sky';

let timer = 0;
let hold: number | null = null;

function minutesNow() {
  if (hold !== null) return hold;
  const date = new Date();
  return date.getHours() * 60 + date.getMinutes() + date.getSeconds() / 60;
}

export function paintSky() {
  const sky = document.querySelector<HTMLElement>('[data-sky]');
  if (!sky) return;
  const minutes = minutesNow();
  sky.style.backgroundColor = skyColor(minutes);
  const root = document.documentElement;
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
}
