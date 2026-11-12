import { bindAppViewport } from '../lib/viewport-layout';
import { playSnick } from './ui-sound';

bindAppViewport();

const typing = (event: Event) =>
  event.target instanceof Element && !!event.target.closest('input, textarea, [contenteditable="true"]');

export function initServiceSteps() {
  const root = document.querySelector<HTMLElement>('[data-service-steps]');
  if (!root || root.dataset.bound) return;
  root.dataset.bound = 'true';

  const steps = [...root.querySelectorAll<HTMLElement>('[data-step]')];
  const left = root.querySelector<HTMLButtonElement>('[data-dir="left"]');
  const right = root.querySelector<HTMLButtonElement>('[data-dir="right"]');
  const back = root.querySelector<HTMLAnchorElement>('[data-service-back]');
  let index = steps.findIndex((step) => !step.hidden);
  if (index < 0) index = 0;

  const show = (next: number) => {
    index = Math.max(0, Math.min(steps.length - 1, next));
    steps.forEach((step, i) => {
      step.hidden = i !== index;
    });
    if (left) left.hidden = index === 0;
    if (right) right.hidden = index >= steps.length - 1;
  };

  const press = (el: HTMLElement) => {
    root.querySelectorAll('.is-pressed').forEach((item) => item.classList.remove('is-pressed'));
    el.classList.add('is-pressed');
    playSnick();
  };

  if (back) {
    back.addEventListener('click', (event) => {
      if (!document.referrer.startsWith(location.origin) || history.length < 2) return;
      event.preventDefault();
      history.back();
    });
  }

  left?.addEventListener('click', () => show(index - 1));
  right?.addEventListener('click', () => show(index + 1));

  root.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const el = (event.target as Element).closest<HTMLElement>('.arrow-pill, .arrow-back, .service-inquire');
    if (el && root.contains(el) && !el.hidden) press(el);
  });

  const release = () => root.querySelectorAll('.is-pressed').forEach((el) => el.classList.remove('is-pressed'));
  window.addEventListener('pointerup', release);
  window.addEventListener('pointercancel', release);

  const keyControl = (key: string) => {
    if (key === 'ArrowLeft') return left && !left.hidden ? left : null;
    if (key === 'ArrowRight') return right && !right.hidden ? right : null;
    if (key === 'ArrowUp' || key === 'Escape' || key === 'Backspace') return back;
    return null;
  };

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.altKey || event.ctrlKey || event.repeat || typing(event)) return;
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

  show(index);
}
