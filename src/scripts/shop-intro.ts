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
  // Chrome only rasters DOM/SVG content inside the page's scrollable area (y >= 0), so the half
  // of the ring above the page top was never painted and elastic overscroll showed it clipped.
  // A canvas is uploaded whole as its own texture (like the home face's WebGL canvas), so the
  // ring is drawn into one at its biggest size; the SVG stays for the view-transition fallback.
  const mark = host.querySelector<HTMLElement>('.shop-mark')!;
  const svg = mark.querySelector('svg')!;
  const canvas = document.createElement('canvas');
  canvas.className = 'shop-ring-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  mark.appendChild(canvas);
  let drawn = 0;
  const paintCanvas = (w: number) => {
    const px = Math.round(w * Math.min(2, devicePixelRatio || 1));
    if (px === drawn) return;
    const src = svg.cloneNode(true) as SVGSVGElement;
    src.setAttribute('fill', getComputedStyle(mark).color);
    src.setAttribute('width', String(px));
    src.setAttribute('height', String(px));
    const img = new Image();
    img.onload = () => {
      canvas.width = px;
      canvas.height = px;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.clearRect(0, 0, px, px);
      ctx.drawImage(img, 0, 0, px, px);
      drawn = px;
      mark.classList.add('has-canvas');
      atTop();
    };
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(src));
  };

  // the canvas only shows while the page is at (or pulled past) its top; once scrolling, the
  // crisp SVG takes over for the shrink to 54px
  const atTop = () => mark.classList.toggle('at-top', drawn > 0 && scrollY <= 1);
  addEventListener('scroll', atTop, { passive: true });

  const layout = () => {
    const vw = document.documentElement.clientWidth;
    if (vw === lastW) return;
    lastW = vw;
    const vh = Math.round(probe.getBoundingClientRect().height);
    const mobile = vw < 760;
    const nameTop = Math.round(vh * (mobile ? 0.715 : 0.772));
    document.documentElement.style.setProperty('--intro-name-top', `${nameTop}px`);
    const W0 = Math.round((vw * (mobile ? 0.9 : 0.68)) / 2) * 2; // even, so the centre is a whole px
    // phones: centred between the viewport top and the name (equal space, same centre as the
    // home face); desktop: round 5/6 placement, centre exactly on the page top (half above it)
    const C = mobile ? Math.round(nameTop / 2) : 0;
    const Wf = 54;
    const topF = mobile ? 32 : 44; // .shop-detail padding-top
    const titleF = topF + Wf + (mobile ? 96 : 130); // detail h1 top
    head.classList.remove('is-sda');
    layer.style.transform = 'none';
    layer.style.translate = 'none';
    const L = Math.round(layer.getBoundingClientRect().top); // fixed layer: viewport top = doc top at scroll 0
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
    paintCanvas(W0);
    follow();
    cur = NaN;
    if (sda) {
      layer.style.transform = '';
      head.classList.add('is-sda');
    } else write(performance.now());
  };

  // The layer is position:fixed (overscroll never crops fixed content); it follows the page by
  // translating -scrollY, clamped at 0 so a rubber-band pull keeps it whole. Touch: CSS scroll()
  // animation on `translate`.
  const follow = () => {
    // Safari reports negative scrollY in a top rubber-band and drags fixed layers down with
    // the bounce; follow it the other way so the layer stays put and no cut edge shows.
    const y = scrollY;
    if (!sda) layer.style.translate = `0 ${-y}px`;
    else layer.style.translate = '';
  };
  addEventListener('scroll', follow, { passive: true });

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
