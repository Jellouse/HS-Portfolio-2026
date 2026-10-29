/**
 * Scroll-linked drum for image and video frames (s.engineering gravity scroll-motion).
 * Prefer ViewTimeline + WAAPI; fall back to rAF on scroll. Reversible both directions.
 */

const MEDIA_FRAME =
  '.feed .card .frame, .project .image-block .frame, .project .pair .frame, .project .process-grid .frame, .shop-pair .frame, .shop-detail-image .frame, .shop-wild-grid .frame';

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const visibleFraction = (top: number, height: number, vh: number, scroll: number) => {
  const viewTop = scroll;
  const viewBottom = scroll + vh;
  const visibleTop = Math.max(viewTop, top);
  const visibleBottom = Math.min(viewBottom, top + height);
  return Math.max(0, visibleBottom - visibleTop) / Math.max(1, height);
};

type Item = { el: HTMLElement; anim?: Animation };

export type GravityScroll = { refresh: () => void; destroy: () => void };

function measureTop(el: HTMLElement) {
  el.style.transform = 'none';
  const r = el.getBoundingClientRect();
  return { top: r.top + scrollY, h: r.height };
}

export function drumPose(top: number, height: number, vh: number, scroll: number) {
  const centre = scroll + vh / 2;
  const mid = top + height / 2;
  const reach = vh / 2 + height / 2;
  const u = (mid - centre) / Math.max(1, reach);
  const clamped = Math.max(-1, Math.min(1, u));
  const radius = Math.max(760, Math.round(vh * 0.95), Math.round(height * 0.6));
  const theta = clamped * (Math.PI / 2);
  const rotateX = -(theta * 180) / Math.PI;
  const z = -Math.round(radius * (1 - Math.cos(Math.abs(theta))));
  const angleAbs = Math.abs(clamped) * reach;
  const vf = visibleFraction(top, height, vh, scroll);
  const opacity =
    smoothstep(0.12, 0.65, vf) * (1 - smoothstep(reach - 0.18 * reach, reach, angleAbs));
  const deg = rotateX;
  const wrapped = `perspective(1800px) translate3d(0, 0, ${z}px) rotateX(${deg.toFixed(2)}deg)`;
  return { transform: wrapped, opacity: Math.max(0, Math.min(1, opacity)), rotateX: deg };
}

function supportsViewTimeline() {
  return typeof ViewTimeline !== 'undefined' && typeof Element.prototype.animate === 'function';
}

export function createGravityScroll(): GravityScroll {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  let items: Item[] = [];
  let vh = document.documentElement.clientHeight;
  let dirty = true;
  let native = !reduced.matches && supportsViewTimeline() && !navigator.webdriver;

  const measure = () => {
    vh = document.documentElement.clientHeight;
    items.forEach(({ anim }) => anim?.cancel());
    items = Array.from(document.querySelectorAll<HTMLElement>(MEDIA_FRAME)).map((el) => ({ el }));
    dirty = false;
  };

  const clear = () => {
    items.forEach(({ el, anim }) => {
      anim?.cancel();
      el.style.removeProperty('transform');
      el.style.removeProperty('opacity');
      el.classList.remove('is-drum');
    });
  };

  const render = () => {
    if (dirty) measure();
    if (reduced.matches) return clear();
    if (native) {
      bindNative();
      return;
    }
    const scroll = scrollY;
    for (const it of items) {
      const { top, h } = measureTop(it.el);
      const { transform, opacity } = drumPose(top, h, vh, scroll);
      it.el.classList.add('is-drum');
      it.el.style.transform = transform;
      it.el.style.opacity = Math.max(0, opacity).toFixed(3);
    }
  };

  const bindNative = () => {
    items.forEach((it) => {
      it.anim?.cancel();
      const { top, h } = measureTop(it.el);
      const start = Math.round(top - vh);
      const end = Math.round(top + h + vh);
      const keyframes: Keyframe[] = [];
      for (let y = start; y <= end; y += 24) {
        const pose = drumPose(top, h, vh, y);
        keyframes.push({
          transform: pose.transform,
          opacity: pose.opacity,
          offset: (y - start) / Math.max(1, end - start),
        });
      }
      if (keyframes.length < 2) return;
      it.el.classList.add('is-drum');
      it.anim = it.el.animate(keyframes, {
        timeline: new ViewTimeline({ subject: it.el, axis: 'block' }),
        rangeStart: 'entry -100vh',
        rangeEnd: 'exit 100vh',
        fill: 'both',
      } as KeyframeAnimationOptions);
    });
  };

  const refresh = () => {
    dirty = true;
    native = !reduced.matches && supportsViewTimeline() && !navigator.webdriver;
    items.forEach(({ anim }) => anim?.cancel());
    render();
  };

  const onScroll = () => {
    if (native) return;
    render();
  };

  const onReduced = () => refresh();
  reduced.addEventListener?.('change', onReduced);
  addEventListener('scroll', onScroll, { passive: true });
  addEventListener('resize', refresh);
  addEventListener('load', refresh);
  addEventListener('pageshow', refresh);
  document.fonts?.ready.then(refresh);
  if ('ResizeObserver' in window) new ResizeObserver(refresh).observe(document.body);
  render();

  return {
    refresh,
    destroy: () => {
      reduced.removeEventListener?.('change', onReduced);
      removeEventListener('scroll', onScroll);
      clear();
    },
  };
}

/** @deprecated use createGravityScroll */
export function initProjectDrum() {
  createGravityScroll();
}
