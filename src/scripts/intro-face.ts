
import { clearStableViewportHeight, stableViewportHeight } from '../lib/viewport-layout';
import { introFaceLayout } from '../lib/intro-layout';
import { introCopyProgress, introScrollT, smoothIntro } from '../lib/intro-scroll';
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
  let sX = 1;
  let sY = 1;
  let mobile = false;
  let R = 1;
  let W0 = 1;
  let H0 = 1;
  let faceBottom = 0;
  let hostTop = 0;
  let lastW = -1;
  let frame = 0;
  let cur = NaN;
  let lastT = 0;
  let lastPaint = '';
  let lastLiveKey = '';
  let settledAttr = false;
  const TAU = 30;
  const tau = reduced ? 0 : TAU;

  const px = (name: string) => Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)));

  const measureHostTop = () => {
    const saved = host.style.translate;
    host.style.translate = 'none';
    const top = Math.round(host.getBoundingClientRect().top);
    host.style.translate = saved;
    return top;
  };

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
    host.style.transform = 'none';
    host.style.translate = 'none';
    hostTop = measureHostTop();
    R = Math.max(1, Math.round(faceBottom - Hf - topF));
    sMin = Wf / W0;
    sX = sMin;
    sY = mobile ? Hf / H0 : sMin;
    hero.style.setProperty('--intro-origin', `${faceBottom - hostTop}px`);
    hero.style.setProperty('--intro-name-top', `${nameTop}px`);
    document.documentElement.style.setProperty('--intro-name-top', `${nameTop}px`);
    document.documentElement.style.setProperty('--intro-r', `${R}px`);
    hero.dataset.introR = String(R);
    hero.dataset.introReady = '';
    hero.style.setProperty('--intro-r', `${R}px`);
    hero.style.setProperty('--intro-smin', String(sMin));
    cur = NaN;
    lastPaint = '';
    lastLiveKey = '';
    hero.style.setProperty('--intro-w', `${W0}px`);
    hero.style.setProperty('--intro-h', `${H0}px`);
    hero.style.setProperty('--intro-face-top', `${Math.round(faceBottom - hostTop) - H0}px`);
    applyGeometry(mobile ? (H0 * 559) / (W0 * 249) : 1);
    host.dispatchEvent(new CustomEvent('intro-layout', { bubbles: true }));
    follow();
    write(performance.now());
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

  const paintSize = (scaleX: number, scaleY: number) => {
    const w = Math.max(1, Math.round(W0 * scaleX));
    const h = Math.max(1, Math.round(H0 * scaleY));
    const top = Math.round(faceBottom - hostTop) - h;
    const stretch = (h * 559) / (w * 249);
    const key = `${w}:${h}:${top}:${stretch.toFixed(4)}`;
    host.style.transform = 'none';
    hero.dataset.introW = String(w);
    if (key === lastPaint) return;
    lastPaint = key;
    hero.style.setProperty('--intro-w', `${w}px`);
    hero.style.setProperty('--intro-h', `${h}px`);
    hero.style.setProperty('--intro-face-top', `${top}px`);
    applyGeometry(stretch);
  };

  const paintLive = (scaleX: number, scaleY: number) => {
    const w = Math.max(1, Math.round(W0 * scaleX));
    const h = Math.max(1, Math.round(H0 * scaleY));
    const stretch = (h * 559) / (w * 249);
    host.style.transform = 'none';
    hero.dataset.introW = String(w);
    const sx = Math.round(scaleX * 400) / 400;
    const sy = Math.round(scaleY * 400) / 400;
    const st = Math.round(stretch * 400) / 400;
    const key = `${sx}:${sy}:${st}`;
    if (key === lastLiveKey) return;
    lastLiveKey = key;
    pushHeroFrame({ scaleX: sx, scaleY: sy, stretch: st });
  };

  const forceLayout = () => {
    lastW = -1;
    hero.removeAttribute('data-intro-ready');
    layout();
  };

  const target = () => {
    const t = introScrollT(scrollY, R, reduced);
    return 1 + (sMin - 1) * t;
  };

  const write = (now: number) => {
    frame = 0;
    const goal = target();
    const dt = lastT ? Math.min(100, now - lastT) : 16;
    lastT = now;
    cur = smoothIntro(cur, goal, dt, tau, 0.0005 * sMin);
    const along = (1 - cur) / (1 - sMin) || 0;
    const scaleX = mobile ? 1 + (sX - 1) * along : cur;
    const scaleY = mobile ? 1 + (sY - 1) * along : cur;
    if (reduced) paintSize(scaleX, scaleY);
    else paintLive(scaleX, scaleY);
    host.style.translate = `0 ${-Math.round(scrollY)}px`;
    setIntroCopy(introCopyProgress(cur, sMin), !reduced);
    const isSettled = cur === goal;
    if (isSettled !== settledAttr) {
      settledAttr = isSettled;
      hero.toggleAttribute('data-intro-settled', isSettled);
    }
    if (cur !== goal) frame = requestAnimationFrame(write);
    else lastT = 0;
  };

  function follow() {
    host!.style.translate = `0 ${-Math.round(scrollY)}px`;
  }

  const onScroll = () => {
    follow();
    if (!frame) frame = requestAnimationFrame(write);
  };

  addEventListener('scroll', onScroll, opt);
  hero.dataset.intro = '';
  layout();
  addEventListener('pageswap', (e) => {
    const vt = (e as PageSwapEvent).viewTransition;
    if (!vt) return;
    follow();
    write(performance.now());
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
