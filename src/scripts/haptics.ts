// Light haptic tick on every link and button tap, touch devices only.
// iOS 26.5+: @haptics/vanilla puts an invisible <input type=checkbox switch>
// over each tagged element (the only path iOS still buzzes for), then replays
// the click on the element. Android: navigator.vibrate. Desktop: nothing.
import { Haptics } from '@haptics/vanilla';

const TARGETS = 'a[href], button, summary, [role="button"]';

if (window.matchMedia('(pointer: coarse)').matches) {
  // Project cards have two links (cover and caption). Make the whole card one
  // haptic host so a tap anywhere on it ticks once, then follow the cover link.
  // Skipped where the card is display: contents (wide grid), since it has no box.
  document.querySelectorAll<HTMLElement>('.card').forEach((card) => {
    const link = card.querySelector<HTMLAnchorElement>('a[href]');
    if (!link || getComputedStyle(card).display === 'contents') return;
    card.setAttribute('data-haptic', 'selection');
    card.querySelectorAll('a[href]').forEach((a) => a.setAttribute('data-no-haptic', ''));
    card.addEventListener('click', (e) => {
      if (e.target === card) link.click();
    });
  });
  const tag = (root: ParentNode) => {
    root.querySelectorAll<HTMLElement>(TARGETS).forEach((el) => {
      if (!el.hasAttribute('data-haptic') && !el.hasAttribute('data-no-haptic')) {
        el.setAttribute('data-haptic', 'selection');
      }
    });
  };
  tag(document);
  new MutationObserver((list) => {
    for (const m of list) m.addedNodes.forEach((n) => n instanceof HTMLElement && tag(n));
  }).observe(document.body, { childList: true, subtree: true });
  new Haptics();
}
