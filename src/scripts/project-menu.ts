
import { initHeroBlob } from './hero-blob';

let n = 0;

export function initProjectMenu() {
  document.querySelectorAll<HTMLElement>('[data-project-menu]').forEach((wrap) => {
    if (wrap.dataset.ready) return;
    wrap.dataset.ready = '';
    const face = wrap.querySelector<HTMLElement>('[data-project-face]')!;
    const nav = wrap.querySelector<HTMLElement>('.project-menu')!;
    nav.id ||= `small-menu-${++n}`;
    face.setAttribute('aria-controls', nav.id);
    const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
    const set = (on: boolean) => {
      wrap.classList.toggle('is-open', on);
      face.setAttribute('aria-expanded', String(on));
      nav.inert = !on;
    };
    set(false);
    if (fine) {
      initHeroBlob(wrap);
      face.addEventListener('pointerenter', () => set(true));
      wrap.addEventListener('pointerleave', () => {
        if (!wrap.contains(document.activeElement) || !document.activeElement?.matches(':focus-visible')) set(false);
      });
    } else {
      face.addEventListener('click', (e) => {
        e.preventDefault();
        set(!wrap.classList.contains('is-open'));
      });
      document.addEventListener('click', (e) => {
        if (!wrap.contains(e.target as Node)) set(false);
      });
    }
    let quiet = false;
    wrap.addEventListener('focusin', () => {
      if (quiet) return;
      if (face.matches(':focus-visible') || nav.contains(document.activeElement)) set(true);
    });
    wrap.addEventListener('focusout', (e) => {
      if (!wrap.contains(e.relatedTarget as Node)) set(false);
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape' || !wrap.classList.contains('is-open')) return;
      set(false);
      quiet = true;
      face.focus();
      quiet = false;
    });
  });
}
