/**
 * Site-wide scroll motion: letter intro, load-entrance, drum scroll, lazy video, header fade.
 */

import { createGravityScroll } from './gravity-scroll-motion';
import { letterIntroTargets, playLetterIntro } from './wordmark-intro';

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const mobile = matchMedia('(max-width: 720px)');

const MEDIA_FRAME =
  '.feed .card .frame, .project .image-block .frame, .project .pair .frame, .project .process-grid .frame, .shop-pair .frame, .shop-detail-image .frame, .shop-wild-grid .frame';

function mediaHosts() {
  const seen = new Set<HTMLElement>();
  const hosts: HTMLElement[] = [];
  document.querySelectorAll<HTMLElement>(MEDIA_FRAME).forEach((frame) => {
    const host = hostForFrame(frame);
    if (!host || seen.has(host)) return;
    seen.add(host);
    hosts.push(host);
  });
  return hosts;
}

const MENU =
  '.site-header .site-menu:not(.site-socials) :is(a, button), .shop-head .shop-menu :is(a, button)';

const viewportVideos = new Set<HTMLVideoElement>();

function doubleRaf() {
  return new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function hostForFrame(frame: HTMLElement) {
  return (
    frame.closest<HTMLElement>('.image-block') ||
    frame.closest<HTMLElement>('.pair') ||
    frame.closest<HTMLElement>('.card') ||
    frame.closest<HTMLElement>('.shop-pair') ||
    frame.closest<HTMLElement>('.shop-detail-image') ||
    frame.closest<HTMLElement>('.shop-wild-grid') ||
    frame.closest<HTMLElement>('.process') ||
    null
  );
}

function markMediaReady(frame: HTMLElement) {
  frame.classList.add('is-media-ready');
  const host = hostForFrame(frame);
  if (!host) return;
  const frames = host.querySelectorAll<HTMLElement>('.frame');
  if ([...frames].every((f) => f.classList.contains('is-media-ready'))) host.classList.add('is-media-ready');
}

function wireMediaReady() {
  document.querySelectorAll<HTMLImageElement>(`${MEDIA_FRAME} img`).forEach((img) => {
    const frame = img.closest<HTMLElement>('.frame');
    if (!frame) return;
    const done = () => markMediaReady(frame);
    if (img.complete && img.naturalWidth > 0) done();
    else {
      img.addEventListener('load', done, { once: true });
      img.decode?.().then(done).catch(() => {});
    }
  });
  document.querySelectorAll<HTMLVideoElement>(`${MEDIA_FRAME} video`).forEach((video) => {
    const frame = video.closest<HTMLElement>('.frame');
    if (!frame) return;
    if (video.readyState >= 2) markMediaReady(frame);
    else video.addEventListener('loadeddata', () => markMediaReady(frame), { once: true });
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
  document.querySelectorAll<HTMLVideoElement>('video[data-autoplay], .frame.is-video video').forEach(prep);

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

  document.querySelectorAll<HTMLVideoElement>('video[data-autoplay], .frame.is-video video').forEach((video) => {
    prep(video);
    videoObserver.observe(video);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) viewportVideos.forEach((v) => v.pause());
    else syncPlayback();
  });
  mobile.addEventListener?.('change', syncPlayback);
}

function startLoadEntrance() {
  document.querySelectorAll<HTMLElement>(MENU).forEach((el, index) => {
    el.style.setProperty('--load-intro-order', String(index));
    el.classList.add('has-load-entrance');
    el.addEventListener('animationend', () => el.classList.remove('has-load-entrance'), { once: true });
  });
  mediaHosts()
    .slice(0, 5)
    .forEach((host, index) => {
      host.style.setProperty('--load-intro-order', String(index));
      host.classList.add('has-load-entrance');
      host.addEventListener('animationend', () => host.classList.remove('has-load-entrance'), { once: true });
    });
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
    document.documentElement.classList.add('is-scroll-intro-ready');
    letterIntroTargets().forEach((root) => {
      root.classList.add('is-motion-ready');
    });
    wireMediaReady();
    lazyVideos();
    createGravityScroll();
    return;
  }

  document.documentElement.classList.add('is-scroll-intro-pending');
  wireMediaReady();
  lazyVideos();

  const run = async () => {
    await document.fonts.ready.catch(() => {});
    await doubleRaf();
    await playLetterIntro();
    document.documentElement.classList.remove('is-scroll-intro-pending');
    startLoadEntrance();
    const gravity = createGravityScroll();
    document.documentElement.classList.add('is-scroll-intro-ready');
    initHeaderScrollFade();
    addEventListener('load', () => gravity.refresh());
    addEventListener('pageshow', () => gravity.refresh());
  };
  run();
}
