/**
 * Site-wide scroll motion: letter intro, viewport media entrance, lazy video, header fade.
 */

import { SCROLL_MEDIA_FRAME } from './scroll-media-selectors';
import { introLetterSequence, playLetterIntro } from './wordmark-intro';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 720px)');

const viewportVideos = new Set<HTMLVideoElement>();

const ENTRANCE_EASE = 'cubic-bezier(.22, 1, .36, 1)';
const ENTRANCE_MS = 700;

function doubleRaf() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function ensureFrameMedia(frame: HTMLElement) {
  const video = frame.querySelector<HTMLVideoElement>('video');
  if (!video?.dataset.src) return;
  const source = video.querySelector('source');
  const src = video.dataset.src;
  if (source && !source.getAttribute('src')) source.setAttribute('src', src);
  if (!video.getAttribute('src') && !source) video.setAttribute('src', src);
  video.preload = 'auto';
  video.load();
}

function markMediaReady(frame: HTMLElement) {
  if (frame.classList.contains('is-media-ready')) return;
  frame.classList.add('is-media-ready');
}

function wireMediaReady() {
  document.querySelectorAll<HTMLImageElement>(`${SCROLL_MEDIA_FRAME} img`).forEach((img) => {
    const frame = img.closest<HTMLElement>('.frame');
    if (!frame || frame !== img.closest(SCROLL_MEDIA_FRAME)) return;
    const done = () => markMediaReady(frame);
    if (img.complete && img.naturalWidth > 0) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.decode?.().then(done).catch(() => {});
    }
  });
  document.querySelectorAll<HTMLVideoElement>(`${SCROLL_MEDIA_FRAME} video`).forEach((video) => {
    const frame = video.closest<HTMLElement>('.frame');
    if (!frame) return;
    if (video.poster) markMediaReady(frame);
    if (video.readyState >= 2) markMediaReady(frame);
    else video.addEventListener('loadeddata', () => markMediaReady(frame), { once: true });
  });
}

function revealFrame(frame: HTMLElement) {
  if (frame.classList.contains('is-viewport-revealed')) return;
  frame.classList.add('is-viewport-revealed');
  ensureFrameMedia(frame);
  if (reduced.matches) return;
  frame.animate(
    [{ opacity: 0, transform: 'scale(0.94) translate(0, 24px)' }, { opacity: 1, transform: 'none' }],
    { duration: ENTRANCE_MS, easing: ENTRANCE_EASE, fill: 'both' },
  );
}

function whenMediaReady(frame: HTMLElement, run: () => void) {
  if (frame.classList.contains('is-media-ready')) {
    run();
    return;
  }
  const obs = new MutationObserver(() => {
    if (!frame.classList.contains('is-media-ready')) return;
    obs.disconnect();
    run();
  });
  obs.observe(frame, { attributes: true, attributeFilter: ['class'] });
  wireMediaReady();
}

function initMediaViewportEntrance() {
  const frames = document.querySelectorAll<HTMLElement>(SCROLL_MEDIA_FRAME);
  if (reduced.matches) {
    frames.forEach((frame) => revealFrame(frame));
    return;
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        if (!isIntersecting) return;
        const frame = target as HTMLElement;
        whenMediaReady(frame, () => {
          revealFrame(frame);
          io.unobserve(frame);
        });
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px 8% 0px' },
  );

  frames.forEach((frame) => {
    if (frame.classList.contains('is-viewport-revealed')) return;
    io.observe(frame);
    const r = frame.getBoundingClientRect();
    const vh = innerHeight;
    if (r.top < vh * 0.92 && r.bottom > 0) whenMediaReady(frame, () => revealFrame(frame));
  });
}

function lazyVideos() {
  const prep = (video: HTMLVideoElement) => {
    if (video.dataset.lazyBound) return;
    video.dataset.lazyBound = '1';
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    video.removeAttribute('autoplay');
    if (!video.dataset.src) {
      const source = video.querySelector('source');
      const src = source?.getAttribute('src') || video.getAttribute('src');
      if (src) {
        video.dataset.src = src;
        source?.removeAttribute('src');
        video.removeAttribute('src');
        video.preload = 'none';
        video.load();
      }
    }
  };
  document.querySelectorAll<HTMLVideoElement>(`${SCROLL_MEDIA_FRAME} video, video[data-autoplay]`).forEach(prep);

  const syncPlayback = () => {
    const centre = document.documentElement.clientHeight / 2;
    const videos = [...viewportVideos].filter((v) => v.isConnected);
    videos.sort(
      (a, b) =>
        Math.abs(a.getBoundingClientRect().top + a.offsetHeight / 2 - centre) -
        Math.abs(b.getBoundingClientRect().top + b.offsetHeight / 2 - centre),
    );
    const limit = mobile.matches ? 1 : 2;
    videos.forEach((video, index) => {
      if (!document.hidden && index < limit) {
        if (!video.dataset.src) return;
        const source = video.querySelector('source');
        const src = video.dataset.src;
        if (source && !source.getAttribute('src')) source.setAttribute('src', src);
        if (!video.getAttribute('src') && !source) video.setAttribute('src', src);
        video.preload = 'auto';
        video.load();
        video.play().catch(() => {});
      } else video.pause();
    });
  };

  const videoObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach(({ target, isIntersecting }) => {
        const video = target as HTMLVideoElement;
        if (isIntersecting) viewportVideos.add(video);
        else {
          viewportVideos.delete(video);
          video.pause();
        }
      });
      syncPlayback();
    },
    { rootMargin: '500px 0px', threshold: 0.01 },
  );

  document.querySelectorAll<HTMLVideoElement>(`${SCROLL_MEDIA_FRAME} video, video[data-autoplay]`).forEach((video) => {
    prep(video);
    videoObserver.observe(video);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) viewportVideos.forEach((v) => v.pause());
    else syncPlayback();
  });
  mobile.addEventListener?.('change', syncPlayback);
}

function initHeaderScrollFade() {
  if (document.querySelector('[data-intro]')) return;
  const header = document.querySelector<HTMLElement>('.site-header');
  if (!header || reduced.matches) return;
  let frame = 0;
  const paint = () => {
    frame = 0;
    const t = smoothstep(0, 120, scrollY);
    const opacity = 1 - t;
    const scale = 1 - 0.06 * t;
    const y = -24 * t;
    header.style.opacity = opacity.toFixed(3);
    header.style.transform = `translate3d(0, ${Math.round(y)}px, 0) scale(${scale.toFixed(3)})`;
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(paint);
  };
  addEventListener('scroll', schedule, { passive: true });
  paint();
}

const smoothstep = (a: number, b: number, v: number) => {
  const t = Math.min(1, Math.max(0, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function initSiteScrollMotion() {
  document.documentElement.classList.add('has-scroll-motion');

  if (reduced.matches) {
    document.documentElement.classList.add('is-scroll-intro-ready', 'is-letter-intro-done');
    introLetterSequence().forEach(({ shell }) => shell.classList.add('is-motion-ready'));
    wireMediaReady();
    lazyVideos();
    initMediaViewportEntrance();
    return;
  }

  document.documentElement.classList.add('is-scroll-intro-pending');
  wireMediaReady();
  lazyVideos();

  const run = async () => {
    try {
      await document.fonts.ready.catch(() => {});
      await doubleRaf();
      await playLetterIntro();
      document.documentElement.classList.remove('is-scroll-intro-pending');
      wireMediaReady();
      initMediaViewportEntrance();
      document.documentElement.classList.add('is-scroll-intro-ready');
      initHeaderScrollFade();
    } finally {
      document.documentElement.classList.remove('is-scroll-intro-pending');
    }
  };
  run();
}
