import { initHeroBlob } from './hero-blob';
import { mountFaceGL, type FaceGL, type FaceMount } from './arrow-face-gl';
import { introDebug, introDebugOn } from './intro-debug';
import { playSnick } from './ui-sound';
import { bindAppViewport, syncAppViewport } from '../lib/viewport-layout';
import { isTraverse, leaveForRoute, takeRoute } from './arrow-route';
import type { ArrowDir, ArrowTree } from '../lib/arrow-nav';

type Dir = ArrowDir | 'up';

const INTRO_MS = 7200;
const INTRO_REVEAL_MS = 4400;
const SLIDE_MS = 4200;
const INTRO_ZOOM = 7;
const INTRO_STRETCH = 2.4;
const DISP_FROM = 100;
const DISP_REST = 0;
const BLUR_FROM = 2.2;
const BLUR_REST = 0;
/** The intro holds its first frame until two frames in a row drop at most one vsync. */
const HOLD_CALM_MS = 34;
const HOLD_MAX_MS = 400;

const easeInOut = bezier(0.77, 0, 0.175, 1);

function bezier(x1: number, y1: number, x2: number, y2: number) {
  return (t: number) => {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
    const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
    const slopeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
    let u = t;
    for (let i = 0; i < 6; i++) {
      const x = sampleX(u) - t;
      const d = slopeX(u);
      if (Math.abs(x) < 1e-4 || Math.abs(d) < 1e-4) break;
      u = Math.min(1, Math.max(0, u - x / d));
    }
    return sampleY(u);
  };
}

function cssEase(name: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || 'ease';
}

function cssMs(name: string) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 0;
  if (raw.endsWith('ms')) return Math.round(n);
  if (raw.endsWith('s')) return Math.round(n * 1000);
  return Math.round(n);
}

export function initArrowNav(root: ParentNode = document) {
  const nav = root.querySelector<HTMLElement>('[data-arrow-nav]');
  if (!nav || nav.dataset.ready === '1') return;
  introDebug.script();
  nav.dataset.ready = '1';
  syncAppViewport();

  const raw = nav.querySelector<HTMLScriptElement>('[data-nav-tree]')?.textContent;
  if (!raw) return;
  const tree = JSON.parse(raw) as ArrowTree;
  const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
  const stage = nav.querySelector<HTMLElement>('[data-nav-stage]')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const moveMs = () => cssMs('--dur-nav');
  const gap = 8;

  const visibleRect = () => {
    const vv = window.visualViewport;
    if (document.documentElement.hasAttribute('data-app-inset') && vv) {
      return {
        left: Math.round(vv.offsetLeft),
        top: Math.round(vv.offsetTop),
        width: Math.round(vv.width),
        height: Math.round(vv.height),
        right: Math.round(vv.offsetLeft + vv.width),
        bottom: Math.round(vv.offsetTop + vv.height),
      };
    }
    return {
      left: 0,
      top: 0,
      width: window.innerWidth,
      height: window.innerHeight,
      right: window.innerWidth,
      bottom: window.innerHeight,
    };
  };

  let screenId = 'landing';
  let generation = 0;
  let introOn = true;
  let introPlaying = true;
  let faceGL: FaceGL | null = null;
  let pressed: HTMLElement | null = null;
  let pressFrom: 'key' | 'pointer' | null = null;
  let pressKey = '';
  let slide = 0;
  let progressFrame = 0;
  let progressStart = 0;
  let videoTime = 0;
  let autoplay = false;
  let full = false;
  let fullGen = 0;
  let mediaGen = 0;

  initHeroBlob(nav);

  const screen = () => (screenId === 'landing' ? null : nodes.get(screenId) ?? null);

  const flights = () => [...nav.querySelectorAll<HTMLElement>('[data-nav-flight]')];

  const child = (id: string, dir: ArrowDir) =>
    tree.nodes.find((node) => node.parent === id && node.dir === dir);

  const depthOf = (id: string) => {
    let depth = 0;
    let cursor = id;
    const seen = new Set<string>();
    while (cursor !== 'landing' && !seen.has(cursor)) {
      seen.add(cursor);
      const parent = nodes.get(cursor)?.parent;
      if (!parent) break;
      depth += 1;
      cursor = parent;
    }
    return depth;
  };

  const applyCopy = (id: string) => {
    const node = id === 'landing' ? null : nodes.get(id);
    const title = nav.querySelector<HTMLElement>('[data-nav-title]')!;
    const body = nav.querySelector<HTMLElement>('[data-nav-body]')!;
    const titleText = node ? node.title : tree.landing.title;
    const bodyText = node ? node.body : tree.landing.body;
    const paragraphs = node?.paragraphs.length ? node.paragraphs : bodyText ? [bodyText] : [];
    title.textContent = titleText;
    title.hidden = !titleText;
    body.replaceChildren(
      ...paragraphs.map((paragraph) => {
        const line = document.createElement('p');
        line.className = 'arrow-body';
        line.dataset.navLine = '';
        if (node?.paragraphs.length) line.innerHTML = paragraph;
        else line.textContent = paragraph;
        return line;
      }),
    );
  };

  const paintChrome = (id: string) => {
    const node = id === 'landing' ? null : nodes.get(id);
    const kind = node?.kind ?? 'landing';
    nav.dataset.screen = id;
    nav.dataset.kind = kind;
    const gallery = kind === 'gallery';
    const prose = !!node?.paragraphs.length;
    const hasCopy = prose || !!(node ? node.title || node.body : tree.landing.title || tree.landing.body);
    nav.querySelector<HTMLElement>('[data-nav-copy]')!.hidden = gallery || !hasCopy;
    nav.querySelector<HTMLElement>('[data-nav-face]')!.hidden = gallery;
    nav.querySelector<HTMLElement>('[data-nav-gallery]')!.hidden = !gallery;
    nav.querySelector<HTMLElement>('[data-nav-caption]')!.hidden = !gallery;
    const up = nav.querySelector<HTMLElement>('[data-dir="up"]')!;
    const upNext = child(id, 'up');
    const upLabel = up.querySelector<HTMLElement>('[data-nav-label]');
    const backIcon = up.querySelector<HTMLElement>('[data-nav-back]');
    if (!node && upNext) {
      up.hidden = false;
      up.dataset.mode = 'text';
      if (upLabel) {
        upLabel.hidden = false;
        upLabel.textContent = upNext.label;
      }
      if (backIcon) backIcon.hidden = true;
      up.removeAttribute('aria-label');
    } else if (node) {
      up.hidden = false;
      up.dataset.mode = 'back';
      if (upLabel) upLabel.hidden = true;
      if (backIcon) backIcon.hidden = false;
      up.setAttribute('aria-label', 'Back');
    } else {
      up.hidden = true;
    }

    for (const dir of ['left', 'right', 'down'] as const) {
      const button = nav.querySelector<HTMLElement>(`[data-dir="${dir}"]`)!;
      const next = child(id, dir);
      const label = button.querySelector<HTMLElement>('[data-nav-label]');
      const chevron = button.querySelector<HTMLElement>('[data-nav-chevron]');
      const arrows = gallery && dir !== 'down';
      button.dataset.mode = arrows ? 'icon' : 'text';
      button.removeAttribute('data-contact-open');
      if (id === 'about' && (dir === 'left' || dir === 'right')) {
        button.hidden = false;
        if (chevron) chevron.hidden = true;
        if (label) {
          label.hidden = false;
          label.textContent = dir === 'left' ? 'Services' : 'Contact';
        }
        if (dir === 'right') button.setAttribute('data-contact-open', '');
        button.removeAttribute('aria-label');
        continue;
      }
      if (arrows) {
        button.hidden = false;
        if (label) label.hidden = true;
        if (chevron) chevron.hidden = false;
        button.setAttribute('aria-label', dir === 'left' ? 'Previous' : 'Next');
        continue;
      }
      if (!next) {
        button.hidden = true;
        continue;
      }
      button.hidden = false;
      if (chevron) chevron.hidden = true;
      if (label) {
        label.hidden = false;
        label.textContent = next.label;
      }
      button.removeAttribute('aria-label');
    }
  };

  const warmImages = new Map<string, HTMLImageElement>();
  const warmVideos = new Map<string, HTMLVideoElement>();

  const warmSlide = (item: { src: string; poster: string; kind: string } | undefined, priority: 'high' | 'low' | 'auto') => {
    if (!item?.src) return;
    if (item.kind === 'video') {
      if (item.poster && !warmImages.has(item.poster)) {
        const poster = new Image();
        poster.decoding = 'async';
        poster.fetchPriority = priority;
        poster.src = item.poster;
        warmImages.set(item.poster, poster);
      }
      if (!warmVideos.has(item.src)) {
        const clip = document.createElement('video');
        clip.preload = 'auto';
        clip.muted = true;
        clip.playsInline = true;
        clip.src = item.src;
        warmVideos.set(item.src, clip);
      }
      return;
    }
    if (warmImages.has(item.src)) return;
    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = priority;
    img.src = item.src;
    img.decode().catch(() => {});
    warmImages.set(item.src, img);
  };

  const warmedPages = new Set<string>();

  const warmDestination = (href: string | undefined) => {
    if (!href || warmedPages.has(href)) return;
    warmedPages.add(href);
    fetch(href)
      .then((response) => (response.ok ? response.text() : ''))
      .then((html) => {
        if (!html) return;
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const entry = doc.querySelector('.is-entry');
        if (!entry) return;
        entry.querySelectorAll('img').forEach((img) => {
          const src = img.getAttribute('src');
          if (!src) return;
          const pre = new Image();
          const srcset = img.getAttribute('srcset');
          const sizes = img.getAttribute('sizes');
          if (srcset) pre.srcset = srcset;
          if (sizes) pre.sizes = sizes;
          pre.decoding = 'async';
          pre.src = src;
          pre.decode().catch(() => {});
          warmImages.set(src, pre);
        });
        entry.querySelectorAll('video').forEach((video) => {
          const poster = video.getAttribute('poster');
          const source = video.getAttribute('data-src') || video.getAttribute('src');
          if (poster) warmSlide({ src: poster, poster: '', kind: 'image' }, 'high');
          if (source) warmSlide({ src: source, poster: poster || '', kind: 'video' }, 'auto');
        });
      })
      .catch(() => {});
  };

  // A route screen one press away is fetched ahead, so its page is ready
  // when the controls land.
  const warmRoutes = (id: string) => {
    tree.nodes.forEach((node) => {
      if (node.parent !== id || !node.href || warmedPages.has(node.href)) return;
      warmedPages.add(node.href);
      const link = document.createElement('link');
      link.rel = 'prefetch';
      link.href = node.href;
      document.head.append(link);
    });
  };

  const warmGallery = (slides: { src: string; poster: string; kind: string; href?: string }[], index: number) => {
    const count = slides.length;
    const next = (index + 1) % count;
    const prev = (index - 1 + count) % count;
    warmSlide(slides[index], 'high');
    warmDestination(slides[index]?.href);
    if (count < 2) return;
    warmSlide(slides[next], 'high');
    warmDestination(slides[next]?.href);
    if (prev !== next) warmSlide(slides[prev], 'auto');
  };

  const packDots = (dots: HTMLElement[]) => {
    const active = Math.max(0, dots.findIndex((dot) => dot.classList.contains('is-on')));
    const furthest = Math.max(active, dots.length - 1 - active) - 0.5;
    dots.forEach((dot, i) => {
      if (i === 0) return;
      const dist = furthest <= 0 ? 0 : Math.min(1, (Math.abs(i - 0.5 - active) - 0.5) / furthest);
      const gap = Math.round(8 * (1 - dist) ** 2);
      dot.style.marginLeft = `${gap}px`;
    });
  };

  const fitProjectLink = () => {
    const link = nav.querySelector<HTMLAnchorElement>('[data-nav-project]');
    const title = nav.querySelector<HTMLElement>('[data-nav-project-title]');
    const action = nav.querySelector<HTMLElement>('[data-nav-project-action]');
    if (!link || !title || !action || link.hidden) return;
    const item = screen()?.slides[slide];
    const full = item?.action || '';
    action.textContent = full;
    if (!matchMedia('(max-width: 759px)').matches || !full) return;
    const max = link.parentElement?.clientWidth ?? 0;
    const width = () => {
      link.style.width = 'max-content';
      link.style.maxWidth = 'none';
      title.style.minWidth = 'max-content';
      title.style.overflow = 'visible';
      const value = link.offsetWidth;
      link.style.width = '';
      link.style.maxWidth = '';
      title.style.minWidth = '';
      title.style.overflow = '';
      return value;
    };
    if (width() > max && full === 'View project') action.textContent = 'View';
  };

  const clearGalleryMedia = () => {
    mediaGen += 1;
    const photo = nav.querySelector<HTMLImageElement>('[data-nav-photo]')!;
    const clip = nav.querySelector<HTMLVideoElement>('[data-nav-video]')!;
    photo.getAnimations().forEach((anim) => anim.cancel());
    photo.removeAttribute('src');
    photo.alt = '';
    photo.style.opacity = '0';
    photo.hidden = true;
    clip.onloadedmetadata = null;
    clip.onloadeddata = null;
    clip.pause();
    clip.removeAttribute('src');
    clip.removeAttribute('poster');
    clip.load();
    clip.style.opacity = '0';
    clip.hidden = true;
  };

  const showSlide = (index: number, morph = true) => {
    const node = screen();
    if (!node || node.kind !== 'gallery' || !node.slides.length) return;
    const count = node.slides.length;
    slide = (index + count) % count;
    const item = node.slides[slide];
    const photo = nav.querySelector<HTMLImageElement>('[data-nav-photo]')!;
    const clip = nav.querySelector<HTMLVideoElement>('[data-nav-video]')!;
    const caption = nav.querySelector<HTMLElement>('[data-nav-caption]')!;
    const title = caption.querySelector<HTMLElement>('.arrow-caption-title')!;
    const body = caption.querySelector<HTMLElement>('.arrow-caption-body')!;
    const projectLink = caption.querySelector<HTMLAnchorElement>('[data-nav-project]')!;
    if (!projectLink.dataset.returnBound) {
      projectLink.dataset.returnBound = 'true';
      projectLink.addEventListener('click', () => {
        if (projectLink.hidden || !projectLink.dataset.return) return;
        sessionStorage.setItem('arrow-return', '1');
      });
    }
    const projectTitle = caption.querySelector<HTMLElement>('[data-nav-project-title]')!;
    const projectAction = caption.querySelector<HTMLElement>('[data-nav-project-action]')!;
    const buy = caption.querySelector<HTMLElement>('[data-nav-buy]')!;
    const slug = caption.querySelector<HTMLInputElement>('[data-nav-buy-slug]')!;
    const gallery = nav.querySelector<HTMLElement>('[data-nav-gallery]')!;
    const cutout = !!item.alpha;
    photo.classList.toggle('is-alpha', cutout);
    gallery.classList.toggle('is-alpha', cutout);
    photo.getAnimations().forEach((anim) => anim.cancel());
    const gen = ++mediaGen;
    const stillCurrent = () => gen === mediaGen && screen()?.slides[slide] === item;
    if (item.kind === 'video') {
      photo.removeAttribute('src');
      photo.alt = '';
      photo.style.opacity = '0';
      photo.hidden = true;
      const sameClip = clip.getAttribute('src') === item.src;
      clip.hidden = false;
      clip.style.opacity = sameClip && clip.readyState >= 2 ? '' : '0';
      clip.poster = item.poster || '';
      if (!sameClip) {
        clip.removeAttribute('src');
        clip.load();
        clip.src = item.src;
      }
      const revealClip = () => {
        if (!stillCurrent()) return;
        clip.style.opacity = '';
      };
      if (clip.readyState >= 2) revealClip();
      else {
        clip.onloadeddata = () => {
          clip.onloadeddata = null;
          revealClip();
        };
      }
      clip.play().catch(() => {});
      clip.onloadedmetadata = () => {
        if (!stillCurrent() || !clip.videoWidth) return;
        fitGallery({ width: clip.videoWidth, height: clip.videoHeight }, true);
      };
    } else {
      clip.onloadedmetadata = null;
      clip.onloadeddata = null;
      clip.pause();
      clip.hidden = true;
      clip.removeAttribute('src');
      clip.removeAttribute('poster');
      clip.load();
      clip.style.opacity = '0';
      const samePhoto = photo.getAttribute('src') === item.src && photo.complete && photo.naturalWidth > 0;
      photo.hidden = false;
      photo.fetchPriority = 'high';
      photo.alt = item.alt;
      const revealPhoto = () => {
        if (!stillCurrent()) return;
        photo.style.opacity = '';
      };
      if (!samePhoto) {
        // Drop the previous bitmap before the next src paints, so another
        // category's last frame never lingers in an empty gallery.
        photo.style.opacity = '0';
        photo.removeAttribute('src');
        photo.addEventListener('load', revealPhoto, { once: true });
        photo.addEventListener('error', revealPhoto, { once: true });
        photo.src = item.src;
      }
      if (photo.complete && photo.naturalWidth > 0) revealPhoto();
    }
    fitGallery(item, morph && !full);
    title.textContent = item.title;
    body.innerHTML = item.caption;
    if (item.href) {
      projectLink.hidden = false;
      projectLink.href = item.href;
      projectTitle.textContent = item.title;
      projectAction.textContent = item.action;
      title.hidden = true;
      body.hidden = true;
      projectLink.dataset.return = '1';
      if (item.slug) gallery.dataset.project = item.slug;
      else delete gallery.dataset.project;
    } else {
      projectLink.hidden = true;
      delete projectLink.dataset.return;
      delete gallery.dataset.project;
      title.hidden = !item.title;
      body.hidden = !item.caption;
    }
    slug.value = item.product;
    buy.hidden = !item.product;
    caption.hidden = !item.title && !item.caption && !item.product;
    fitProjectLink();
    const dots = nav.querySelector<HTMLElement>('[data-nav-dots]')!;
    const built = node.slides.map((_, i) => {
      const dot = document.createElement('span');
      dot.className = i === slide ? 'arrow-dot is-on' : 'arrow-dot';
      return dot;
    });
    dots.replaceChildren(...built);
    packDots(built);
    progressStart = performance.now();
    videoTime = 0;
    if (autoplay) wakeProgress();
    warmGallery(node.slides, slide);
  };

  const stopAutoplay = () => {
    autoplay = false;
    if (progressFrame) cancelAnimationFrame(progressFrame);
    progressFrame = 0;
  };

  const wakeProgress = () => {
    if (progressFrame) cancelAnimationFrame(progressFrame);
    const tick = (now: number) => {
      if (!autoplay) return;
      const item = screen()?.slides[slide];
      const clip = nav.querySelector<HTMLVideoElement>('[data-nav-video]');
      let t = 0;
      let done = false;
      const sameClip = (() => {
        if (!clip || item?.kind !== 'video' || clip.getAttribute('src') !== item.src || !clip.currentSrc) return false;
        try {
          return new URL(clip.currentSrc, location.href).pathname === new URL(item.src, location.href).pathname;
        } catch {
          return clip.currentSrc.includes(item.src);
        }
      })();
      const playing =
        sameClip &&
        Number.isFinite(clip.duration) &&
        clip.duration > 0 &&
        clip.readyState >= 1 &&
        !clip.paused &&
        !clip.error;
      if (playing && clip) {
        const nearEnd = clip.currentTime >= clip.duration - 0.05;
        if (videoTime > clip.duration * 0.5 && clip.currentTime < 0.2) done = true;
        done = done || (nearEnd && videoTime > 0);
        videoTime = clip.currentTime;
        t = Math.min(1, clip.currentTime / clip.duration);
      } else {
        // Stills, blocked autoplay, or a reused video element still showing a
        // previous clip's currentTime all use the still timer so the gallery
        // cannot skip a frame later.
        t = Math.min(1, (now - progressStart) / SLIDE_MS);
        done = t >= 1;
      }
      nav.querySelector<HTMLElement>('.arrow-dot.is-on')?.style.setProperty('--nav-progress', t.toFixed(3));
      if (done) {
        showSlide(slide + 1);
        return;
      }
      progressFrame = requestAnimationFrame(tick);
    };
    progressFrame = requestAnimationFrame(tick);
  };

  const startAutoplay = () => {
    if (reduce) return;
    const node = screen();
    if (!node || node.kind !== 'gallery' || node.slides.length < 2) return;
    autoplay = true;
    progressStart = performance.now();
    wakeProgress();
  };

  const clearPin = (el: HTMLElement) => {
    el.style.position = '';
    el.style.left = '';
    el.style.top = '';
    el.style.right = '';
    el.style.bottom = '';
    el.style.margin = '';
    el.style.width = '';
    el.style.height = '';
    el.style.transform = '';
    el.style.opacity = '';
  };

  const phone = () => matchMedia('(max-width: 759px)').matches;

  const controlSize = () => {
    const n = parseFloat(getComputedStyle(nav).getPropertyValue('--arrow-control'));
    return Number.isFinite(n) ? Math.round(n) : 64;
  };

  const frameFor = (width: number, height: number) => {
    const host = nav.getBoundingClientRect();
    const margin = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--margin')) || 20;
    const maxWidth = phone()
      ? Math.round(host.width - 2 * controlSize() - 2 * margin)
      : Math.round(Math.min(720, host.width * 0.62));
    const maxHeight = Math.round(Math.min(host.height * 0.62, host.height - controlSize() * 2));
    const ratio = width > 0 && height > 0 ? width / height : 1.6;
    let nextWidth = Math.max(1, maxWidth);
    let nextHeight = Math.max(1, Math.round(nextWidth / ratio));
    if (maxHeight > 0 && nextHeight > maxHeight) {
      nextHeight = maxHeight;
      nextWidth = Math.max(1, Math.round(nextHeight * ratio));
    }
    const left = Math.round(host.left + (host.width - nextWidth) / 2);
    const top = Math.round(host.top + (host.height - nextHeight) / 2);
    return { left, top, right: left + nextWidth, bottom: top + nextHeight, width: nextWidth, height: nextHeight };
  };

  const restingFrame = () => {
    const item = screen()?.slides[slide];
    return frameFor(item?.width || 16, item?.height || 10);
  };

  let frameWatch = 0;
  const fitGallery = (item: { width: number; height: number }, morph: boolean) => {
    if (full) return;
    const gallery = galleryEl();
    const box = frameFor(item.width, item.height);
    const jump = !morph || reduce || full;
    if (jump) gallery.style.transition = 'none';
    gallery.style.width = `${box.width}px`;
    gallery.style.height = `${box.height}px`;
    if (jump) {
      gallery.getBoundingClientRect();
      gallery.style.transition = '';
    }
    if (frameWatch) cancelAnimationFrame(frameWatch);
    if (!jump && !full) {
      const start = performance.now();
      const tick = () => {
        frameWatch = 0;
        if (nav.dataset.kind !== 'gallery' || full) return;
        placeGalleryArrows();
        placeCaption();
        if (performance.now() - start < moveMs() + 50) frameWatch = requestAnimationFrame(tick);
      };
      frameWatch = requestAnimationFrame(tick);
    }
  };

  const placeGalleryArrows = (frame: { left: number; top: number; right: number; bottom: number; width: number; height: number } | null = null) => {
    const left = nav.querySelector<HTMLElement>('[data-dir="left"]')!;
    const right = nav.querySelector<HTMLElement>('[data-dir="right"]')!;
    const back = nav.querySelector<HTMLElement>('[data-dir="up"]')!;
    if (nav.dataset.kind !== 'gallery') {
      clearPin(left);
      clearPin(right);
      clearPin(back);
      return;
    }
    const edges = nav.classList.contains('is-full');
    const view = visibleRect();
    const box = edges
      ? view
      : frame
        ?? (nav.classList.contains('is-cover')
          ? restingFrame()
          : nav.querySelector<HTMLElement>('[data-nav-gallery]')!.getBoundingClientRect());
    const size = controlSize();
    const pad = phone() ? 20 : 48;
    const y = edges ? Math.round(view.top + (view.height - size) / 2) : Math.round(box.top + box.height / 2 - size / 2);
    const spots: [HTMLElement, number][] = [
      [left, edges ? view.left + pad : Math.round(view.left + (box.left - view.left) / 2 - size / 2)],
      [right, edges ? Math.round(view.right - pad - size) : Math.round(box.right + (view.right - box.right) / 2 - size / 2)],
    ];
    for (const [el, x] of spots) {
      el.style.position = 'fixed';
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.margin = '0';
      el.style.width = `${size}px`;
      el.style.height = `${size}px`;
      el.style.transform = 'none';
    }
    const above = Math.round((nav.clientHeight - box.height) / 4);
    back.style.position = edges ? 'fixed' : 'absolute';
    back.style.left = edges ? `${Math.round(view.left + (view.width - size) / 2)}px` : `${Math.round(nav.clientWidth / 2 - size / 2)}px`;
    back.style.right = 'auto';
    back.style.bottom = 'auto';
    back.style.top = edges ? `${view.top + pad}px` : `${Math.round(above - size / 2)}px`;
    back.style.width = `${size}px`;
    back.style.height = `${size}px`;
    back.style.transform = 'none';
  };

  const dropFull = () => {
    full = false;
    fullGen += 1;
    nav.classList.remove('is-full', 'is-cover', 'is-zoom');
    const gallery = galleryEl();
    gallery.getAnimations().forEach((anim) => anim.cancel());
    gallery.style.position = '';
    gallery.style.left = '';
    gallery.style.top = '';
    gallery.style.right = '';
    gallery.style.bottom = '';
    gallery.style.width = '';
    gallery.style.height = '';
    gallery.style.margin = '';
    gallery.style.transform = '';
    gallery.style.aspectRatio = '';
    gallery.style.borderRadius = '';
    gallery.style.clipPath = '';
    gallery.style.transition = '';
  };

  const setFull = (open: boolean) => {
    if (screen()?.kind !== 'gallery' || open === full) return;
    const gallery = galleryEl();
    gallery.style.transition = 'none';
    const radius = getComputedStyle(document.documentElement).getPropertyValue('--radius').trim() || '31px';
    const buttons = (['left', 'right', 'up'] as const).map((dir) => nav.querySelector<HTMLElement>(`[data-dir="${dir}"]`)!);
    const before = new Map(buttons.filter((el) => !el.hidden).map((el) => [el, el.getBoundingClientRect()]));
    const current = gallery.getBoundingClientRect();
    const rest = restingFrame();
    buttons.forEach((el) => el.getAnimations().forEach((anim) => anim.cancel()));
    full = open;
    const gen = ++fullGen;
    const clearBox = () => {
      gallery.style.position = '';
      gallery.style.left = '';
      gallery.style.top = '';
      gallery.style.right = '';
      gallery.style.bottom = '';
      gallery.style.width = '';
      gallery.style.height = '';
      gallery.style.margin = '';
      gallery.style.transform = '';
      gallery.style.aspectRatio = '';
      gallery.style.borderRadius = '';
    };
    const pin = (rect: { left: number; top: number; width: number; height: number }, curve: string) => {
      gallery.getAnimations().forEach((anim) => anim.cancel());
      gallery.style.position = 'fixed';
      gallery.style.left = `${Math.round(rect.left)}px`;
      gallery.style.top = `${Math.round(rect.top)}px`;
      gallery.style.right = 'auto';
      gallery.style.bottom = 'auto';
      gallery.style.width = `${Math.round(rect.width)}px`;
      gallery.style.height = `${Math.round(rect.height)}px`;
      gallery.style.margin = '0';
      gallery.style.transform = 'none';
      gallery.style.aspectRatio = 'auto';
      gallery.style.borderRadius = curve;
    };
    if (reduce) {
      nav.classList.toggle('is-cover', open);
      nav.classList.toggle('is-full', open);
      nav.classList.remove('is-zoom');
      clearBox();
      const current = screen()?.slides[slide];
      if (current) fitGallery(current, false);
      placeGalleryArrows();
      return;
    }
    pin(current, open ? radius : '0px');
    nav.classList.toggle('is-full', open);
    nav.classList.add('is-zoom');
    if (!open) nav.classList.remove('is-cover');
    const ease = cssEase('--ease-nav');
    const view = visibleRect();
    const target = open
      ? { left: view.left, top: view.top, width: view.width, height: view.height, borderRadius: '0px' }
      : { left: rest.left, top: rest.top, width: rest.width, height: rest.height, borderRadius: radius };
    const anim = gallery.animate(
      [
        {
          left: `${Math.round(current.left)}px`,
          top: `${Math.round(current.top)}px`,
          width: `${Math.round(current.width)}px`,
          height: `${Math.round(current.height)}px`,
          borderRadius: open ? radius : '0px',
        },
        {
          left: `${target.left}px`,
          top: `${target.top}px`,
          width: `${target.width}px`,
          height: `${target.height}px`,
          borderRadius: target.borderRadius,
        },
      ],
      { duration: moveMs(), easing: ease, fill: 'both' },
    );
    anim.finished.finally(() => {
      if (gen !== fullGen) return;
      if (full) nav.classList.add('is-cover');
      else {
        gallery.style.left = `${rest.left}px`;
        gallery.style.top = `${rest.top}px`;
        gallery.style.width = `${rest.width}px`;
        gallery.style.height = `${rest.height}px`;
        gallery.style.borderRadius = radius;
      }
      anim.cancel();
      clearBox();
      nav.classList.remove('is-zoom');
      if (!full) {
        buttons.forEach((el) => el.getAnimations().forEach((item) => item.cancel()));
        const current = screen()?.slides[slide];
        if (current) fitGallery(current, false);
        placeGalleryArrows();
      }
    }).catch(() => {});
    placeGalleryArrows(open ? null : rest);
    before.forEach((rect, el) => {
      const next = el.getBoundingClientRect();
      const dx = Math.round(rect.left - next.left);
      const dy = Math.round(rect.top - next.top);
      if (!dx && !dy) return;
      const move = el.animate(
        [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0px, 0px)' }],
        { duration: moveMs(), easing: ease, fill: 'both' },
      );
      move.finished.finally(() => {
        if (gen !== fullGen) return;
        move.cancel();
      }).catch(() => {});
    });
  };

  // Holds a control where it rests while it flies, in its own parent's
  // coordinates, so no fixed-position containing block is involved.
  const pinAt = (el: HTMLElement, rect: DOMRect) => {
    const parent = (el.offsetParent as HTMLElement | null)?.getBoundingClientRect() ?? { left: 0, top: 0 };
    el.style.position = 'absolute';
    el.style.left = `${Math.round(rect.left - parent.left)}px`;
    el.style.top = `${Math.round(rect.top - parent.top)}px`;
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.margin = '0';
    el.style.width = `${Math.round(rect.width)}px`;
    el.style.height = `${Math.round(rect.height)}px`;
    el.style.transform = 'none';
  };

  const hubPoint = () => {
    const slot = nav.querySelector<HTMLElement>('.arrow-slot')!.getBoundingClientRect();
    return { x: slot.left + slot.width / 2, y: slot.top + slot.height / 2 };
  };

  const faceEl = () => nav.querySelector<HTMLElement>('[data-nav-face]')!;
  const galleryEl = () => nav.querySelector<HTMLElement>('[data-nav-gallery]')!;

  const placeCopy = () => {
    const copy = nav.querySelector<HTMLElement>('[data-nav-copy]')!;
    const back = nav.querySelector<HTMLElement>('[data-dir="up"]')!;
    if (nav.dataset.screen === 'about') {
      copy.style.top = '';
      copy.style.transform = '';
      return;
    }
    copy.style.transform = '';
    const origin = document.documentElement.hasAttribute('data-app-inset')
      ? nav.getBoundingClientRect().top
      : 0;
    const faceTop = faceEl().getBoundingClientRect().top;
    const limit = back.hidden ? faceTop : back.getBoundingClientRect().top;
    copy.style.top = `${Math.round((limit - origin) / 2)}px`;
  };

  const placeCaption = () => {
    const gallery = galleryEl();
    const caption = nav.querySelector<HTMLElement>('[data-nav-caption]')!;
    if (gallery.hidden) return;
    const height = gallery.offsetHeight;
    const bottom = nav.clientHeight / 2 + height / 2;
    caption.style.top = `${Math.round((bottom + nav.clientHeight) / 2)}px`;
  };

  const splitLines = (el: HTMLElement) => {
    const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
    if (!text || el.querySelector('button, a')) return [el];
    const words = text.split(' ');
    const probe = document.createElement('span');
    el.replaceChildren(probe);
    const holders = words.map((word) => {
      const span = document.createElement('span');
      span.textContent = word;
      return span;
    });
    holders.forEach((span, index) => {
      if (index) probe.append(document.createTextNode(' '));
      probe.append(span);
    });
    const groups: HTMLElement[][] = [];
    let top = -1;
    holders.forEach((span) => {
      const next = span.offsetTop;
      if (!groups.length || Math.abs(next - top) > 2) {
        groups.push([span]);
        top = next;
      } else groups[groups.length - 1].push(span);
    });
    el.replaceChildren();
    return groups.map((group) => {
      const line = document.createElement('span');
      line.className = 'arrow-line';
      line.textContent = group.map((span) => span.textContent).join(' ');
      el.append(line);
      return line;
    });
  };

  const fadeLines = (root: ParentNode) => {
    const blocks = [...root.querySelectorAll<HTMLElement>('[data-nav-line], [data-nav-caption]')].filter(
      (el) => !el.closest('[hidden]') && (el.hasAttribute('data-nav-caption') || !el.closest('[data-nav-caption]')) && (el.textContent ?? '').trim(),
    );
    const lineDelay = 80;
    const ease = cssEase('--ease-out');
    let index = 0;
    blocks.forEach((block) => {
      const lines = block.hasAttribute('data-nav-caption')
        ? [
            ...[...block.querySelectorAll<HTMLElement>('[data-nav-line]')].filter((line) => !line.hidden).flatMap((line) => splitLines(line)),
            ...(!block.querySelector<HTMLElement>('[data-nav-project]')?.hidden
              ? [block.querySelector<HTMLElement>('[data-nav-project]')!]
              : []),
            ...(!block.querySelector<HTMLElement>('[data-nav-buy]')?.hidden ? [block.querySelector<HTMLElement>('[data-nav-buy]')!] : []),
          ]
        : !block.querySelector('button')
          ? splitLines(block)
          : [block];
      lines.forEach((line) => {
        const anim = line.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: moveMs(),
          delay: index * lineDelay,
          easing: ease,
          fill: 'both',
        });
        index += 1;
        anim.finished.finally(() => anim.cancel()).catch(() => {});
      });
    });
  };

  const ghostBox = (el: HTMLElement) => {
    const ghost = el.cloneNode(true) as HTMLElement;
    const shape = getComputedStyle(el);
    const lineStyles = [...el.querySelectorAll<HTMLElement>('.arrow-line')].map((line) => getComputedStyle(line));
    ghost.setAttribute('aria-hidden', 'true');
    ghost.classList.add('arrow-copy-ghost');
    const rect = el.getBoundingClientRect();
    ghost.style.left = `${Math.round(rect.left)}px`;
    ghost.style.top = `${Math.round(rect.top)}px`;
    ghost.style.width = `${Math.round(rect.width)}px`;
    ghost.style.transform = 'none';
    ghost.style.textAlign = shape.textAlign;
    ghost.style.alignItems = shape.alignItems;
    ghost.style.color = shape.color;
    ghost.querySelectorAll<HTMLElement>('.arrow-line').forEach((line, index) => {
      const from = lineStyles[index];
      if (!from) return;
      line.style.textAlign = from.textAlign;
      line.style.color = from.color;
    });
    document.body.append(ghost);
    ghost.animate([{ opacity: 1 }, { opacity: 0 }], { duration: moveMs(), easing: cssEase('--ease-out'), fill: 'forwards' }).finished.finally(() => ghost.remove());
  };

  const dropFlights = () => {
    nav.querySelectorAll('.arrow-flight').forEach((el) => el.remove());
    document.querySelectorAll('.arrow-copy-ghost').forEach((el) => el.remove());
    flights().forEach((el) => {
      el.getAnimations().forEach((anim) => anim.cancel());
      clearPin(el);
      el.style.opacity = '';
      el.style.zIndex = '';
    });
    galleryEl().getAnimations().forEach((anim) => anim.cancel());
  };

  const growGallery = (open: boolean, fromScale: number | null) => {
    const gallery = galleryEl();
    const genAt = generation;
    gallery.hidden = false;
    gallery.style.opacity = '1';
    const faceW = faceEl().getBoundingClientRect().width || controlSize();
    const small = Math.max(0.12, faceW / (gallery.offsetWidth || 1));
    const from = fromScale == null ? (open ? small : 1) : Math.min(1, Math.max(small, fromScale));
    const rest = 'translate(-50%, -50%) scale(1)';
    const at = (scale: number) => `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    const anim = gallery.animate(
      open
        ? [{ transform: at(from), opacity: 1 }, { transform: rest, opacity: 1 }]
        : [{ transform: at(from), opacity: 1 }, { transform: at(small), opacity: 0 }],
      {
        duration: moveMs(),
        easing: cssEase('--ease-nav'),
        fill: 'both',
      },
    );
    anim.finished.finally(() => {
      if (genAt !== generation) return;
      anim.cancel();
      gallery.style.opacity = '';
      if (!open && nav.dataset.kind !== 'gallery') gallery.hidden = true;
      else if (open) gallery.hidden = false;
    });
  };

  let holdTimer = 0;
  let flipping = false;
  let holdPointer = 0;
  let holdTarget: HTMLElement | null = null;
  // Wheel delta accumulates into slide steps. Trackpad inertia keeps sending
  // shrinking deltas, so the flip rate slows with the OS scroll, not a fake ease.
  const SCROLL_SLIDE_PX = 80;
  const SCROLL_IDLE_MS = 480;
  const SCROLL_MAX_STEPS = 8;
  let scrollCarry = 0;
  let scrollIdle = 0;

  const canFlip = (dir: Dir) => screen()?.kind === 'gallery' && (dir === 'left' || dir === 'right');

  const clearScrollFlip = (resume: boolean) => {
    scrollCarry = 0;
    if (scrollIdle) window.clearTimeout(scrollIdle);
    scrollIdle = 0;
    if (resume) startAutoplay();
  };

  const releasePointer = () => {
    if (holdTarget && holdPointer) {
      try {
        holdTarget.releasePointerCapture(holdPointer);
      } catch {
        /* already released */
      }
    }
    holdPointer = 0;
    holdTarget = null;
  };

  const stopHold = (resume: boolean) => {
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = 0;
    flipping = false;
    if (resume) startAutoplay();
  };

  const abandonHold = () => {
    if (!pressFrom) return;
    stopHold(false);
    releasePointer();
    setPressed(null, null);
  };

  const startHold = (dir: Dir) => {
    if (!canFlip(dir)) return false;
    clearScrollFlip(false);
    stopAutoplay();
    const step = () => {
      showSlide(slide + (dir === 'right' ? 1 : -1));
      playSnick();
    };
    step();
    // First repeat after 480ms, then each wait is 78% of the last, down to
    // 80ms. That is the hold-to-speed-up on the gallery arrows. Capping
    // every repeat to moveMs() (500ms) made them all the same speed.
    const holdFast = 80;
    let wait = 480;
    const tick = () => {
      if (!canFlip(dir)) {
        stopHold(false);
        return;
      }
      step();
      wait = Math.max(holdFast, Math.round(wait * 0.78));
      holdTimer = window.setTimeout(tick, wait);
    };
    flipping = true;
    holdTimer = window.setTimeout(tick, wait);
    return true;
  };

  const wheelPixels = (event: WheelEvent) => {
    let dx = event.deltaX;
    let dy = event.deltaY;
    if (event.deltaMode === 1) {
      dx *= 16;
      dy *= 16;
    } else if (event.deltaMode === 2) {
      dx *= window.innerWidth;
      dy *= window.innerHeight;
    }
    return Math.abs(dy) >= Math.abs(dx) ? dy : dx;
  };

  const travel = (id: string, push: boolean) => {
    if (introOn || id === screenId || (id !== 'landing' && !nodes.has(id))) return;
    if (introPlaying) endIntro();
    if (full) dropFull();
    const gen = ++generation;
    clearScrollFlip(false);
    stopHold(false);
    stopAutoplay();
    const ease = cssEase('--ease-nav');
    const slot = nav.querySelector<HTMLElement>('.arrow-slot')!;
    const slotBefore = slot.getBoundingClientRect();
    const wasGallery = nav.dataset.kind === 'gallery';
    let fromScale: number | null = null;
    if (galleryEl().getAnimations().length) {
      const scale = Math.abs(new DOMMatrix(getComputedStyle(galleryEl()).transform).a);
      if (Number.isFinite(scale)) fromScale = scale;
    }
    const oldState = new Map<string, { rect: DOMRect; label: string; mode: string; clone: HTMLElement; opacity: number }>();
    flights()
      .filter((el) => !el.hidden)
      .forEach((el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        const shape = getComputedStyle(el);
        const opacity = Number(shape.opacity);
        clone.classList.add('arrow-flight');
        // A clone is never mistaken for the live control it copies.
        clone.removeAttribute('data-nav-flight');
        clone.removeAttribute('data-dir');
        clone.dataset.ghostDir = el.dataset.dir || '';
        clone.removeAttribute('aria-pressed');
        clone.setAttribute('aria-hidden', 'true');
        clone.tabIndex = -1;
        clone.inert = true;
        clone.style.boxSizing = 'border-box';
        clone.style.padding = shape.padding;
        clone.style.borderRadius = shape.borderRadius;
        oldState.set(el.dataset.dir || '', {
          rect: el.getBoundingClientRect(),
          label: (el.textContent ?? '').replace(/\s+/g, ' ').trim(),
          mode: el.dataset.mode || '',
          clone,
          opacity: Number.isFinite(opacity) ? opacity : 1,
        });
      });
    dropFlights();

    const copy = nav.querySelector<HTMLElement>('[data-nav-copy]')!;
    const caption = nav.querySelector<HTMLElement>('[data-nav-caption]')!;
    if (!reduce && !copy.hidden) ghostBox(copy);
    if (!reduce && !caption.hidden) ghostBox(caption);

    applyCopy(id);
    const fromId = screenId;
    const wasLanding = screenId === 'landing';
    screenId = id;
    paintChrome(id);
    warmRoutes(id);
    if (wasLanding !== (id === 'landing')) fadeHint(id === 'landing');
    window.scrollTo(0, 0);
    const enteringGallery = !wasGallery && nav.dataset.kind === 'gallery';
    const outward = depthOf(id) > depthOf(fromId);
    if (screen()?.kind === 'gallery') {
      // Empty before the stage shows / swaps, so the last category never
      // flashes while the next slide loads.
      clearGalleryMedia();
      if (enteringGallery) {
        galleryEl().hidden = false;
        galleryEl().style.opacity = '1';
        if (!reduce) faceEl().hidden = false;
      }
      showSlide(0, false);
    }
    placeGalleryArrows();
    placeCopy();
    placeCaption();
    const nowGallery = nav.dataset.kind === 'gallery';
    if (!reduce && nowGallery !== wasGallery) growGallery(nowGallery, fromScale);

    // A route screen (a node with an href) is its own page. The controls fly
    // to it here like any other screen, then the browser opens the page, which
    // shows the same screen. Its history entry is that page, not a hash.
    const route = nodes.get(id)?.href;
    const landed = () => {
      if (gen !== generation || !route) return;
      leaveForRoute(id, route);
    };
    if (route) push = false;

    if (reduce) {
      flights().forEach(clearPin);
      placeGalleryArrows();
      startAutoplay();
      if (push) history.pushState({ arrow: id }, '', id === 'landing' ? location.pathname + location.search : `#${id}`);
      landed();
      return;
    }

    // Everything below is measured after the new screen is laid out and the
    // page is back at the top. Old rects move with the slot if it scrolled.
    const slotNow = slot.getBoundingClientRect();
    const shiftX = slotNow.left - slotBefore.left;
    const shiftY = slotNow.top - slotBefore.top;
    if (shiftX || shiftY) {
      oldState.forEach((prev) => {
        prev.rect = new DOMRect(prev.rect.left + shiftX, prev.rect.top + shiftY, prev.rect.width, prev.rect.height);
      });
    }
    const hub = hubPoint();
    const shifted = (from: DOMRect, to: DOMRect) =>
      Math.abs(from.left + from.width / 2 - (to.left + to.width / 2)) > 4 ||
      Math.abs(from.top + from.height / 2 - (to.top + to.height / 2)) > 4;
    const arriving = flights().filter((el) => !el.hidden);
    const placed = arriving.map((el) => {
      const rect = el.getBoundingClientRect();
      const prev = oldState.get(el.dataset.dir || '');
      const label = (el.textContent ?? '').replace(/\s+/g, ' ').trim();
      const identity = !!prev && prev.mode === (el.dataset.mode || '') && prev.label === label;
      const moved = !!prev && identity && shifted(prev.rect, rect);
      const same = identity && !moved;
      return { el, rect, prev, same, moved };
    });
    const verticalDir = (dir: string) => dir === 'up' || dir === 'down';
    // Each direction owns the half-plane on its side of the hub. Every control
    // that flies is clipped to it, so it slides out of and into the face and
    // never across it. The clip is drawn in the control's own box and moves
    // against its translate, which keeps the edge still on the hub line.
    const far = 10000;
    const maskAt = (dir: string, rect: DOMRect, x: number, y: number) => {
      const edgeX = (hub.x - rect.left - x).toFixed(2);
      const edgeY = (hub.y - rect.top - y).toFixed(2);
      if (dir === 'right') return `polygon(${edgeX}px ${-far}px, ${far}px ${-far}px, ${far}px ${far}px, ${edgeX}px ${far}px)`;
      if (dir === 'left') return `polygon(${-far}px ${-far}px, ${edgeX}px ${-far}px, ${edgeX}px ${far}px, ${-far}px ${far}px)`;
      if (dir === 'down') return `polygon(${-far}px ${edgeY}px, ${far}px ${edgeY}px, ${far}px ${far}px, ${-far}px ${far}px)`;
      return `polygon(${-far}px ${-far}px, ${far}px ${-far}px, ${far}px ${edgeY}px, ${-far}px ${edgeY}px)`;
    };
    const horizontal = (dir: string) => dir === 'left' || dir === 'right';
    const pairMove = (dir: string, lead: DOMRect, dest: DOMRect) => {
      const motion = (outward ? 1 : -1) * (dir === 'left' || dir === 'up' ? -1 : 1);
      const startLeft = horizontal(dir) ? (motion > 0 ? lead.left - gap - dest.width : lead.right + gap) : dest.left;
      const startTop = horizontal(dir) ? dest.top : motion > 0 ? lead.top - gap - dest.height : lead.bottom + gap;
      return {
        x: horizontal(dir) ? Math.round(dest.left - startLeft) : 0,
        y: horizontal(dir) ? 0 : Math.round(dest.top - startTop),
      };
    };
    const hideMove = (dir: string, rect: DOMRect) => {
      if (dir === 'right') return { x: Math.round(hub.x - rect.right), y: 0 };
      if (dir === 'left') return { x: Math.round(hub.x - rect.left), y: 0 };
      if (dir === 'down') return { x: 0, y: Math.round(hub.y - rect.bottom) };
      return { x: 0, y: Math.round(hub.y - rect.top) };
    };
    const further = (hide: { x: number; y: number }, arrive: { x: number; y: number }) => ({
      x: hide.x === 0 ? 0 : hide.x < 0 ? Math.min(hide.x, arrive.x) : Math.max(hide.x, arrive.x),
      y: hide.y === 0 ? 0 : hide.y < 0 ? Math.min(hide.y, arrive.y) : Math.max(hide.y, arrive.y),
    });
    const departMove = (dir: string, prev: { rect: DOMRect }, arrival: { rect: DOMRect } | undefined) => {
      if (!arrival) {
        if (!outward) return hideMove(dir, prev.rect);
        const sign = dir === 'left' || dir === 'up' ? -1 : 1;
        const dist = Math.round((horizontal(dir) ? prev.rect.width : prev.rect.height) + gap);
        return horizontal(dir) ? { x: sign * dist, y: 0 } : { x: 0, y: sign * dist };
      }
      const arrive = pairMove(dir, prev.rect, arrival.rect);
      return outward ? arrive : further(hideMove(dir, prev.rect), arrive);
    };
    if (!reduce) {
      oldState.forEach((prev, dir) => {
        const stay = placed.find((item) => item.el.dataset.dir === dir && (item.same || item.moved));
        if (stay) return;
        const arrival = placed.find((item) => item.el.dataset.dir === dir && !item.same && !item.moved);
        const clone = prev.clone;
        clone.style.position = 'absolute';
        clone.style.left = `${Math.round(prev.rect.left - slotNow.left)}px`;
        clone.style.top = `${Math.round(prev.rect.top - slotNow.top)}px`;
        clone.style.right = 'auto';
        clone.style.bottom = 'auto';
        clone.style.margin = '0';
        clone.style.width = `${Math.round(prev.rect.width)}px`;
        clone.style.height = `${Math.round(prev.rect.height)}px`;
        clone.style.transform = 'none';
        clone.style.opacity = String(prev.opacity);
        clone.style.zIndex = '';
        clone.style.clipPath = '';
        slot.append(clone);
        const move = departMove(dir, prev, arrival);
        const motion = clone.animate(
          [
            { transform: 'translate(0px, 0px)', clipPath: maskAt(dir, prev.rect, 0, 0) },
            { transform: `translate(${move.x}px, ${move.y}px)`, clipPath: maskAt(dir, prev.rect, move.x, move.y) },
          ],
          { duration: moveMs(), easing: ease, fill: 'both' },
        );
        clone.animate([{ opacity: prev.opacity }, { opacity: 0 }], {
          duration: Math.round(moveMs() * 0.7),
          easing: ease,
          fill: 'forwards',
        });
        motion.finished.finally(() => clone.remove()).catch(() => {});
      });
    }
    const anims = placed.filter((item) => !item.same).map(({ el, rect, prev, moved }) => {
      const dir = el.dataset.dir || '';
      const vertical = verticalDir(dir);
      let dx = 0;
      let dy = 0;
      if (moved && prev) {
        const destCx = rect.left + rect.width / 2;
        const destCy = rect.top + rect.height / 2;
        dx = vertical ? 0 : Math.round(prev.rect.left + prev.rect.width / 2 - destCx);
        dy = vertical ? Math.round(prev.rect.top + prev.rect.height / 2 - destCy) : 0;
      } else if (prev) {
        const arrive = pairMove(dir, prev.rect, rect);
        dx = -arrive.x;
        dy = -arrive.y;
      } else {
        const destCx = rect.left + rect.width / 2;
        const destCy = rect.top + rect.height / 2;
        dx = Math.round((vertical ? destCx : hub.x) - destCx);
        dy = Math.round((vertical ? hub.y : destCy) - destCy);
      }
      pinAt(el, rect);
      el.style.zIndex = '1';
      const anim = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, opacity: moved ? 1 : 0, clipPath: maskAt(dir, rect, dx, dy) },
          { transform: 'translate(0px, 0px)', opacity: 1, clipPath: maskAt(dir, rect, 0, 0) },
        ],
        { duration: moveMs(), easing: ease, fill: 'both' },
      );
      anim.finished.finally(() => {
        if (gen !== generation) return;
        anim.cancel();
        el.style.opacity = '';
        el.style.zIndex = '';
        clearPin(el);
      });
      return anim.finished.catch(() => {});
    });

    fadeLines(nav);
    Promise.all(anims).finally(() => {
      if (gen !== generation) return;
      if (nav.dataset.kind === 'gallery') faceEl().hidden = true;
      placeGalleryArrows();
      startAutoplay();
      landed();
    });

    if (push) history.pushState({ arrow: id }, '', id === 'landing' ? location.pathname + location.search : `#${id}`);
  };

  const activate = (dir: Dir) => {
    const node = screen();
    if (node?.kind === 'gallery' && (dir === 'left' || dir === 'right')) {
      showSlide(slide + (dir === 'right' ? 1 : -1));
      return;
    }
    if (dir === 'down' && node?.kind === 'gallery') {
      const link = nav.querySelector<HTMLAnchorElement>('[data-nav-project]');
      if (link && !link.hidden) {
        if (link.dataset.return) sessionStorage.setItem('arrow-return', '1');
        link.click();
        return;
      }
    }
    if (dir === 'up' && full) {
      setFull(false);
      return;
    }
    if (dir === 'up' && node) {
      travel(node.parent === 'landing' ? 'landing' : node.parent, true);
      return;
    }
    if (screenId === 'about' && dir === 'right') {
      if (pressFrom === 'key') nav.querySelector<HTMLElement>('[data-dir="right"]')?.click();
      return;
    }
    const next = child(screenId, dir);
    if (!next) return;
    // A route leaf (a services pill on the services screen) is a plain link.
    if (next.href && !tree.nodes.some((node) => node.parent === next.id)) {
      location.assign(next.href);
      return;
    }
    travel(next.id, true);
  };

  const onGalleryWheel = (event: WheelEvent) => {
    if (introOn || pressFrom) return;
    if (event.ctrlKey || event.metaKey) return;
    if (typingTarget(event)) return;
    if (document.documentElement.classList.contains('is-contact-open')) return;
    const node = screen();
    if (!node || node.kind !== 'gallery' || node.slides.length < 2) return;
    const delta = wheelPixels(event);
    if (!delta) return;
    event.preventDefault();
    stopAutoplay();
    if (scrollIdle) window.clearTimeout(scrollIdle);
    scrollIdle = window.setTimeout(() => clearScrollFlip(true), SCROLL_IDLE_MS);
    if (scrollCarry && Math.sign(scrollCarry) !== Math.sign(delta)) scrollCarry = 0;
    scrollCarry += delta;
    let steps = 0;
    while (Math.abs(scrollCarry) >= SCROLL_SLIDE_PX && steps < SCROLL_MAX_STEPS) {
      const dir = scrollCarry > 0 ? 1 : -1;
      scrollCarry -= dir * SCROLL_SLIDE_PX;
      showSlide(slide + dir);
      playSnick();
      steps += 1;
    }
  };

  const setPressed = (el: HTMLElement | null, from: 'key' | 'pointer' | null, key = '') => {
    pressed?.classList.remove('is-pressed');
    pressed?.removeAttribute('aria-pressed');
    pressed = el;
    pressFrom = el ? from : null;
    pressKey = el ? key : '';
    if (!el) return;
    el.classList.add('is-pressed');
    el.setAttribute('aria-pressed', 'true');
  };

  nav.addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    const project = (event.target as Element).closest<HTMLElement>('[data-nav-project]');
    if (project && !project.hidden && nav.contains(project) && !introOn) {
      playSnick();
      return;
    }
    const button = (event.target as Element).closest<HTMLElement>('[data-dir]');
    if (!button || button.hidden || introOn || !nav.contains(button)) return;
    setPressed(button, 'pointer', '');
    try {
      button.setPointerCapture(event.pointerId);
      holdPointer = event.pointerId;
      holdTarget = button;
    } catch {
      holdPointer = event.pointerId;
      holdTarget = button;
    }
    if (!startHold(button.dataset.dir as Dir)) playSnick();
  });

  const onPointerEnd = (event: PointerEvent, cancelled: boolean) => {
    if (pressFrom !== 'pointer' || !pressed) return;
    if (holdPointer && event.pointerId !== holdPointer) return;
    const button = pressed;
    const dir = button.dataset.dir as Dir;
    const releasedOn = (event.target as Element | null)?.closest?.('[data-dir]') === button;
    const wasFlip = flipping;
    stopHold(cancelled ? false : wasFlip);
    setPressed(null, null);
    releasePointer();
    if (!cancelled && !wasFlip && releasedOn) activate(dir);
  };

  window.addEventListener('pointerup', (event) => onPointerEnd(event, false));
  window.addEventListener('pointercancel', (event) => onPointerEnd(event, true));
  nav.addEventListener('lostpointercapture', (event) => onPointerEnd(event, true));
  window.addEventListener('blur', abandonHold);
  window.addEventListener('pagehide', abandonHold);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') abandonHold();
  });

  const keyDir: Record<string, Dir> = {
    ArrowLeft: 'left',
    ArrowRight: 'right',
    ArrowUp: 'up',
    ArrowDown: 'down',
    Escape: 'up',
    Backspace: 'up',
  };

  const typingTarget = (event: Event) =>
    event.target instanceof Element && !!event.target.closest('input, textarea, [contenteditable="true"]');

  const backKey = (key: string) => key === 'Escape' || key === 'Backspace';

  window.addEventListener('wheel', onGalleryWheel, { passive: false });

  galleryEl().addEventListener('click', () => {
    if (introOn || screen()?.kind !== 'gallery') return;
    setFull(!full);
  });

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    if (typingTarget(event)) return;
    if (document.documentElement.classList.contains('is-contact-open')) return;
    if ((event.key === ' ' || event.key === 'Enter') && screen()?.kind === 'gallery') {
      event.preventDefault();
      if (event.repeat || introOn || pressFrom) return;
      setFull(!full);
      return;
    }
    if ((backKey(event.key) || event.key === 'ArrowUp') && full) {
      event.preventDefault();
      if (event.repeat || introOn) return;
      setFull(false);
      return;
    }
    const dir = keyDir[event.key];
    if (!dir) return;
    if (backKey(event.key) && !screen()) {
      if (event.key === 'Backspace') event.preventDefault();
      return;
    }
    event.preventDefault();
    if (event.repeat || introOn || pressFrom) return;
    const projectLink = nav.querySelector<HTMLElement>('[data-nav-project]');
    const button =
      dir === 'down' && screen()?.kind === 'gallery' && projectLink && !projectLink.hidden
        ? projectLink
        : nav.querySelector<HTMLElement>(`[data-dir="${dir}"]`);
    if (!button || button.hidden) return;
    setPressed(button, 'key', event.key);
    if (backKey(event.key) || !startHold(dir)) playSnick();
  });

  window.addEventListener('keyup', (event) => {
    const dir = keyDir[event.key];
    if (!dir || pressFrom !== 'key' || !pressed || event.key !== pressKey) return;
    const wasFlip = flipping;
    stopHold(wasFlip);
    if (!wasFlip) activate(event.key === 'Escape' ? 'up' : dir);
    setPressed(null, null);
  });

  window.addEventListener('popstate', () => {
    const id = (history.state && history.state.arrow) || 'landing';
    if (id === screenId) return;
    travel(String(id), false);
  });

  const hintEl = () => nav.querySelector<HTMLElement>('[data-nav-hint]');
  let hintGen = 0;

  const pulseHint = () => {
    const hint = hintEl();
    if (!hint || reduce || hint.hidden) return;
    const pulseMs = 2200;
    const hintSolid = 0.9;
    const hintFaint = 0.3;
    hint.animate([{ opacity: hintSolid }, { opacity: hintFaint }], {
      duration: pulseMs,
      easing: 'linear',
      direction: 'alternate',
      iterations: Infinity,
    });
  };

  const fadeHint = (show: boolean) => {
    const hint = hintEl();
    if (!hint) return;
    const gen = ++hintGen;
    const wasHidden = hint.hidden;
    const from = show && wasHidden ? 0 : Number(getComputedStyle(hint).opacity);
    hint.getAnimations().forEach((anim) => anim.cancel());
    if (reduce) {
      hint.hidden = !show;
      hint.style.opacity = '';
      if (show) pulseHint();
      return;
    }
    if (show) hint.hidden = false;
    const anim = hint.animate([{ opacity: Number.isFinite(from) ? from : 1 }, { opacity: show ? 1 : 0 }], {
      duration: moveMs(),
      easing: cssEase('--ease-out'),
      fill: 'forwards',
    });
    anim.finished.finally(() => {
      if (gen !== hintGen) return;
      anim.cancel();
      hint.style.opacity = '';
      if (show) pulseHint();
      else hint.hidden = true;
    }).catch(() => {});
  };

  const revealIntro = () => {
    const introFadeMs = 1400;
    const ease = cssEase('--ease-out');
    const targets = [...nav.querySelectorAll<HTMLElement>('.arrow-copy, .arrow-pill, .arrow-back, .arrow-hint')].filter((el) => !el.hidden);
    const hint = nav.querySelector('.arrow-hint');
    targets.forEach((el) => {
      const anim = el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: introFadeMs, easing: ease, fill: 'both' });
      anim.finished.finally(() => {
        anim.cancel();
        if (el === hint) pulseHint();
      }).catch(() => {});
    });
    nav.classList.add('is-controls');
    introOn = false;
  };

  function endIntro() {
    introPlaying = false;
    introDebug.end();
    // Whatever happened to the GPU canvas, the resting face is the plain SVG.
    const dead = faceGL;
    faceGL = null;
    try {
      dead?.destroy();
    } catch {}
    nav.classList.remove('is-face-gl', 'is-face-svg');
    const scaleEl = nav.querySelector<HTMLElement>('[data-nav-scale]');
    const blob = nav.querySelector<HTMLElement>('.arrow-face-blob');
    scaleEl?.getAnimations().forEach((anim) => anim.cancel());
    // Leave the intro from the size the face is drawn at now. Under the GPU
    // face on a phone the SVG blob sat hidden at the intro size, and without
    // this it eased down from there once it showed: the face pulsed up and
    // back down just after the intro. Pin both to the drawn size, drop
    // is-intro, then let go, so the face only moves if it was not yet at rest.
    const parts = [scaleEl, blob].filter((el): el is HTMLElement => !!el);
    const drawn = scaleEl ? getComputedStyle(scaleEl) : null;
    if (scaleEl && drawn) {
      const { width, height, transform } = drawn;
      parts.forEach((el) => {
        el.style.transition = 'none';
        el.style.width = width;
        el.style.height = height;
      });
      scaleEl.style.transform = transform;
    }
    settleFace();
    nav.classList.remove('is-intro');
    parts.forEach((el) => el.getBoundingClientRect());
    parts.forEach((el) => {
      el.style.transition = '';
      el.style.width = '';
      el.style.height = '';
    });
    if (scaleEl) scaleEl.style.transform = '';
  }

  const settleFace = () => {
    nav.querySelector('.arrow-face-blob g')?.removeAttribute('filter');
  };

  const runIntro = () => {
    const scaleEl = nav.querySelector<HTMLElement>('[data-nav-scale]')!;
    const disp = nav.querySelector<SVGFEDisplacementMapElement>('feDisplacementMap');
    const blur = nav.querySelector<SVGFEGaussianBlurElement>('feGaussianBlur');
    if (reduce) {
      settleFace();
      nav.classList.remove('is-intro');
      introOn = false;
      pulseHint();
      return;
    }
    let revealed = false;
    // A CSS scale of the small filtered face paints a soft bitmap and drops
    // the displacement. The face is laid out at the size it is drawn, on
    // every viewport, and the stretch follows the screen on a phone.
    const phone = matchMedia('(max-width: 759px)').matches;
    const face = parseFloat(getComputedStyle(nav).getPropertyValue('--arrow-face')) || (phone ? 48 : 64);
    const stretchFrom = phone ? nav.clientWidth / Math.max(1, nav.clientHeight) : INTRO_STRETCH;
    const blob = nav.querySelector<HTMLElement>('.arrow-face-blob');
    scaleEl.style.transform = 'none';
    let started = performance.now();
    // The first frames after load are slow on a phone: fonts, the first GPU
    // draw and its compositing layer all land there. The intro holds its first
    // frame until two frames in a row arrive on time (or HOLD_MAX_MS), then the
    // clock starts, so a late frame never lands while the face is moving.
    let holding = true;
    let holdFrom = 0;
    let lastTick = 0;
    let calm = 0;
    const frame = (now: number, sync = false) => {
      if (!introPlaying) return;
      const workFrom = introDebugOn ? performance.now() : 0;
      if (holding) {
        if (!sync) {
          if (!holdFrom) holdFrom = now;
          if (lastTick) introDebug.held(now - lastTick);
          calm = lastTick && now - lastTick < HOLD_CALM_MS ? calm + 1 : 0;
          lastTick = now;
          if (calm >= 2 || now - holdFrom >= HOLD_MAX_MS) {
            holding = false;
            introDebug.start(now);
          }
        }
        started = now;
      }
      const t = Math.min(1, (now - started) / INTRO_MS);
      const eased = easeInOut(t);
      const zoom = INTRO_ZOOM + (1 - INTRO_ZOOM) * eased;
      const stretch = stretchFrom + (1 - stretchFrom) * eased;
      const dispNow = Math.round(DISP_FROM + (DISP_REST - DISP_FROM) * eased);
      const soft = BLUR_FROM + (BLUR_REST - BLUR_FROM) * eased;
      const w = Math.max(1, Math.round(face * zoom * stretch));
      const h = Math.max(1, Math.round(face * zoom));
      scaleEl.style.width = `${w}px`;
      scaleEl.style.height = `${h}px`;
      if (faceGL) {
        try {
          faceGL.draw({ w, h, disp: dispNow, blur: soft });
        } catch (error) {
          dropFaceGL(`draw: ${(error as Error)?.message || error}`);
        }
      }
      if (!faceGL && blob) {
        blob.style.width = `${w}px`;
        blob.style.height = `${h}px`;
      }
      if (!faceGL) {
        disp?.setAttribute('scale', String(dispNow));
        blur?.setAttribute('stdDeviation', soft.toFixed(2));
      }
      if (!revealed && now - started >= INTRO_REVEAL_MS) {
        revealed = true;
        revealIntro();
      }
      if (introDebugOn) introDebug.frame(now, performance.now() - workFrom);
      if (t < 1) requestAnimationFrame(frame);
      else {
        endIntro();
        if (!revealed) revealIntro();
        const hash = location.hash.replace('#', '');
        if (hash && nodes.has(hash)) travel(hash, false);
      }
    };
    // The GPU dropped the canvas (or a draw threw) mid-intro: finish on the
    // SVG filter. After the intro, endIntro has already shown the plain face.
    const dropFaceGL = (reason: string) => {
      if (!faceGL) return;
      const dead = faceGL;
      faceGL = null;
      try {
        dead.destroy();
      } catch {}
      nav.classList.remove('is-face-gl');
      if (!introPlaying) return;
      nav.classList.add('is-face-svg');
      const filterId = nav.querySelector('.arrow-face-blob filter')?.id;
      if (filterId) nav.querySelector('.arrow-face-blob g')?.setAttribute('filter', `url(#${filterId})`);
      introDebug.path('svg', reason);
    };
    const run = () => {
      introDebug.hold(performance.now());
      frame(performance.now(), true);
    };
    // The SVG filter would be re-rasterised every frame over a region several
    // screens tall. The GPU face draws the same filter from numbers. Noise is
    // built in short slices so the landing long task can yield, then the first
    // frame is drawn and the SVG face stays hidden until then. Only when
    // WebGL cannot run does the SVG filter come back, and ?introdebug says why.
    void (async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const svgFace = nav.querySelector<SVGSVGElement>('.arrow-face-blob');
      const slot = scaleEl.closest<HTMLElement>('.arrow-slot');
      let mount: FaceMount;
      if (!svgFace || !slot) mount = { gl: null, reason: 'no-face' };
      else {
        const maxW = Math.max(1, Math.round(face * INTRO_ZOOM * stretchFrom));
        const maxH = Math.max(1, Math.round(face * INTRO_ZOOM));
        try {
          mount = await mountFaceGL(svgFace, slot, maxW, maxH, DISP_FROM, BLUR_FROM);
        } catch (error) {
          mount = { gl: null, reason: `error: ${(error as Error)?.message || error}` };
        }
      }
      if (!introPlaying) {
        mount.gl?.destroy();
        return;
      }
      if (mount.gl) {
        faceGL = mount.gl;
        faceGL.canvas.addEventListener('webglcontextlost', () => dropFaceGL('context-lost'));
        nav.classList.add('is-face-gl');
        settleFace();
        introDebug.path('gl', '', mount.gl.setupMs, mount.gl.renderer);
      } else {
        nav.classList.add('is-face-svg');
        introDebug.path('svg', mount.reason);
      }
      run();
    })();
  };

  const hash = location.hash.replace('#', '');
  const opened = hash && nodes.has(hash) && !nodes.get(hash)?.href ? hash : 'landing';
  history.replaceState(
    { arrow: opened },
    '',
    opened === 'landing' ? location.pathname + location.search : `${location.pathname}${location.search}#${opened}`,
  );
  // Back from a route page: open on its screen, which looks like the page
  // just left, then fly the controls home with travel().
  const routed = takeRoute();
  const returning = routed && opened !== 'landing' && nodes.get(routed)?.href && nodes.get(routed)?.parent === opened && isTraverse() ? routed : null;
  screenId = returning ?? opened;
  if (screenId !== 'landing') applyCopy(screenId);
  paintChrome(screenId);
  warmRoutes(screenId);
  if (opened !== 'landing' && nodes.get(opened)?.kind === 'gallery') showSlide(0, false);
  placeCopy();
  placeCaption();
  placeGalleryArrows();
  const relayout = () => {
    const current = screen()?.kind === 'gallery' ? screen()?.slides[slide] : null;
    if (current && !full) fitGallery(current, false);
    placeCopy();
    placeCaption();
    placeGalleryArrows();
    fitProjectLink();
  };

  bindAppViewport(() => {
    if (nav.dataset.screen !== 'about' && (scrollX || scrollY)) window.scrollTo(0, 0);
    relayout();
  });
  window.addEventListener('resize', relayout);
  if (opened === 'landing') runIntro();
  else {
    introPlaying = false;
    introOn = false;
    // Opened on a screen: the face starts at its resting size rather than
    // easing down from the intro size.
    const still = [...nav.querySelectorAll<HTMLElement>('.arrow-face-scale, .arrow-face-blob')];
    still.forEach((el) => (el.style.transition = 'none'));
    nav.classList.remove('is-intro');
    still.forEach((el) => el.getBoundingClientRect());
    requestAnimationFrame(() => still.forEach((el) => (el.style.transition = '')));
    nav.classList.add('is-controls');
    settleFace();
    const hint = nav.querySelector<HTMLElement>('[data-nav-hint]');
    if (hint) hint.hidden = true;
  }
  const flyHome = (to: string) => {
    requestAnimationFrame(() => requestAnimationFrame(() => travel(to, false)));
  };
  if (returning) flyHome(opened);
  // Back from a route page out of the back/forward cache: the page is still
  // on the route screen it left from.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    takeRoute();
    const node = screen();
    if (!node?.href) return;
    const state = history.state && history.state.arrow;
    flyHome(typeof state === 'string' && nodes.has(state) && !nodes.get(state)?.href ? state : node.parent);
  });
  document.fonts?.ready.then(() => fitProjectLink());
}
