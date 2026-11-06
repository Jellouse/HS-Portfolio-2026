import { clearStableViewportHeight, stableViewportHeight } from '../lib/viewport-layout';
import { introFaceLayout, shopRingWidth } from '../lib/intro-layout';
import { introScrollT, smoothIntro } from '../lib/intro-scroll';
import { setIntroCopy } from './intro-copy';

export function initShopIntro(head: HTMLElement) {
  const host = head.querySelector<HTMLElement>('[data-shop-ring]');
  const title = head.querySelector<HTMLElement>('.shop-head-title');
  if (!host || !title) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
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

  const mark = host.querySelector<HTMLElement>('.shop-mark')!;
  const svg = mark.querySelector('svg')!;
  const canvas = document.createElement('canvas');
  canvas.className = 'shop-ring-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  mark.appendChild(canvas);
  let drawn = 0;
  let ringW = 0;
  let ringPaintBound = false;
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

  const atTop = () => mark.classList.toggle('at-top', drawn > 0 && scrollY <= 1);

  const forceLayout = () => {
    lastW = -1;
    head.removeAttribute('data-ring-ready');
    layout();
  };

  const layout = () => {
    const vw = document.documentElement.clientWidth;
    if (vw !== lastW) clearStableViewportHeight();
    if (vw === lastW && head.dataset.ringReady !== undefined) return;
    lastW = vw;
    const layoutVh = stableViewportHeight(probe, vw);
    const mobile = vw < 760;
    const viewVh = Math.round(window.innerHeight || layoutVh);
    const { nameTop } = introFaceLayout(layoutVh, vw);
    document.documentElement.style.setProperty('--intro-name-top', `${nameTop}px`);
    const W0 = shopRingWidth(viewVh, vw);
    const C = 0;
    const Wf = 54;
    const topF = mobile ? 32 : 44;
    const titleF = topF + Wf + (mobile ? 96 : 130);
    layer.style.transform = 'none';
    layer.style.translate = 'none';
    const L = Math.round(layer.getBoundingClientRect().top);
    host.style.top = `${C - W0 / 2 - L}px`;
    const titleTop = Math.round(title.getBoundingClientRect().top + scrollY);
    R = Math.max(1, titleTop - titleF);
    sMin = Wf / W0;
    dy = R + topF + Wf / 2 - C;
    host.style.width = `${W0}px`;
    host.style.height = `${W0}px`;
    head.style.setProperty('--ring-w', `${W0}px`);
    document.documentElement.style.setProperty('--shop-ring-w', `${W0}px`);
    head.style.setProperty('--ring-origin', `${C - L}px`);
    head.style.setProperty('--ring-r', `${R}px`);
    document.documentElement.style.setProperty('--intro-r', `${R}px`);
    head.style.setProperty('--ring-dy', `${Math.round(dy)}px`);
    head.style.setProperty('--ring-smin', String(sMin));
    head.dataset.ringR = String(R);
    head.dataset.ringReady = '';
    head.dataset.ringW = String(W0);
    ringW = W0;
    paintCanvas(W0);
    follow();
    if (!ringPaintBound) {
      ringPaintBound = true;
      document.addEventListener('sky-ink', () => {
        drawn = 0;
        paintCanvas(ringW);
      });
    }
    cur = NaN;
    document.dispatchEvent(new CustomEvent('intro-layout'));
    write(performance.now());
  };

  const follow = () => {
    layer.style.translate = `0 ${-Math.round(scrollY)}px`;
  };

  const onScroll = () => {
    atTop();
    follow();
    if (!frame) frame = requestAnimationFrame(write);
  };
  addEventListener('scroll', onScroll, { passive: true });

  const write = (now: number) => {
    frame = 0;
    const t = introScrollT(scrollY, R, reduced);
    const dt = lastT ? Math.min(100, now - lastT) : 16;
    lastT = now;
    cur = smoothIntro(cur, t, dt, reduced ? 0 : TAU);
    layer.style.transform = `translateY(${(dy * cur).toFixed(2)}px) scale(${1 + (sMin - 1) * cur})`;
    setIntroCopy(cur, !reduced);
    head.toggleAttribute('data-ring-settled', cur === t);
    if (cur !== t) frame = requestAnimationFrame(write);
    else lastT = 0;
  };

  layout();
  addEventListener('resize', () => {
    if (document.documentElement.clientWidth !== lastW) forceLayout();
  }, { passive: true });
  addEventListener('pagereveal', forceLayout, { passive: true });
  addEventListener('pageshow', (e) => e.persisted && forceLayout(), { passive: true });
}
