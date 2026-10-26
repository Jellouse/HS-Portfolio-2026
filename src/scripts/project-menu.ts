/**
 * Project page header: hovering the face opens the menu (items slide out from behind the face,
 * symmetrically) and pushes the content down a little; leaving the general area closes it.
 * Items start black; hovering one grays the others (CSS). On touch, tapping the face toggles
 * the menu instead of going home (Home is in the menu). The face follows the mouse like the
 * homepage face (fine pointers only).
 */
import { initHeroBlob } from './hero-blob';

export function initProjectMenu() {
  document.querySelectorAll<HTMLElement>('[data-project-menu]').forEach((wrap) => {
    if (wrap.dataset.ready) return;
    wrap.dataset.ready = '';
    const face = wrap.querySelector<HTMLElement>('[data-project-face]')!;
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const set = (on: boolean) => wrap.classList.toggle('is-open', on);
    if (fine) {
      initHeroBlob(wrap);
      face.addEventListener('pointerenter', () => set(true));
      wrap.addEventListener('pointerleave', () => set(false));
    } else {
      face.addEventListener('click', (e) => {
        e.preventDefault();
        set(!wrap.classList.contains('is-open'));
      });
      document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target as Node)) set(false);
      });
    }
  });
}
