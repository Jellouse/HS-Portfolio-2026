import { clearStableViewportHeight, stableViewportHeight } from '../lib/viewport-layout';
import { introFaceLayout } from '../lib/intro-layout';

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
    const vh = stableViewportHeight(probe, vw);
    const mobile = vw < 760;
    const { nameTop, faceCenter } = introFaceLayout(vh, vw);
    document.documentElement.style.setProperty('--intro-name-top', `${nameTop}px`);
    const W0 = Math.round((vw * (mobile ? 0.9 : 0.68)) / 2) * 2;
    const C = mobile ? (faceCenter ?? Math.round(nameTop / 2)) : 0;
    const Wf = 54;
    const topF = mobile ? 32 : 44;
    const titleF = topF + Wf + (mobile ? 96 : 130);
    head.classList.remove('is-sda');
    layer.style.transform = 'none';
    layer.style.translate = 'none';
    const L = Math.round(layer.getBoundingClientRect().top);
    host.style.top = `${C - W0 / 2 - L}px`;
    const titleTop = Math.round(title.getBoundingClientRect().top + scrollY);
    R = Math.max(1, titleTop - titleF);
    sMin = Wf / W0;
    dy = R + topF + Wf / 2 - C;
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

  const follow = () => {

    const y = scrollY;
    if (!sda) layer.style.translate = `0 ${-y}px`;
    else layer.style.translate = '';
  };
  const onScroll = () => {
    atTop();
    follow();
    if (!sda && !frame) frame = requestAnimationFrame(write);
  };
  addEventListener('scroll', onScroll, { passive: true });

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
  addEventListener('resize', () => {
    if (document.documentElement.clientWidth !== lastW) forceLayout();
  }, { passive: true });
  addEventListener('pagereveal', forceLayout, { passive: true });
  addEventListener('pageshow', (e) => e.persisted && forceLayout(), { passive: true });
}
