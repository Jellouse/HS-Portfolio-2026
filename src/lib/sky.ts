/** Flat gray sky. White while the sun is up, black after twilight, mid gray around local sunset and sunrise. */

export const SKY_DAY = 255;
export const SKY_NIGHT = 0;

/** Sun this far above the horizon is full day. The same amount below is full night. */
const SUN_BAND = 12;

export type SkyInk = 'white' | 'black';
export type SkyPlace = { lat: number; lon: number };

const DAY_MINUTES = 1440;

let placeMap: Map<string, SkyPlace> | null = null;

function places(): Map<string, SkyPlace> {
  if (placeMap) return placeMap;
  placeMap = new Map();
  const packed = typeof document === 'undefined' ? '' : document.querySelector('[data-sky]')?.getAttribute('data-sky-places') || '';
  for (const row of packed.split('|')) {
    const [zone, lat, lon] = row.split(',');
    if (!zone) continue;
    placeMap.set(zone, { lat: Number(lat), lon: Number(lon) });
  }
  return placeMap;
}

/** Minutes after midnight, or null when the query does not lock a time. */
export function skyLock(search: string): number | null {
  const raw = new URLSearchParams(search).get('t');
  if (!raw) return null;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(raw);
  if (clock) {
    const hours = Number(clock[1]);
    const mins = Number(clock[2]);
    if (hours > 23 || mins > 59) return null;
    return hours * 60 + mins;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n >= DAY_MINUTES) return null;
  return n;
}

export function skyPlace(timeZone: string, when = new Date()): SkyPlace {
  const known = places().get(timeZone);
  if (known) return known;
  const jan = new Date(when.getFullYear(), 0, 1).getTimezoneOffset();
  const jul = new Date(when.getFullYear(), 6, 1).getTimezoneOffset();
  return { lat: 45, lon: -Math.max(jan, jul) / 4 };
}

function dayAngle(when: Date) {
  const start = Date.UTC(when.getFullYear(), 0, 0);
  const noon = Date.UTC(when.getFullYear(), when.getMonth(), when.getDate());
  const n = Math.round((noon - start) / 86400000);
  return ((Math.PI * 2) / 365) * (n - 1);
}

function sunPath(when: Date) {
  const g = dayAngle(when);
  const decl =
    0.006918 -
    0.399912 * Math.cos(g) +
    0.070257 * Math.sin(g) -
    0.006758 * Math.cos(2 * g) +
    0.000907 * Math.sin(2 * g) -
    0.002697 * Math.cos(3 * g) +
    0.00148 * Math.sin(3 * g);
  const eqTime =
    229.18 *
    (0.000075 +
      0.001868 * Math.cos(g) -
      0.032077 * Math.sin(g) -
      0.014615 * Math.cos(2 * g) -
      0.040849 * Math.sin(2 * g));
  return { decl, eqTime };
}

function altitude(minutes: number, place: SkyPlace, decl: number, eqTime: number, utcOffsetMin: number) {
  const trueSolar = minutes + eqTime + 4 * place.lon - utcOffsetMin;
  const hourAngle = (trueSolar / 4 - 180) * (Math.PI / 180);
  const lat = place.lat * (Math.PI / 180);
  const sinAlt = Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(hourAngle);
  return (Math.asin(Math.min(1, Math.max(-1, sinAlt))) * 180) / Math.PI;
}

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

/** 0 at night, 1 in the day, 0.5 when the sun is on the horizon. */
export function skyBlendAt(minutes: number, when: Date, place: SkyPlace, utcOffsetMin: number) {
  const { decl, eqTime } = sunPath(when);
  const noonAlt = altitude(720 - (eqTime + 4 * place.lon - utcOffsetMin), place, decl, eqTime, utcOffsetMin);
  if (noonAlt <= -SUN_BAND) return 0;
  const hi = Math.min(SUN_BAND, noonAlt);
  const alt = altitude(minutes, place, decl, eqTime, utcOffsetMin);
  if (alt >= hi) return 1;
  if (alt <= -SUN_BAND) return 0;
  return smooth((alt + SUN_BAND) / (hi + SUN_BAND));
}

export function skyBlend(minutes: number, when = new Date()) {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const place = skyPlace(zone, when);
  const noon = new Date(when.getFullYear(), when.getMonth(), when.getDate(), 12, 0, 0);
  return skyBlendAt(minutes, when, place, -noon.getTimezoneOffset());
}

export function skyLevel(minutes: number, when = new Date()) {
  return Math.round(SKY_NIGHT + (SKY_DAY - SKY_NIGHT) * skyBlend(minutes, when));
}

export function skyRgb(minutes: number, when = new Date()) {
  const level = skyLevel(minutes, when);
  return [level, level, level];
}

export function skyYiq(rgb: number[]) {
  return (rgb[0] * 299 + rgb[1] * 587 + rgb[2] * 114) / 1000;
}

export function skyInk(yiq: number, prev: SkyInk | null): SkyInk {
  if (prev === 'black') return yiq < 136 ? 'white' : 'black';
  if (prev === 'white') return yiq > 156 ? 'black' : 'white';
  return yiq >= 148 ? 'black' : 'white';
}

export function skyColor(minutes: number, when = new Date()) {
  const level = skyLevel(minutes, when);
  return `rgb(${level} ${level} ${level})`;
}
