export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return null;
  const smooth = !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const nudge = matchMedia('(min-width: 760px)').matches
    ? Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--scroll-nudge')) || 0
    : 0;
  scrollTo({
    top: Math.max(0, el.getBoundingClientRect().top + scrollY - nudge),
    behavior: smooth ? 'smooth' : 'auto',
  });
  return el;
}
