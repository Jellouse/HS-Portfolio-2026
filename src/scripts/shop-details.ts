// /shop "Details" toggles: the description opens in place with the site's text reveal
// (blur-to-sharp per line, 400ms ease-out-expo, 30ms per-line stagger) while its height
// grows; closing plays the same motion in reverse (last line first). Reduced motion: instant.
import { split } from './text-reveal';

const MS = 400;
const STAGGER = 30;

export function initShopDetails() {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll<HTMLButtonElement>('.shop-details[aria-controls]').forEach((button) => {
    const panel = document.getElementById(button.getAttribute('aria-controls') || '');
    if (!panel) return;
    const text = panel.querySelector<HTMLElement>('.shop-desc');
    let timer = 0;

    const open = () => {
      clearTimeout(timer);
      panel.hidden = false;
      panel.classList.remove('is-closing');
      if (text && !reduced) {
        split(text);
        const lines = new Set([...text.querySelectorAll<HTMLElement>('.reveal-word')].map((w) => w.style.getPropertyValue('--line')));
        panel.style.setProperty('--lines', String(lines.size));
      }
      void panel.offsetHeight; // start from the closed state
      panel.classList.add('is-open');
      button.setAttribute('aria-expanded', 'true');
    };

    const close = () => {
      clearTimeout(timer);
      panel.classList.add('is-closing');
      panel.classList.remove('is-open');
      button.setAttribute('aria-expanded', 'false');
      const lines = Number(panel.style.getPropertyValue('--lines')) || 1;
      const wait = reduced ? 0 : MS + (lines - 1) * STAGGER;
      timer = window.setTimeout(() => {
        panel.hidden = true;
        panel.classList.remove('is-closing');
      }, wait);
    };

    button.addEventListener('click', () => (button.getAttribute('aria-expanded') === 'true' ? close() : open()));
  });
}
