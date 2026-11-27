import { bindArrowControls } from './arrow-controls';

export function initProjectBack() {
  const back = document.querySelector<HTMLAnchorElement>('[data-project-back]');
  const root = back?.parentElement;
  if (!back || !root || back.dataset.bound) return;
  back.dataset.bound = 'true';
  bindArrowControls({ root, back, backMode: 'arrow-return' });
}
