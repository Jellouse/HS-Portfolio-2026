import { isExitKey, isTypingTarget } from '../lib/browser';
import { routeAfterSnick } from './arrow-route';
import { projectSections } from './project-sections';
import { playSnick } from './ui-sound';

interface Props {
  root: HTMLElement;
  back?: HTMLElement | null;
  left?: HTMLElement | null;
  right?: HTMLElement | null;
  pressSelector?: string;
  backMode?: 'referrer' | 'arrow-return';
  /** On a project, the arrow keys step through its sections. */
  sections?: boolean;
}

export function bindArrowControls({
  root,
  back,
  left,
  right,
  pressSelector = '.arrow-pill, .arrow-back',
  backMode = 'referrer',
  sections = false,
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

  const steps = sections ? projectSections(root) : null;

  /**
   * On a project, Up and Down belong to the section stepping, even when there
   * is nowhere left to go. Handing them back to the browser would let it
   * scroll its own nudge and push the page off the stop it is sitting on.
   */
  const stepControl = (key: string) => {
    if (!steps) return false;
    if (key === 'ArrowDown') return steps.down();
    if (key === 'ArrowUp') return steps.up();
    // Up at the very top is the Back press, so it falls through to the control.
    return false;
  };

  // Holding an arrow keeps stepping, after the same first pause the gallery
  // uses. Each repeat comes a little sooner, so it eases into a run.
  const HOLD_FIRST_MS = 480;
  const HOLD_FAST_MS = 180;
  const HOLD_DECAY = 0.78;
  let holdTimer = 0;
  let holdKey = '';

  const stopHold = () => {
    if (holdTimer) clearTimeout(holdTimer);
    holdTimer = 0;
    holdKey = '';
  };

  const startHold = (key: string) => {
    stopHold();
    holdKey = key;
    let wait = HOLD_FIRST_MS;
    const tick = () => {
      if (!stepControl(key)) {
        stopHold();
        return;
      }
      wait = Math.max(HOLD_FAST_MS, Math.round(wait * HOLD_DECAY));
      holdTimer = window.setTimeout(tick, wait);
    };
    holdTimer = window.setTimeout(tick, wait);
  };

  const keyControl = (key: string) => {
    if (key === 'ArrowLeft') return left && !left.hidden ? left : null;
    if (key === 'ArrowRight') return right && !right.hidden ? right : null;
    if (isExitKey(key)) return back ?? null;
    return null;
  };

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.altKey || event.ctrlKey || isTypingTarget(event.target)) return;
    if (document.documentElement.classList.contains('is-contact-open')) return;

    const el = keyControl(event.key);

    // On a project, Up and Down belong to the section stepping. Block the
    // browser's own key repeat before anything else: while a key is held it
    // fires keydown over and over, and any one of those left un-prevented lets
    // the browser scroll natively alongside our steps. That is what turned a
    // held arrow into a couple of steps and then a slow linear crawl. Our own
    // repeat below does the stepping instead.
    if (steps && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      event.preventDefault();
      if (event.repeat) return;
      if (stepControl(event.key)) startHold(event.key);
      // Up at the very top is the Back press, handled on keyup.
      else if (el) press(el);
      return;
    }

    if (!el) return;
    event.preventDefault();
    if (event.repeat) return;
    press(el);
  });

  window.addEventListener('keyup', (event) => {
    if (holdKey === event.key) stopHold();
    if (document.documentElement.classList.contains('is-contact-open')) return;
    const el = keyControl(event.key);
    if (!el?.classList.contains('is-pressed')) return;
    el.classList.remove('is-pressed');
    el.click();
  });

  window.addEventListener('blur', stopHold);
  addEventListener('wheel', stopHold, { passive: true });
  addEventListener('touchstart', stopHold, { passive: true });
}
