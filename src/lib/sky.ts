/** Flat gray sky. Black at midnight, white at noon, mid gray at 06:00 and 18:00. */

export const SKY_DAY = 255;
export const SKY_NIGHT = 0;

export type SkyInk = 'white' | 'black';

const DAY_MINUTES = 1440;

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

/** 0 at midnight, 1 at noon. */
export function skyBlend(minutes: number) {
  const turns = (((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES) / DAY_MINUTES;
  return 0.5 - 0.5 * Math.cos(turns * Math.PI * 2);
}

export function skyLevel(minutes: number) {
  return Math.round(SKY_NIGHT + (SKY_DAY - SKY_NIGHT) * skyBlend(minutes));
}

export function skyRgb(minutes: number) {
  const level = skyLevel(minutes);
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

export function skyColor(minutes: number) {
  const level = skyLevel(minutes);
  return `rgb(${level} ${level} ${level})`;
}

export function skyClock(minutes: number) {
  const whole = Math.round(minutes) % DAY_MINUTES;
  const hours = Math.floor(whole / 60);
  const mins = whole % 60;
  return `${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
}
