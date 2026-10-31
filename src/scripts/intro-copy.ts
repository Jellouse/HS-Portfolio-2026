let progress = 0;
let enabled = false;
let bound = false;

function apply() {
  document.querySelectorAll<HTMLElement>('[data-intro-copy]').forEach((el) => {
    if (!enabled) {
      el.style.opacity = '';
      el.style.pointerEvents = '';
      return;
    }
    if (el.matches(':focus-within')) {
      el.style.opacity = '1';
      el.style.pointerEvents = '';
      return;
    }
    if (progress <= 0.0005) {
      el.style.opacity = '';
      el.style.pointerEvents = '';
      return;
    }
    const opacity = Math.max(0, 1 - progress);
    el.style.opacity = opacity.toFixed(3);
    el.style.pointerEvents = opacity < 0.05 ? 'none' : '';
  });
}

/** `progress` is 0 at rest and 1 when the illustration has finished moving into the header. */
export function setIntroCopy(next: number, on: boolean) {
  progress = next;
  enabled = on;
  if (!bound) {
    bound = true;
    addEventListener('focusin', apply);
    addEventListener('focusout', apply);
  }
  apply();
}
