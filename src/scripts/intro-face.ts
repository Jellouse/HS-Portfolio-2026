
import { clearStableViewportHeight, stableViewportHeight } from '../lib/viewport-layout';
import { introFaceLayout } from '../lib/intro-layout';
import { introCopyProgress, introScaleFromScroll } from '../lib/intro-scroll';
import { setIntroCopy } from './intro-copy';
import { pushHeroFrame } from './hero-blob-gl';
import { handoffHeroMarkToSvg } from './hs-mark-transition';

export function initIntroFace(hero: HTMLElement) {
  const host = hero.querySelector<HTMLElement>('[data-hero-variant="blob"]');
  if (!host) return;
  if (hero.dataset.introBound === '1') return;
  hero.dataset.introBound = '1';

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  const ac = new AbortController();
  const opt = { passive: true as const, signal: ac.signal };

  let sMin = 1;
  let mobile = false;
  let R = 1;
  let W0 = 1;
  let H0 = 1;
  let faceBottom = 0;
  let lastW = -1;
  let lastPaint = '';
  let settledAttr = false;

  const px = (name: string) => Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)));

  const measureHostTop = () => Math.round(host.getBoundingClientRect().top + scrollY);

  const layout = () => {
    const vw = document.documentElement.clientWidth;
    if (vw !== lastW) clearStableViewportHeight();
    if (vw === lastW && hero.dataset.introReady !== undefined) return;
    lastW = vw;
    const vh = stableViewportHeight(probe, vw);
    const laid = introFaceLayout(vh, vw);
    W0 = laid.W0;
    H0 = laid.H0;
    faceBottom = laid.faceBottom;
    const { nameTop, faceCenter } = laid;
    mobile = laid.mobile;
    const Wf = px('--mark-small-w') || 64;
    const topF = px('--mark-small-top') || 32;
    if (mobile && faceCenter !== undefined) {
      hero.style.setProperty('--intro-face-center', `${faceCenter}px`);
    } else {
      hero.style.removeProperty('--intro-face-center');
    }
    const Hf = (Wf * 249) / 559;
    host.style.removeProperty('transform');
    host.style.removeProperty('translate');
    const hostTop = measureHostTop();
    R = Math.max(1, Math.round(faceBottom - Hf - topF));
    sMin = Wf / W0;
    hero.style.setProperty('--intro-origin', `${faceBottom - hostTop}px`);
    hero.style.setProperty('--intro-name-top', `${nameTop}px`);
    document.documentElement.style.setProperty('--intro-name-top', `${nameTop}px`);
    document.documentElement.style.setProperty('--intro-r', `${R}px`);
    hero.dataset.introR = String(R);
    hero.dataset.introReady = '';
    hero.style.setProperty('--intro-r', `${R}px`);
    hero.style.setProperty('--intro-smin', String(sMin));
    lastPaint = '';
    paint();
    host.dispatchEvent(new CustomEvent('intro-layout', { bubbles: true }));
    writeCopy();
  };

  const applyGeometry = (stretch: number) => {
    const blob = hero.querySelector<SVGElement>('[data-hero-blob]');
    const shapes = blob?.querySelectorAll('g[filter] > path, g[filter] > ellipse');
    if (Math.abs(stretch - 1) > 0.002) {
      shapes?.forEach((el) => el.setAttribute('transform', `scale(1 ${stretch})`));
      blob?.setAttribute('viewBox', `0 0 559 ${stretch * 249}`);
      blob?.setAttribute('preserveAspectRatio', 'xMidYMin meet');
    } else {
      shapes?.forEach((el) => el.removeAttribute('transform'));
      blob?.setAttribute('viewBox', '0 0 559 249');
      blob?.removeAttribute('preserveAspectRatio');
    }
  };

  const paint = () => {
    const hostTop = measureHostTop();
    const w = W0;
    const h = H0;
    const top = Math.round(faceBottom - hostTop) - h;
    const stretch = mobile ? (H0 * 559) / (W0 * 249) : 1;
    const key = `${w}:${h}:${top}:${stretch.toFixed(4)}`;
    host.style.removeProperty('transform');
    hero.dataset.introW = String(w);
    if (key === lastPaint) return;
    lastPaint = key;
    hero.style.setProperty('--intro-w', `${w}px`);
    hero.style.setProperty('--intro-h', `${h}px`);
    hero.style.setProperty('--intro-face-top', `${top}px`);
    applyGeometry(stretch);
    if (!reduced) pushHeroFrame({ scaleX: 1, scaleY: 1, stretch: 1 });
  };

  const forceLayout = () => {
    lastW = -1;
    hero.removeAttribute('data-intro-ready');
    layout();
  };

  const writeCopy = () => {
    const cur = introScaleFromScroll(scrollY, R, sMin, reduced);
    setIntroCopy(introCopyProgress(cur, sMin), !reduced);
    if (!settledAttr) {
      settledAttr = true;
      hero.setAttribute('data-intro-settled', '');
    }
  };

  addEventListener('scroll', writeCopy, opt);
  hero.dataset.intro = '';
  layout();
  addEventListener('pageswap', (e) => {
    const vt = (e as PageSwapEvent).viewTransition;
    if (!vt) return;
    writeCopy();
    handoffHeroMarkToSvg(hero);
  }, opt);
  addEventListener('resize', () => {
    if (document.documentElement.clientWidth !== lastW) forceLayout();
  }, opt);
  addEventListener('pagereveal', (e) => {
    const vt = (e as PageRevealEvent).viewTransition;
    const run = () => forceLayout();
    if (vt) vt.finished.then(run, run);
    else run();
  }, opt);
  addEventListener('pageshow', (e) => e.persisted && forceLayout(), opt);
  addEventListener('pagehide', () => ac.abort(), { once: true });
}
