const SHIFT = 100;

const STACK = '.project .scroll-media, .feed .card .scroll-media, .shop-product .scroll-media, .shop-detail .scroll-media';

export function isStackFrame(frame: HTMLElement) {
  return Boolean(frame.closest('.project, .feed .card, .shop-product, .shop-detail'));
}

const applied = new WeakMap<HTMLElement, number>();

let cachedScroll = Number.NaN;
let cachedVh = Number.NaN;
let cached = new Map<HTMLElement, { top: number; y: number }>();

function clamp01(v: number) {
  return Math.min(1, Math.max(0, v));
}

function layoutTop(frame: HTMLElement) {
  return frame.getBoundingClientRect().top - (applied.get(frame) ?? 0);
}

function motionMates(frame: HTMLElement) {
  const card = frame.closest('.feed .card');
  if (card) return [...card.children].filter((el): el is HTMLElement => el.classList.contains('caption'));
  const product = frame.closest('.shop-product');
  if (product) {
    return [...product.children].filter(
      (el): el is HTMLElement => el.classList.contains('shop-caption') || el.classList.contains('shop-desc-wrap'),
    );
  }
  return [];
}

function paintMates(frame: HTMLElement, y: number) {
  const shift = y === 0 ? '' : `translate3d(0, ${y}px, 0)`;
  for (const mate of motionMates(frame)) {
    mate.style.transition = y === 0 ? '' : 'none';
    mate.style.transform = shift;
  }
}

export function clearStackMates(frame: HTMLElement) {
  for (const mate of motionMates(frame)) {
    mate.style.transition = '';
    mate.style.transform = '';
  }
}

function rowShift(top: number, height: number, mid: number) {
  const bottom = top + height;
  if (top <= mid && bottom >= mid) return 0;
  if (bottom < mid && bottom > 0) {
    const t = (mid - bottom) / mid;
    return -SHIFT * t * t;
  }
  if (bottom <= 0) return -SHIFT;
  if (top > mid) {
    const t = Math.min(1, (top - mid) / mid);
    return SHIFT * t * t;
  }
  return 0;
}

function compute(vh: number) {
  const frames = [...document.querySelectorAll<HTMLElement>(STACK)];
  const measured = frames
    .map((frame) => ({ frame, top: layoutTop(frame), height: frame.offsetHeight }))
    .sort((a, b) => a.top - b.top);

  const rows: { top: number; height: number; frames: HTMLElement[] }[] = [];
  for (const item of measured) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(item.top - row.top) <= 4) {
      row.frames.push(item.frame);
      row.height = Math.max(row.height, item.height);
    } else rows.push({ top: item.top, height: item.height, frames: [item.frame] });
  }

  const mid = vh / 2;
  const y = rows.map((row) => Math.round(rowShift(row.top, row.height, mid)));

  const next = new Map<HTMLElement, { top: number; y: number }>();
  rows.forEach((row, index) => {
    for (const frame of row.frames) next.set(frame, { top: layoutTop(frame), y: y[index] });
  });
  return next;
}

export function paintProjectMedia(frame: HTMLElement, vh: number) {
  if (cachedScroll !== scrollY || cachedVh !== vh) {
    cachedScroll = scrollY;
    cachedVh = vh;
    cached = compute(vh);
  }

  const sample = cached.get(frame);
  const previous = applied.get(frame) ?? 0;
  const top = sample?.top ?? frame.getBoundingClientRect().top - previous;
  const y = sample?.y ?? 0;
  const bottom = top + frame.offsetHeight;

  const fadeStart = Math.round(vh * 1.05);
  const fadeEnd = Math.round(vh * 0.7);
  const span = Math.max(1, fadeStart - fadeEnd);
  const outside = fadeStart - Math.round(vh);
  const enter = clamp01((fadeStart - (top + y)) / span);
  const exit = clamp01((bottom + y + outside) / span);
  frame.style.opacity = Math.min(enter, exit).toFixed(3);

  applied.set(frame, y);
  frame.style.transform = y === 0 ? '' : `translate3d(0, ${y}px, 0)`;
  paintMates(frame, y);
  return top;
}
