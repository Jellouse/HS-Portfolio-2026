/**
 * /shop header: the Industrial Bloom ring starts big with its centre on the viewport top (half
 * cut off), then scales down and drifts a little lower until, at scroll R, it sits exactly where
 * the small ring sits on /shop/<slug> (54px, top 44 / 32 mobile). After R it scrolls with the
 * page. Same mechanic as the homepage face: transform only, rAF with 30ms exponential smoothing,
 * or a CSS scroll-driven animation on touch. The spin (rotate) lives on the inner .shop-mark,
 * the scale on this host, so spin-mark.ts keeps working untouched.
 */
export function initShopIntro(head: HTMLElement) {
  const host = head.querySelector<HTMLElement>('[data-shop-ring]');
  const title = head.querySelector<HTMLElement>('.shop-head-title');
  if (!host || !title) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const sda =
    !reduced &&
    matchMedia('(pointer: coarse)').matches &&
    CSS.supports('animation-timeline: scroll()') &&
    new URLSearchParams(location.search).get('intro') !== 'raf';
  const TAU = 30;
  let R = 1;
  let sMin = 1;
  let dy = 0;
  let lastW = -1;
  let cur = NaN;
  let lastT = 0;
  let frame = 0;

  const layout = () => {
    const vw = document.documentElement.clientWidth;
    if (vw === lastW) return;
    lastW = vw;
    const mobile = vw < 760;
    const W0 = Math.round((vw * (mobile ? 0.9 : 0.68)) / 2) * 2; // even, so the centre is a whole px
    const Wf = 54;
    const topF = mobile ? 32 : 44; // .shop-detail padding-top
    const titleF = topF + Wf + (mobile ? 96 : 130); // detail h1 top
    head.classList.remove('is-sda');
    host.style.transform = 'none';
    const box = host.getBoundingClientRect();
    const c0 = box.top + box.height / 2 + scrollY; // ring centre doc y (about 0)
    const titleTop = Math.round(title.getBoundingClientRect().top + scrollY);
    R = Math.max(1, titleTop - titleF);
    sMin = Wf / W0;
    dy = R + topF + Wf / 2 - c0; // ring centre: doc y 0 -> viewport y topF + 27 at scroll R
    head.style.setProperty('--ring-w', `${W0}px`);
    head.style.setProperty('--ring-r', `${R}px`);
    head.style.setProperty('--ring-dy', `${Math.round(dy)}px`);
    head.style.setProperty('--ring-smin', String(sMin));
    head.style.setProperty('--ring-menu-top', `${R + topF + Wf + 16}px`);
    head.dataset.ringR = String(R);
    cur = NaN;
    if (sda) {
      host.style.transform = '';
      head.classList.add('is-sda');
    } else write(performance.now());
  };

  const write = (now: number) => {
    frame = 0;
    const t = reduced ? 1 : Math.min(1, Math.max(0, scrollY / R));
    const dt = lastT ? Math.min(100, now - lastT) : 16;
    lastT = now;
    if (reduced || Number.isNaN(cur)) cur = t;
    else cur += (t - cur) * (1 - Math.exp(-dt / TAU));
    if (Math.abs(t - cur) < 0.0005) cur = t;
    host.style.transform = `translateY(${(dy * cur).toFixed(2)}px) scale(${1 + (sMin - 1) * cur})`;
    head.toggleAttribute('data-ring-settled', cur === t);
    if (cur !== t) frame = requestAnimationFrame(write);
    else lastT = 0;
  };

  if (sda) head.toggleAttribute('data-ring-settled', true);
  layout();
  if (!sda) addEventListener('scroll', () => frame || (frame = requestAnimationFrame(write)), { passive: true });
  addEventListener('resize', layout, { passive: true });
}
