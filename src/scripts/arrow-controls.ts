import { isExitKey, isTypingTarget } from '../lib/browser';
import { routeAfterSnick } from './arrow-route';
import { playSnick } from './ui-sound';

interface Props {
  root: HTMLElement;
  back?: HTMLElement | null;
  left?: HTMLElement | null;
  right?: HTMLElement | null;
  pressSelector?: string;
  backMode?: 'referrer' | 'arrow-return';
}

export function bindArrowControls({
  root,
  back,
  left,
  right,
  pressSelector = '.arrow-pill, .arrow-back',
  backMode = 'referrer',
}: Props) {
  const press = (el: HTMLElement) => {
    root.querySelectorAll('.is-pressed').forEach((item) => item.classList.remove('is-pressed'));
    el.classList.add('is-pressed');
    playSnick();
  };

  if (back) {
    back.addEventListener('click', (event) => {
      if (event.metaKey || event.altKey || event.ctrlKey || event.shiftKey) return;
      if (backMode === 'arrow-return') {
        if (sessionStorage.getItem('arrow-return') === '1' && history.length >= 2) {
          sessionStorage.removeItem('arrow-return');
          event.preventDefault();
          history.back();
          return;
        }
      } else if (document.referrer.startsWith(location.origin) && history.length >= 2) {
        event.preventDefault();
        history.back();
        return;
      }
      const href = back.getAttribute('href');
      if (!href) return;
      event.preventDefault();
      routeAfterSnick(href);
    });
  }

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const el = (event.target as Element).closest<HTMLElement>(pressSelector);
    if (el && root.contains(el) && !el.hidden) press(el);
  });

  const release = () => root.querySelectorAll('.is-pressed').forEach((el) => el.classList.remove('is-pressed'));
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  const keyControl = (key: string) => {
    if (key === 'ArrowLeft') return left && !left.hidden ? left : null;
    if (key === 'ArrowRight') return right && !right.hidden ? right : null;
    if (isExitKey(key)) return back ?? null;
    return null;
  };

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.altKey || event.ctrlKey || event.repeat || isTypingTarget(event.target)) return;
    if (document.documentElement.classList.contains('is-contact-open')) return;
    const el = keyControl(event.key);
    if (!el) return;
    event.preventDefault();
    press(el);
  });

  window.addEventListener('keyup', (event) => {
    if (document.documentElement.classList.contains('is-contact-open')) return;
    const el = keyControl(event.key);
    if (!el?.classList.contains('is-pressed')) return;
    el.classList.remove('is-pressed');
    el.click();
  });
}
