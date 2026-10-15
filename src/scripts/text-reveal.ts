// Fallback for browsers without scroll-driven animations: text below the fold starts soft
// and turns sharp in 250ms as it enters the bottom of the viewport. Text that is already
// on screen, or that was scrolled past quickly, is never hidden.
const SELECTOR =
  '.about p, .text-block p, .footer-text p, .caption, .project-summary, .info-list li, .project-hero h1';

export function initTextReveal() {
  if (CSS.supports('animation-timeline: view()')) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (!('IntersectionObserver' in window)) return;

  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        io.unobserve(el);
        // scrolled past fast: show instantly
        if (entry.boundingClientRect.top < window.innerHeight * 0.5) {
          el.classList.remove('reveal-pending');
          continue;
        }
        el.classList.add('reveal-in');
        requestAnimationFrame(() => el.classList.remove('reveal-pending'));
        el.addEventListener('transitionend', () => el.classList.remove('reveal-in'), { once: true });
      }
    },
    { rootMargin: '0px 0px -5% 0px' },
  );

  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) return;
    el.classList.add('reveal-pending');
    io.observe(el);
  });
}
