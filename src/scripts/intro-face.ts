/**
 * Homepage intro: the face starts huge and the name block pushes it down to its final size.
 * The face's bottom sits at a fixed document y (name top - gap), and it scales from its
 * bottom centre, so the gap to the name stays constant while scrolling: the name visibly
 * pushes it, 1:1 with scroll. At scroll R the scale reaches 1 and the face simply scrolls
 * with the page (no sticky, so release cannot jump). All layout values are whole px.
 */
export function initIntroFace(hero: HTMLElement) {
  const host = hero.querySelector<HTMLElement>('[data-hero-variant="blob"]');
  if (!host) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  let s0 = 1;
  let R = 1;
  let lastW = -1;

  const layout = () => {
    const vw = document.documentElement.clientWidth;
    if (vw === lastW) return; // ignore iOS address-bar height changes
    lastW = vw;
    const vh = Math.round(probe.getBoundingClientRect().height);
    const mobile = vw < 760;
    const W = Math.round(mobile ? Math.min(500, vw * 0.73) : Math.min(500, vw * 0.46));
    const H = Math.round((W * 249) / 559);
    const gap = mobile ? 96 : 160;
    const top = mobile ? 48 : 72; // final viewport top of the face
    const nameTop = Math.round(vh * 0.715);
    const faceBottom = nameTop - gap;
    const wrapTop = Math.round(host.parentElement!.getBoundingClientRect().top + scrollY);
    R = Math.max(1, faceBottom - H - top);
    s0 = Math.max(1, (vw * 1.15) / W);
    hero.style.setProperty('--intro-w', `${W}px`);
    hero.style.setProperty('--intro-face-top', `${faceBottom - H - wrapTop}px`);
    hero.style.setProperty('--intro-origin', `${faceBottom - wrapTop}px`);
    hero.style.setProperty('--intro-name-top', `${nameTop}px`);
    hero.dataset.introR = String(R);
    update();
  };

  const update = () => {
    const t = reduced ? 1 : Math.min(1, Math.max(0, scrollY / R));
    const s = s0 + (1 - s0) * t;
    host.style.transform = s === 1 ? '' : `scale(${s})`;
  };

  hero.dataset.intro = '';
  layout();
  addEventListener('scroll', update, { passive: true });
  addEventListener('resize', layout, { passive: true });
}
