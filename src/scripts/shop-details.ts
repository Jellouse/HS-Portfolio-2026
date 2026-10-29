

import { playIn, playOut, prepareReveal, revealDuration } from './text-reveal';

const HEIGHT_MS = 400;
const LEAD_MS = 120;

export function initShopDetails() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll<HTMLButtonElement>('.shop-details[aria-controls]').forEach((button) => {
    const panel = document.getElementById(button.getAttribute('aria-controls') || '');
    const text = panel?.querySelector<HTMLElement>('.shop-desc');
    if (!panel || !text) return;
    const timers: number[] = [];
    const clear = () => timers.splice(0).forEach(clearTimeout);
    const later = (fn: () => void, ms: number) => timers.push(window.setTimeout(fn, ms));

    const open = () => {
      clear();
      button.setAttribute('aria-expanded', 'true');
      const from = panel.hidden ? 0 : panel.getBoundingClientRect().height;
      panel.hidden = false;
      if (reduced) {
        panel.style.height = '';
        return;
      }
      prepareReveal(text, true);
      panel.style.height = 'auto';
      const to = panel.getBoundingClientRect().height;
      panel.style.height = `${from}px`;
      void panel.offsetHeight;
      panel.style.height = `${to}px`;
      later(() => playIn(text), LEAD_MS);
      later(() => (panel.style.height = ''), HEIGHT_MS);
    };

    const close = () => {
      clear();
      button.setAttribute('aria-expanded', 'false');
      if (reduced) {
        panel.hidden = true;
        return;
      }
      playOut(text);
      later(() => {
        panel.style.height = `${panel.getBoundingClientRect().height}px`;
        void panel.offsetHeight;
        panel.style.height = '0px';
      }, Math.max(0, revealDuration(text) - LEAD_MS));
      later(() => {
        panel.hidden = true;
        panel.style.height = '';
      }, revealDuration(text) - LEAD_MS + HEIGHT_MS);
    };

    button.addEventListener('click', () => (button.getAttribute('aria-expanded') === 'true' ? close() : open()));
  });
}
