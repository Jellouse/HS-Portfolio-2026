import { bindAppViewport } from '../lib/viewport-layout';
import { bindArrowControls } from './arrow-controls';

bindAppViewport();

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

  left?.addEventListener('click', () => show(index - 1));
  right?.addEventListener('click', () => show(index + 1));

  bindArrowControls({
    root,
    back,
    left,
    right,
    pressSelector: '.arrow-pill, .arrow-back, .service-inquire',
  });

  show(index);
}
