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

  const layer = head.querySelector<HTMLElement>('[data-shop-ring-layer]')!;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  // Shared with the homepage (intro-face.ts): the name block top, and the illustration centre.
  // Phones: the ring is centred between the viewport top and the title (equal space above and
  // below), on the same centre as the home face. Desktop: the ring is the size of the home face's
  // height and shares its centre and its 160px gap to the name; like the face it runs off the top.
  const layout = () => {
    const vw = document.documentElement.clientWidth;
    if (vw === lastW) return;
    lastW = vw;
    const vh = Math.round(probe.getBoundingClientRect().height);
    const mobile = vw < 760;
    const nameTop = Math.round(vh * (mobile ? 0.715 : 0.772));
    document.documentElement.style.setProperty('--intro-name-top', `${nameTop}px`);
    const faceH = Math.round(((Math.round(vw * 1.15) * 249) / 559) / 2) * 2;
    const W0 = mobile ? Math.round((vw * 0.9) / 2) * 2 : faceH; // even, so the centre is a whole px
    const C = mobile ? Math.round(nameTop / 2) : nameTop - 160 - W0 / 2;
    const Wf = 54;
    const topF = mobile ? 32 : 44; // .shop-detail padding-top
    const titleF = topF + Wf + (mobile ? 96 : 130); // detail h1 top
    head.classList.remove('is-sda');
    layer.style.transform = 'none';
    const L = Math.round(layer.getBoundingClientRect().top + scrollY);
    host.style.top = `${C - W0 / 2 - L}px`;
    const titleTop = Math.round(title.getBoundingClientRect().top + scrollY);
    R = Math.max(1, titleTop - titleF);
    sMin = Wf / W0;
    dy = R + topF + Wf / 2 - C; // ring centre: doc y C -> viewport y topF + 27 at scroll R
    head.style.setProperty('--ring-w', `${W0}px`);
    head.style.setProperty('--ring-origin', `${C - L}px`);
    head.style.setProperty('--ring-r', `${R}px`);
    head.style.setProperty('--ring-dy', `${Math.round(dy)}px`);
    head.style.setProperty('--ring-smin', String(sMin));
    head.dataset.ringR = String(R);
    head.dataset.ringReady = '';
    cur = NaN;
    if (sda) {
      layer.style.transform = '';
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
    layer.style.transform = `translateY(${(dy * cur).toFixed(2)}px) scale(${1 + (sMin - 1) * cur})`;
    head.toggleAttribute('data-ring-settled', cur === t);
    if (cur !== t) frame = requestAnimationFrame(write);
    else lastT = 0;
  };

  if (sda) head.toggleAttribute('data-ring-settled', true);
  layout();
  if (!sda) addEventListener('scroll', () => frame || (frame = requestAnimationFrame(write)), { passive: true });
  addEventListener('resize', layout, { passive: true });
}
