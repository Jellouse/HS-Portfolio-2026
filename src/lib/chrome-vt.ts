/**
 * Shared chrome view-transition runner.
 *
 * Site chrome (face, back, L/R pills) uses fixed view-transition names.
 * Contact opts in with `data-chrome-vt` on its hub and runs every screen
 * change through `runChromeVt`, so About → contact and contact step hops
 * share one path, duration, and easing with Services.
 *
 * Sets `html[data-chrome-vt-run]` while running so CSS can freeze the root
 * snapshot without activating the `[data-chrome-vt] …` name selectors (those
 * belong on `.arrow-nav` roots only).
 *
 * Types:
 * - `chrome-shrink` / `chrome-grow` — paired faces of the same shape, size only
 * - (none) — crossfade for labels, fields, and shape changes (face ↔ field)
 */
import { flushSync } from 'react-dom';

export type ChromeVtType = 'chrome-shrink' | 'chrome-grow';

export type ChromeVtOptions = {
  /** Written to `html[data-chrome-vt-run]` while the transition runs. */
  flag?: string;
  types?: ChromeVtType[];
};

export function reduceMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function canChromeVt() {
  return typeof document.startViewTransition === 'function' && !reduceMotion();
}

export function runChromeVt(update: () => void, opts: ChromeVtOptions = {}): Promise<void> {
  if (!canChromeVt()) {
    update();
    return Promise.resolve();
  }
  const root = document.documentElement;
  const flag = opts.flag ?? '';
  root.dataset.chromeVtRun = flag;
  // Contact panel entrance suppress while chrome owns the morph.
  if (flag === 'contact' || flag.startsWith('about-contact')) root.dataset.contactVt = '';

  const finish = () => {
    delete root.dataset.chromeVtRun;
    delete root.dataset.contactVt;
  };

  try {
    const vt = document.startViewTransition({
      update: () => {
        flushSync(update);
      },
      types: opts.types ?? [],
    });
    return vt.finished.then(finish, finish);
  } catch {
    // Older startViewTransition that only takes a callback.
    const vt = document.startViewTransition(() => flushSync(update));
    return vt.finished.then(finish, finish);
  }
}
