import { bindArrowControls } from './arrow-controls';

/** Projects step through their sections with the arrow keys. Products do not. */
export function initProjectBack(sections = false) {
  const back = document.querySelector<HTMLAnchorElement>('[data-project-back]');
  const root = back?.parentElement;
  if (!back || !root || back.dataset.bound) return;
  back.dataset.bound = 'true';
  bindArrowControls({ root, back, backMode: 'arrow-return', sections });
}
