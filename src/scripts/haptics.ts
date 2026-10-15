// Light haptic tick on every link and button tap, touch devices only.
// iOS 26.5+: @haptics/vanilla puts an invisible <input type=checkbox switch>
// over each tagged element (the only path iOS still buzzes for), then replays
// the click on the element. Android: navigator.vibrate. Desktop: nothing.
import { Haptics } from '@haptics/vanilla';

const TARGETS = 'a[href], button, summary, [role="button"]';

if (window.matchMedia('(pointer: coarse)').matches) {
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
