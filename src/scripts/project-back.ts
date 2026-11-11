import { playSnick } from './ui-sound';

/** Circular back control on a project or a shop product. */
export function initProjectBack() {
  const back = document.querySelector<HTMLAnchorElement>('[data-project-back]');
  if (!back || back.dataset.bound) return;
  back.dataset.bound = 'true';
  const typing = (event: Event) =>
    event.target instanceof Element && !!event.target.closest('input, textarea, [contenteditable="true"]');
  const leaves = (key: string) => key === 'ArrowUp' || key === 'Escape' || key === 'Backspace';
  back.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    playSnick();
  });
  back.addEventListener('click', (event) => {
    if (sessionStorage.getItem('arrow-return') !== '1' || history.length < 2) return;
    sessionStorage.removeItem('arrow-return');
    event.preventDefault();
    history.back();
  });
  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.altKey || event.ctrlKey || event.repeat) return;
    if (typing(event) || !leaves(event.key)) return;
    if (document.documentElement.classList.contains('is-contact-open')) return;
    event.preventDefault();
    back.classList.add('is-pressed');
    playSnick();
  });
  window.addEventListener('keyup', (event) => {
    if (!back.classList.contains('is-pressed') || !leaves(event.key)) return;
    back.classList.remove('is-pressed');
    back.click();
  });
}
