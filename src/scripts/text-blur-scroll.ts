

const BLUR_PX = 4;
const LIFT_PX = 4;
const RANGE = 0.15;

function clamp(v: number, lo = 0, hi = 1) {
  return Math.min(hi, Math.max(lo, v));
}

/**
 * Enter across the bottom 15vh, the old `animation-range: cover 0px cover 15vh`.
 * Leave across the top 15vh: the same blur, fade, and 4px shift, aimed up.
 */
export function wordRevealState(word: HTMLElement, vh: number) {
  const top = word.getBoundingClientRect().top;
  const band = vh * RANGE;
  if (band <= 0) return { progress: top < vh ? 1 : 0, leaving: false };
  const enter = clamp((vh - top) / band);
  const exit = clamp(top / band);
  return { progress: Math.min(enter, exit), leaving: exit < enter };
}

export function wordRevealProgress(word: HTMLElement, vh: number) {
  return wordRevealState(word, vh).progress;
}

export function applyWordReveal(word: HTMLElement, t: number, leaving = false) {
  const p = clamp(t);
  const blur = BLUR_PX * (1 - p);
  const lift = LIFT_PX * (1 - p);
  word.style.setProperty('--reveal', p.toFixed(3));
  word.style.opacity = p.toFixed(3);
  word.style.filter = blur > 0.05 ? `blur(${blur.toFixed(2)}px)` : 'none';
  word.style.transform = p < 1 ? `translateY(${(leaving ? -lift : lift).toFixed(2)}px)` : 'none';
}

export function clearWordReveal(word: HTMLElement) {
  word.style.removeProperty('--reveal');
  word.style.opacity = '';
  word.style.filter = '';
  word.style.transform = '';
}

function collectWords(root: ParentNode = document) {
  return [...root.querySelectorAll<HTMLElement>('.is-split .reveal-word')].filter((word) => {
    if (word.closest('.site-header')) return false;
    if (word.parentElement?.closest('.reveal-word')) return false;
    if (word.closest('[data-no-reveal], .reveal-manual, .sr-only, .arrow-hint')) return false;
    if (word.querySelector('.motion-letter')) return false;
    return true;
  });
}

let bound = false;
let raf = 0;

function schedulePaint() {
  if (raf) return;
  raf = requestAnimationFrame(() => {
    raf = 0;
    paintScrollWords();
  });
}

export function paintScrollWords(root: ParentNode = document) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const vh = document.documentElement.clientHeight || window.innerHeight;
  for (const word of collectWords(root)) {
    const { progress, leaving } = wordRevealState(word, vh);
    applyWordReveal(word, progress, leaving);
  }
}

/** Run once layout has had a frame to settle (intro, fonts, media unhide). */
export function flushScrollWordBlur() {
  paintScrollWords();
  requestAnimationFrame(() => paintScrollWords());
}

export function initScrollWordBlur() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (bound) {
    flushScrollWordBlur();
    return;
  }
  bound = true;
  addEventListener('scroll', schedulePaint, { passive: true });
  addEventListener('resize', schedulePaint);
  addEventListener('load', schedulePaint);
  addEventListener('pageshow', schedulePaint);
  document.addEventListener('intro-layout', schedulePaint);
  void document.fonts?.ready.then(schedulePaint);
  visualViewport?.addEventListener('resize', schedulePaint);
  visualViewport?.addEventListener('scroll', schedulePaint);

  const root = document.documentElement;
  new MutationObserver(schedulePaint).observe(root, {
    attributes: true,
    attributeFilter: ['class'],
  });

  const main = document.querySelector('main');
  if (main) new ResizeObserver(schedulePaint).observe(main);

  flushScrollWordBlur();
}
