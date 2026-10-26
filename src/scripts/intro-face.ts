/**
 * Homepage intro: the face is laid out at its biggest size and only ever scaled down, as one
 * composited layer (transform only, one rAF write per frame, no layout or re-raster per frame).
 * Its bottom sits at a fixed document y (name top - gap) and it scales from its bottom centre,
 * so the gap to the name stays constant: the name pushes it, 1:1 with scroll. At scroll R it
 * reaches the project-page mark size/top (--mark-small-w / --mark-small-top) and then simply
 * scrolls with the page, so there is no sticky release to jump. Layout values are whole px.
 */
export function initIntroFace(hero: HTMLElement) {
  const host = hero.querySelector<HTMLElement>('[data-hero-variant="blob"]');
  if (!host) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  let sMin = 1;
  let R = 1;
  let lastW = -1;
  let frame = 0;
  let lastS = NaN;

  const px = (name: string) => Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)));

  const layout = () => {
    const vw = document.documentElement.clientWidth;
    if (vw === lastW) return; // iOS address bar changes height only: no redraw
    lastW = vw;
    const vh = Math.round(probe.getBoundingClientRect().height);
    const mobile = vw < 760;
    const Wf = px('--mark-small-w') || 64;
    const topF = px('--mark-small-top') || 32;
    const W0 = Math.round(vw * 1.15); // largest size: laid out (and rastered) once at this
    const H0 = (W0 * 249) / 559;
    const Hf = (Wf * 249) / 559;
    const gap = mobile ? 96 : 160;
    const nameTop = Math.round(vh * 0.715);
    const faceBottom = nameTop - gap;
    host.style.transform = 'none';
    const hostTop = Math.round(host.getBoundingClientRect().top + scrollY);
    R = Math.max(1, Math.round(faceBottom - Hf - topF));
    sMin = Wf / W0;
    hero.style.setProperty('--intro-w', `${W0}px`);
    hero.style.setProperty('--intro-face-top', `${Math.round(faceBottom - H0) - hostTop}px`);
    hero.style.setProperty('--intro-origin', `${faceBottom - hostTop}px`);
    hero.style.setProperty('--intro-name-top', `${nameTop}px`);
    hero.dataset.introR = String(R);
    lastS = NaN;
    write();
  };

  const write = () => {
    frame = 0;
    // clamp: rubber-band overscroll (negative scrollY) holds the start state
    const t = reduced ? 1 : Math.min(1, Math.max(0, scrollY / R));
    const s = 1 + (sMin - 1) * t;
    if (s === lastS) return;
    lastS = s;
    host.style.transform = `scale(${s})`;
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(write);
  };

  hero.dataset.intro = '';
  layout();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', layout, { passive: true });
}
