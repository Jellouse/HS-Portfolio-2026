/**
 * Homepage intro: the face is laid out at its biggest size and only ever scaled down, as one
 * composited layer (transform only, one rAF write per frame, no layout or re-raster per frame).
 * Its bottom sits at a fixed document y (name top - gap) and it scales from its bottom centre,
 * so the gap to the name stays constant: the name pushes it, 1:1 with scroll. At scroll R it
 * reaches the project-page mark size/top (--mark-small-w / --mark-small-top) and then simply
 * scrolls with the page, so there is no sticky release to jump. Layout values are whole px.
 */
export function initIntroFace(hero: HTMLElement) {
  const host = hero.querySelector<HTMLElement>('[data-hero-variant="blob"]');
  if (!host) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
  document.body.appendChild(probe);

  let sMin = 1;
  let R = 1;
  let lastW = -1;
  let frame = 0;
  let lastS = NaN;
  let cur = NaN; // rendered scale; chases the scroll target
  let lastT = 0;
  const KEY = 'intro-smooth-ms';
  const DEFAULT_TAU = 100;
  const stored = Number(localStorage.getItem(KEY));
  let tau = hero.hasAttribute('data-intro-tune') && localStorage.getItem(KEY) !== null && stored >= 0 ? stored : DEFAULT_TAU;
  if (reduced) tau = 0;

  const px = (name: string) => Math.round(parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name)));

  const layout = () => {
    const vw = document.documentElement.clientWidth;
    if (vw === lastW) return; // iOS address bar changes height only: no redraw
    lastW = vw;
    const vh = Math.round(probe.getBoundingClientRect().height);
    const mobile = vw < 760;
    const Wf = px('--mark-small-w') || 64;
    const topF = px('--mark-small-top') || 32;
    const W0 = Math.round(vw * 1.15); // largest size: laid out (and rastered) once at this
    const H0 = (W0 * 249) / 559;
    const Hf = (Wf * 249) / 559;
    const gap = mobile ? 96 : 160;
    const nameTop = Math.round(vh * 0.715);
    const faceBottom = nameTop - gap;
    host.style.transform = 'none';
    const hostTop = Math.round(host.getBoundingClientRect().top + scrollY);
    R = Math.max(1, Math.round(faceBottom - Hf - topF));
    sMin = Wf / W0;
    hero.style.setProperty('--intro-w', `${W0}px`);
    hero.style.setProperty('--intro-face-top', `${Math.round(faceBottom - H0) - hostTop}px`);
    hero.style.setProperty('--intro-origin', `${faceBottom - hostTop}px`);
    hero.style.setProperty('--intro-name-top', `${nameTop}px`);
    hero.dataset.introR = String(R);
    lastS = NaN;
    cur = NaN;
    write(performance.now());
  };

  const target = () => {
    // clamp: rubber-band overscroll (negative scrollY) holds the start state
    const t = reduced ? 1 : Math.min(1, Math.max(0, scrollY / R));
    return 1 + (sMin - 1) * t;
  };
  // One rAF loop: frame-rate independent exponential smoothing (1 - e^(-dt/tau)); stops when settled.
  const write = (now: number) => {
    frame = 0;
    const goal = target();
    const dt = lastT ? Math.min(100, now - lastT) : 16;
    lastT = now;
    if (!tau || Number.isNaN(cur)) cur = goal;
    else cur += (goal - cur) * (1 - Math.exp(-dt / tau));
    if (Math.abs(goal - cur) < 0.0005 * sMin) cur = goal;
    if (cur !== lastS) {
      lastS = cur;
      host.style.transform = `scale(${cur})`;
    }
    hero.toggleAttribute('data-intro-settled', cur === goal);
    if (cur !== goal) frame = requestAnimationFrame(write);
    else lastT = 0;
  };
  const onScroll = () => {
    if (!frame) frame = requestAnimationFrame(write);
  };

  if (hero.hasAttribute('data-intro-tune')) mountTune();

  function mountTune() {
    const box = document.createElement('div');
    box.className = 'intro-tune';
    box.innerHTML = `<label>Smoothing <output></output></label><input type="range" min="0" max="400" step="10"><button type="button">Copy value</button>`;
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

  hero.dataset.intro = '';
  layout();
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', layout, { passive: true });
}
