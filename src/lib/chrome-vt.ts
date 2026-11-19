import { flushSync } from 'react-dom';

export type ChromeVtType = 'chrome-shrink' | 'chrome-grow';

export type ChromeVtOptions = {
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
  if (flag === 'contact' || flag === 'contact-face' || flag.startsWith('about-contact')) {
    root.dataset.contactVt = '';
  }

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
    const vt = document.startViewTransition(() => flushSync(update));
    return vt.finished.then(finish, finish);
  }
}
