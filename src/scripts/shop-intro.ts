import { clearStableViewportHeight, stableViewportHeight } from '../lib/viewport-layout';
import { introFaceLayout, shopRingWidth } from '../lib/intro-layout';
import { introScrollT } from '../lib/intro-scroll';
import { setIntroCopy } from './intro-copy';

export function initShopIntro(head: HTMLElement) {
  const host = head.querySelector<HTMLElement>('[data-shop-ring]');
  const title = head.querySelector<HTMLElement>('.shop-head-title');
  if (!host || !title) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let R = 1;
  let lastW = -1;

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
    const viewVh = Math.round(window.innerHeight || layoutVh);
    const { nameTop } = introFaceLayout(layoutVh, vw);
    document.documentElement.style.setProperty('--intro-name-top', `${nameTop}px`);
    const W0 = shopRingWidth(viewVh, vw);
    const mobile = vw < 760;
    const Wf = 54;
    const topF = mobile ? 32 : 44;
    const titleF = topF + Wf + (mobile ? 96 : 130);
    layer.style.removeProperty('transform');
    layer.style.removeProperty('translate');
    host.style.removeProperty('top');
    const titleTop = Math.round(title.getBoundingClientRect().top + scrollY);
    R = Math.max(1, titleTop - titleF);
    const sMin = Wf / W0;
    host.style.width = `${W0}px`;
    host.style.height = `${W0}px`;
    head.style.setProperty('--ring-w', `${W0}px`);
    document.documentElement.style.setProperty('--shop-ring-w', `${W0}px`);
    head.style.setProperty('--ring-r', `${R}px`);
    document.documentElement.style.setProperty('--intro-r', `${R}px`);
    head.style.setProperty('--ring-smin', String(sMin));
    head.dataset.ringR = String(R);
    head.dataset.ringReady = '';
    head.dataset.ringW = String(W0);
    ringW = W0;
    paintCanvas(W0);
    if (!ringPaintBound) {
      ringPaintBound = true;
      document.addEventListener('sky-ink', () => {
        drawn = 0;
        paintCanvas(ringW);
      });
    }
    document.dispatchEvent(new CustomEvent('intro-layout'));
    write();
  };

  const write = () => {
    atTop();
    const t = introScrollT(scrollY, R, reduced);
    setIntroCopy(t, !reduced);
    head.toggleAttribute('data-ring-settled', true);
  };

  addEventListener('scroll', write, { passive: true });

  layout();
  addEventListener('resize', () => {
    if (document.documentElement.clientWidth !== lastW) forceLayout();
  }, { passive: true });
  addEventListener('pagereveal', forceLayout, { passive: true });
  addEventListener('pageshow', (e) => e.persisted && forceLayout(), { passive: true });
}
