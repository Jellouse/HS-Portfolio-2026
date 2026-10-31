
import { clearStableViewportHeight, stableViewportHeight } from '../lib/viewport-layout';
import { introFaceLayout } from '../lib/intro-layout';
import { setIntroCopy } from './intro-copy';

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
  let lastW = -1;
  let frame = 0;
  let lastS = NaN;
  let cur = NaN;
  let lastT = 0;
  let settledAttr = false;
  const KEY = 'intro-smooth-ms';
  const DEFAULT_TAU = 30;
  const stored = Number(localStorage.getItem(KEY));
  const showIntroTune =
    !reduced &&
    (import.meta.env.DEV || new URLSearchParams(location.search).has('debug'));
  let tau =
    showIntroTune && localStorage.getItem(KEY) !== null && stored >= 0 ? stored : DEFAULT_TAU;
  if (reduced) tau = 0;

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
    const { W0, H0, nameTop, faceBottom, faceCenter } = laid;
    mobile = laid.mobile;
    const Wf = px('--mark-small-w') || 64;
    const topF = px('--mark-small-top') || 32;
    if (mobile && faceCenter !== undefined) {
      hero.style.setProperty('--intro-face-center', `${faceCenter}px`);
    } else {
      hero.style.removeProperty('--intro-face-center');
    }
    const Hf = (Wf * 249) / 559;
    const blob = hero.querySelector<SVGElement>('[data-hero-blob]');
    if (mobile && laid.stretch !== 1) {
      hero.style.setProperty('--intro-h', `${Math.round(H0)}px`);
      blob?.setAttribute('preserveAspectRatio', 'none');
    } else {
      hero.style.removeProperty('--intro-h');
      blob?.removeAttribute('preserveAspectRatio');
    }
    host.style.transform = 'none';
    hero.classList.remove('is-sda');
    host.style.translate = 'none';
    const hostTop = measureHostTop();
    R = Math.max(1, Math.round(faceBottom - Hf - topF));
    sMin = Wf / W0;
    sX = sMin;
    sY = mobile ? Hf / H0 : sMin;
    hero.style.setProperty('--intro-w', `${W0}px`);
    hero.style.setProperty('--intro-sx', String(sX));
    hero.style.setProperty('--intro-sy', String(sY));
    hero.style.setProperty('--intro-face-top', `${Math.round(faceBottom - H0) - hostTop}px`);
    hero.style.setProperty('--intro-origin', `${faceBottom - hostTop}px`);
    hero.style.setProperty('--intro-name-top', `${nameTop}px`);
    document.documentElement.style.setProperty('--intro-name-top', `${nameTop}px`);
    document.documentElement.style.setProperty('--intro-r', `${R}px`);
    hero.dataset.introR = String(R);
    hero.dataset.introReady = '';
    hero.style.setProperty('--intro-r', `${R}px`);
    hero.style.setProperty('--intro-smin', String(sMin));
    lastS = NaN;
    cur = NaN;
    host.dispatchEvent(new CustomEvent('intro-layout', { bubbles: true }));
    follow();
    if (sda) {
      host.style.transform = '';
      hero.classList.add('is-sda');
      setIntroCopy(0, false);
    } else write(performance.now());
  };

  const forceLayout = () => {
    lastW = -1;
    hero.removeAttribute('data-intro-ready');
    layout();
  };

  const target = () => {
    const t = reduced ? 1 : Math.min(1, Math.max(0, scrollY / R));
    return 1 + (sMin - 1) * t;
  };

  const write = (now: number) => {
    frame = 0;
    const goal = target();
    const dt = lastT ? Math.min(100, now - lastT) : 16;
    lastT = now;
    if (!tau || Number.isNaN(cur)) cur = goal;
    else cur += (goal - cur) * (1 - Math.exp(-dt / tau));
    if (Math.abs(goal - cur) < 0.0005 * sMin) cur = goal;
    const scaleX = mobile ? 1 + (sX - 1) * ((1 - cur) / (1 - sMin) || 0) : cur;
    const scaleY = mobile ? 1 + (sY - 1) * ((1 - cur) / (1 - sMin) || 0) : cur;
    if (cur !== lastS) {
      lastS = cur;
      host.style.transform = mobile ? `scale(${scaleX}, ${scaleY})` : `scale(${cur})`;
    }
    const progress = sMin === 1 ? 0 : (1 - cur) / (1 - sMin);
    setIntroCopy(progress, !reduced && !sda);
    const isSettled = cur === goal;
    if (isSettled !== settledAttr) {
      settledAttr = isSettled;
      hero.toggleAttribute('data-intro-settled', isSettled);
    }
    if (cur !== goal) frame = requestAnimationFrame(write);
    else lastT = 0;
  };

  function follow() {
    const y = scrollY;
    host!.style.translate = sda ? '' : `0 ${-y}px`;
  }

  const onScroll = () => {
    follow();
    if (!sda && !frame) frame = requestAnimationFrame(write);
  };

  function mountTune() {
    const box = document.createElement('div');
    box.className = 'intro-tune';
    box.innerHTML = `<label>Smoothing <output></output></label><input type="range" min="0" max="400" step="10" aria-label="Intro smoothing in ms"><button type="button">Copy value</button>`;
    const input = box.querySelector('input')!;
    const out = box.querySelector('output')!;
    const btn = box.querySelector('button')!;
    const show = () => (out.textContent = tau ? `${tau} ms` : 'off');
    input.value = String(tau);
    show();
    input.addEventListener('input', () => {
      tau = Number(input.value);
      localStorage.setItem(KEY, String(tau));
      show();
    });
    btn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(`intro smoothing tau: ${tau}ms`);
        btn.textContent = 'Copied';
      } catch {
        btn.textContent = `${tau} ms`;
      }
      setTimeout(() => (btn.textContent = 'Copy value'), 1200);
    });
    document.body.appendChild(box);
  }

  const sda =
    !reduced &&
    matchMedia('(pointer: coarse)').matches &&
    CSS.supports('animation-timeline: scroll()') &&
    new URLSearchParams(location.search).get('intro') !== 'raf';

  addEventListener('scroll', onScroll, opt);
  hero.dataset.intro = '';
  if (sda) {
    hero.classList.add('is-sda');
    hero.toggleAttribute('data-intro-settled', true);
  }
  layout();
  if (showIntroTune && !sda) mountTune();
  addEventListener('resize', () => {
    if (document.documentElement.clientWidth !== lastW) forceLayout();
  }, opt);
  addEventListener('pagereveal', forceLayout, opt);
  addEventListener('pageshow', (e) => e.persisted && forceLayout(), opt);
  addEventListener('pagehide', () => ac.abort(), { once: true });
}
