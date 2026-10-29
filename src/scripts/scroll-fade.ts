

const SELECTOR = '.fade-in';

function inFirstView(el: Element) {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;

  return rect.top < vh * 0.92 && rect.bottom > 0;
}

function observeTarget(el: Element): Element {
  if (el instanceof HTMLElement && getComputedStyle(el).display === 'contents' && el.firstElementChild) {
    return el.firstElementChild;
  }
  return el;
}

function reveal(el: Element) {
  el.classList.add('is-in');
  el.querySelectorAll<HTMLImageElement>('.frame img').forEach((img) => {
    if (img.complete) img.classList.add('is-ready');
  });
}

export function initScrollFade() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  const nodes = Array.from(document.querySelectorAll(SELECTOR));
  if (!nodes.length) return;

  const pending: Element[] = [];
  for (const el of nodes) {
    const target = observeTarget(el);
    if (inFirstView(target)) reveal(el);
    else pending.push(el);
  }

  document.documentElement.classList.add('fade-ready');

  if (!pending.length) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const host = (entry.target as HTMLElement).closest(SELECTOR) || entry.target;
        reveal(host);
        io.unobserve(entry.target);
      }
    },
    {
      threshold: 0.12,

      rootMargin: '0px 0px 12% 0px',
    },
  );

  for (const el of pending) {
    io.observe(observeTarget(el));
  }
}
