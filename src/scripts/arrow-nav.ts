import { isTypingTarget, prefersReducedMotion } from '../lib/browser';
import { initHeroBlob } from './hero-blob';
import { mountFaceGlance, type FaceGlance } from './face-glance';
import { introDebug, introDebugOn } from './intro-debug';
import { playSnick } from './ui-sound';
import { bindAppViewport, syncAppViewport } from '../lib/viewport-layout';
import { isTraverse, leaveForRoute, routeAfterSnick, takeRoute } from './arrow-route';
import type { ArrowDir, ArrowTree } from '../lib/arrow-nav';

type Dir = ArrowDir | 'up';

// Landing intro, from the Jitter export (60fps frames in comments).
// 0f holds the big face, 19.2f starts the shrink, 124.74f is the hand-off
// frame, 202.2f is where everything has landed. 243.6f is the scene end.
const INTRO_MS = 3370; // 202.2f
const INTRO_HOLD_MS = 320; // 19.2f
const INTRO_EYE_CLOSE_MS = 1199; // 71.94f
const INTRO_MID_MS = 2079; // 124.74f
const INTRO_COPY_MS = 2314; // 138.84f
const INTRO_FACE_FROM = 150 / 38.1; // 3.937
const INTRO_FACE_MID = 140.68 / 38.1; // 3.692
const INTRO_PILL_SHIFT = 100;
const INTRO_COPY_SHIFT = 50;
const INTRO_EYE_SQUINT = 30 / 119; // wide slit / tall eye, from the export
const INTRO_FEATURE_SCALE = 1.1; // features are 10% larger until the final shrink
const SLIDE_MS = 4200;

const easeFaceIn = bezier(0.432, 0, 0.756, 0.4);
const easeFaceOut = bezier(0.34, 0, 0, 1);
const EASE_PILL = 'cubic-bezier(0.34, 0, 0, 1)';
const EASE_INTRO_FADE = 'cubic-bezier(0, 0, 0, 1)';
const EASE_INTRO_LINE = 'cubic-bezier(0, 0, 0, 1)'; // same curve as the fade
const EASE_EYE_OPEN = 'cubic-bezier(0.42, 0, 0, 0.999)';
const EASE_EYE_CLOSE = 'cubic-bezier(0.42, 0, 0, 1)';
const EASE_EYE_FINAL = 'cubic-bezier(0.34, 0, 0, 1)';

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
  const reduce = prefersReducedMotion();
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
  const introAnims: Animation[] = [];
  let controlsTimer = 0;
  const faceGlance: FaceGlance = mountFaceGlance(nav);
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
  let scrubLock = false;

  initHeroBlob(nav);

  const screen = () => (screenId === 'landing' ? null : nodes.get(screenId) ?? null);

  const flightHomes = new WeakMap<HTMLElement, { parent: Node; next: ChildNode | null }>();
  const flights = () => {
    const seen = new Set<HTMLElement>();
    const out: HTMLElement[] = [];
    for (const el of [
      ...nav.querySelectorAll<HTMLElement>('[data-nav-flight]'),
      ...document.querySelectorAll<HTMLElement>('.arrow-clip-plane [data-nav-flight]'),
    ]) {
      if (seen.has(el)) continue;
      seen.add(el);
      out.push(el);
    }
    return out;
  };
  const restoreFlightHome = (el: HTMLElement) => {
    el.getAnimations().forEach((anim) => anim.cancel());
    clearPin(el);
    el.style.opacity = '';
    el.style.zIndex = '';
    el.style.willChange = '';
    el.style.clipPath = '';
    const home = flightHomes.get(el);
    if (home?.parent.isConnected) home.parent.insertBefore(el, home.next);
    flightHomes.delete(el);
  };

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

  const syncGlance = () => {
    const face = nav.querySelector<HTMLElement>('[data-nav-face]');
    const faceOut = !face || face.hidden;
    faceGlance.setEnabled(!faceOut && !introPlaying && !nav.classList.contains('is-intro'));
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
    syncGlance();
  };

  const warmImages = new Map<string, HTMLImageElement>();
  const warmVideos = new Map<string, HTMLVideoElement>();
  let warmIdle = 0;
  let warmGen = 0;

  type WarmItem = { src: string; mobile?: string; poster: string; blur?: string; kind: string; href?: string };

  const warmUrl = (src: string | undefined, priority: 'high' | 'low' | 'auto') => {
    if (!src || warmImages.has(src)) return;
    const img = new Image();
    img.decoding = 'async';
    img.fetchPriority = priority;
    img.src = src;
    img.decode().catch(() => {});
    warmImages.set(src, img);
  };

  const warmSlide = (item: WarmItem | undefined, priority: 'high' | 'low' | 'auto') => {
    if (!item?.src) return;
    if (item.blur) warmUrl(item.blur, priority === 'low' ? 'low' : 'auto');
    if (item.mobile && phone()) warmUrl(item.mobile, priority);
    if (item.kind === 'video') {
      if (item.poster) warmUrl(item.poster, priority);
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
    warmUrl(item.src, priority);
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

  const warmRoutes = (id: string) => {
    tree.nodes.forEach((node) => {
      if (node.parent !== id) return;
      if (node.href && !warmedPages.has(node.href)) {
        warmedPages.add(node.href);
        const link = document.createElement('link');
        link.rel = 'prefetch';
        link.href = node.href;
        document.head.append(link);
      }
      if (node.kind === 'gallery' && node.slides[0]) {
        warmSlide(node.slides[0], 'high');
        warmDestination(node.slides[0].href);
      }
    });
  };

  const cancelWarmIdle = () => {
    warmGen += 1;
    if (!warmIdle) return;
    if (typeof cancelIdleCallback === 'function') cancelIdleCallback(warmIdle);
    else clearTimeout(warmIdle);
    warmIdle = 0;
  };

  const scheduleWarmIdle = (fn: () => void) => {
    if (typeof requestIdleCallback === 'function') {
      warmIdle = requestIdleCallback(fn, { timeout: 1500 });
    } else {
      warmIdle = window.setTimeout(fn, 120) as unknown as number;
    }
  };

  const warmGallery = (slides: WarmItem[], index: number) => {
    cancelWarmIdle();
    const count = slides.length;
    if (!count) return;
    const near = new Set<number>();
    const mark = (i: number, priority: 'high' | 'low' | 'auto') => {
      const at = (i + count) % count;
      near.add(at);
      warmSlide(slides[at], priority);
      warmDestination(slides[at]?.href);
    };
    mark(index, 'high');
    if (count < 2) return;
    mark(index + 1, 'high');
    mark(index - 1, 'auto');
    if (count > 3) {
      mark(index + 2, 'auto');
      mark(index - 2, 'low');
    }
    const rest = slides.map((_, i) => i).filter((i) => !near.has(i));
    if (!rest.length) return;
    const gen = warmGen;
    let cursor = 0;
    const step = () => {
      if (gen !== warmGen) return;
      warmIdle = 0;
      const at = rest[cursor++];
      if (at == null) return;
      warmSlide(slides[at], 'low');
      if (cursor < rest.length) scheduleWarmIdle(step);
    };
    scheduleWarmIdle(step);
  };

  const galleryMedia = () => nav.querySelector<HTMLElement>('.arrow-gallery-media')!;

  const paintBlur = (blur: string | undefined) => {
    const frame = galleryMedia();
    if (blur) frame.style.setProperty('--gallery-lqip', `url('${blur}')`);
    else frame.style.removeProperty('--gallery-lqip');
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

  const projectPillMax = () => {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;width:calc(100vw - 2 * var(--margin));height:0';
    document.body.append(probe);
    const max = Math.max(1, Math.round(probe.getBoundingClientRect().width));
    probe.remove();
    return max;
  };

  const fitProjectLink = () => {
    const link = nav.querySelector<HTMLAnchorElement>('[data-nav-project]');
    const title = nav.querySelector<HTMLElement>('[data-nav-project-title]');
    const action = nav.querySelector<HTMLElement>('[data-nav-project-action]');
    if (!link || !title || !action || link.hidden) return;
    const item = screen()?.slides[slide];
    const full = item?.action || '';
    const short = full === 'View project' ? 'View' : full;
    const compact = phone() && full === 'Learn more' ? '+' : full;
    const max = projectPillMax();
    if (!full) {
      action.textContent = '';
      return;
    }
    const measure = (label: string) => {
      action.textContent = label;
      link.style.width = 'max-content';
      link.style.maxWidth = 'none';
      title.style.minWidth = 'max-content';
      title.style.overflow = 'visible';
      title.style.textOverflow = 'clip';
      const value = Math.ceil(link.getBoundingClientRect().width);
      link.style.width = '';
      link.style.maxWidth = '';
      title.style.minWidth = '';
      title.style.overflow = '';
      title.style.textOverflow = '';
      return value;
    };
    if (measure(compact) <= max && (compact === full || phone())) {
      action.textContent = compact;
      return;
    }
    action.textContent = short;
  };

  const clearGalleryMedia = () => {
    mediaGen += 1;
    cancelWarmIdle();
    paintBlur('');
    const photo = nav.querySelector<HTMLImageElement>('[data-nav-photo]')!;
    const clip = nav.querySelector<HTMLVideoElement>('[data-nav-video]')!;
    photo.getAnimations().forEach((anim) => anim.cancel());
    photo.removeAttribute('src');
    photo.alt = '';
    nav.querySelector<HTMLSourceElement>('[data-nav-source]')?.removeAttribute('srcset');
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
    const source = nav.querySelector<HTMLSourceElement>('[data-nav-source]');
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
    if (source) {
      if (item.kind === 'image' && item.mobile) source.srcset = item.mobile;
      else source.removeAttribute('srcset');
    }
    const cutout = !!item.alpha;
    photo.classList.toggle('is-alpha', cutout);
    gallery.classList.toggle('is-alpha', cutout);
    paintBlur(item.blur);
    photo.getAnimations().forEach((anim) => anim.cancel());
    const gen = ++mediaGen;
    const stillCurrent = () => gen === mediaGen && screen()?.slides[slide] === item;
    if (item.kind === 'video') {
      photo.removeAttribute('src');
      photo.alt = '';
      photo.style.opacity = '0';
      photo.hidden = true;
      const sameClip = clip.getAttribute('src') === item.src;
      const ready = sameClip && clip.readyState >= 2;
      const hold = !!(item.poster || item.blur);
      clip.hidden = false;
      clip.style.opacity = ready || hold ? '' : '0';
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
  let flightLock = false;
  const fitGallery = (item: { width: number; height: number }, morph: boolean) => {
    if (full || scrubLock) return;
    if (flightLock && morph) return;
    const gallery = galleryEl();
    const box = frameFor(item.width, item.height);
    const jump = !morph || reduce || full || flightLock;
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
        if (nav.dataset.kind !== 'gallery' || full || flightLock) return;
        placeGalleryArrows();
        placeCaption();
        if (performance.now() - start < moveMs() + 50) frameWatch = requestAnimationFrame(tick);
      };
      frameWatch = requestAnimationFrame(tick);
    }
  };

  const placeGalleryArrows = (
    frame: { left: number; top: number; right: number; bottom: number; width: number; height: number } | null = null,
    force = false,
  ) => {
    const left = nav.querySelector<HTMLElement>('[data-dir="left"]')!;
    const right = nav.querySelector<HTMLElement>('[data-dir="right"]')!;
    const back = nav.querySelector<HTMLElement>('[data-dir="up"]')!;
    if (nav.dataset.kind !== 'gallery') {
      clearPin(left);
      clearPin(right);
      clearPin(back);
      return;
    }
    if (flightLock && !force) return;
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
    // On a phone the arrows sit in the caption row with the product pill. Centre
    // on the pill itself: the caption box also holds the pill's top margin.
    const caption = nav.querySelector<HTMLElement>('[data-nav-caption]');
    const pill = caption?.querySelector<HTMLElement>('[data-nav-project]:not([hidden]), [data-nav-buy]:not([hidden])');
    const row = pill ?? (caption && !caption.hidden ? caption : null);
    const rowMid = row ? row.getBoundingClientRect() : null;
    const y = edges
      ? Math.round(
          (phone() && rowMid && rowMid.height > 0 ? rowMid.top + rowMid.height / 2 : view.top + view.height / 2) - size / 2,
        )
      : Math.round(box.top + box.height / 2 - size / 2);
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

  const resetCover = () => {
    nav.classList.remove('is-full', 'is-cover', 'is-zoom');
    const gallery = galleryEl();
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

  const dropFull = (keepChrome = false) => {
    full = false;
    fullGen += 1;
    const gallery = galleryEl();
    gallery.getAnimations().forEach((anim) => anim.cancel());
    if (keepChrome) {
      // Keep the cover geometry on the gallery so it shrinks out of the full
      // bleed, but hand the controls back to their landing look straight away.
      nav.classList.remove('is-full', 'is-zoom');
      gallery.style.clipPath = '';
      gallery.style.transition = '';
      return;
    }
    resetCover();
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
    if (full) {
      caption.style.top = '';
      return;
    }
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

let galleryMaskOpen: boolean | null = null;

  const clearGalleryMask = (gallery: HTMLElement) => {
    gallery.style.transition = 'none';
    gallery.style.opacity = '';
    gallery.style.clipPath = '';
    gallery.getBoundingClientRect();
    gallery.style.transition = '';
  };

  const dropFlights = () => {
    nav.querySelectorAll('.arrow-flight').forEach((el) => el.remove());
    document.querySelectorAll('.arrow-copy-ghost').forEach((el) => el.remove());
    flights().forEach((el) => restoreFlightHome(el));
    nav.querySelectorAll('.arrow-clip-plane').forEach((el) => el.remove());
    galleryEl().getAnimations().forEach((anim) => anim.cancel());
    clearGalleryMask(galleryEl());
    galleryMaskOpen = null;
  };

  const growGallery = (
    open: boolean,
    fromT: number | null,
    locked?: { width: number; height: number } | null,
    fromFull = false,
  ) => {
    const gallery = galleryEl();
    const genAt = generation;
    gallery.hidden = false;
    clearGalleryMask(gallery);
    const faceScale = faceEl().querySelector<HTMLElement>('.arrow-face-scale');
    const faceVar = parseFloat(getComputedStyle(nav).getPropertyValue('--arrow-face'));
    const faceW = Math.round(
      faceScale?.getBoundingClientRect().width ||
        faceEl().getBoundingClientRect().width ||
        (Number.isFinite(faceVar) ? faceVar : 0) ||
        controlSize(),
    );
    const gw = Math.max(1, Math.round(locked?.width || gallery.offsetWidth || 1));
    const gh = Math.max(1, Math.round(locked?.height || gallery.offsetHeight || 1));
    gallery.style.width = `${gw}px`;
    gallery.style.height = `${gh}px`;
    gallery.style.aspectRatio = 'auto';
    const insetX = Math.max(0, (gw - faceW) / 2);
    const insetY = Math.max(0, (gh - faceW) / 2);
    const faceR = faceW / 2;
    const fullR =
      fromFull && !open
        ? 0
        : parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--gallery-radius')) || 48;
    const maskAt = (t: number) => {
      const u = Math.min(1, Math.max(0, t));
      const x = Math.round(insetX * (1 - u));
      const y = Math.round(insetY * (1 - u));
      const r = Math.round(faceR + (fullR - faceR) * u);
      return `inset(${y}px ${x}px ${y}px ${x}px round ${r}px)`;
    };
    const start = fromT == null ? (open ? 0 : 1) : Math.min(1, Math.max(0, fromT));
    const end = open ? 1 : 0;
    galleryMaskOpen = open;
    const anim = gallery.animate(
      [
        { clipPath: maskAt(start), opacity: 1 },
        { clipPath: maskAt(end), opacity: open ? 1 : 0 },
      ],
      {
        duration: moveMs(),
        easing: cssEase('--ease-nav'),
        fill: 'both',
      },
    );
    anim.finished.finally(() => {
      if (genAt !== generation) return;
      if (!open && nav.dataset.kind !== 'gallery') gallery.hidden = true;
      anim.cancel();
      clearGalleryMask(gallery);
      if (!open) {
        gallery.style.width = '';
        gallery.style.height = '';
        gallery.style.aspectRatio = '';
        if (fromFull) resetCover();
      }
      galleryMaskOpen = null;
      if (open) gallery.hidden = false;
    });
  };

  let holdTimer = 0;
  let flipping = false;
  let holdPointer = 0;
  let holdTarget: HTMLElement | null = null;
  const SCROLL_SLIDE_PX = 80;
  const SCROLL_IDLE_MS = 480;
  const SCROLL_MAX_STEPS = 8;
  let scrollCarry = 0;
  let scrollIdle = 0;
  let scrubbing = false;
  let scrubPointer = 0;

  const canFlip = (dir: Dir) => screen()?.kind === 'gallery' && (dir === 'left' || dir === 'right');

  const clearScrollFlip = (resume: boolean) => {
    scrollCarry = 0;
    if (scrollIdle) window.clearTimeout(scrollIdle);
    scrollIdle = 0;
    if (resume) startAutoplay();
  };

  const scrubEl = () => nav.querySelector<HTMLElement>('[data-nav-scrub]');
  const dotsEl = () => nav.querySelector<HTMLElement>('[data-nav-dots]')!;
  let scrubTrackCount = 0;

  const scrubProgress = (clientX: number) => {
    const node = screen();
    const count = node?.slides.length ?? 0;
    if (!node || node.kind !== 'gallery' || count < 2) return { count: 0, t: 0, index: slide, indexF: slide };
    const box = dotsEl().getBoundingClientRect();
    if (box.width <= 0) return { count, t: 0, index: slide, indexF: slide };
    const t = Math.min(1, Math.max(0, (clientX - box.left) / box.width));
    const indexF = t * (count - 1);
    const index = Math.min(count - 1, Math.max(0, Math.round(indexF)));
    return { count, t, index, indexF };
  };

  const ensureScrubTrack = (count: number) => {
    const track = scrubEl()?.querySelector<HTMLElement>('[data-nav-scrub-track]');
    if (!track) return null;
    if (scrubTrackCount === count && track.childElementCount === count) return track;
    scrubTrackCount = count;
    track.replaceChildren(
      ...Array.from({ length: count }, (_, i) => {
        const el = document.createElement('span');
        el.className = 'arrow-scrub-num';
        el.textContent = String(i + 1);
        return el;
      }),
    );
    return track;
  };

  const markHoverDot = (index: number) => {
    Array.from(dotsEl().children).forEach((el, i) => {
      el.classList.toggle('is-hover', i === index && !el.classList.contains('is-on'));
    });
  };

  const paintScrubHud = (
    clientX: number,
    progress: { count: number; index: number; indexF: number } = scrubProgress(clientX),
  ) => {
    const hud = scrubEl();
    if (!hud) return;
    const { count, index, indexF } = progress;
    if (count < 2) return;
    const track = ensureScrubTrack(count);
    if (!track) return;
    const gallery = galleryEl().getBoundingClientRect();
    const hudW = hud.offsetWidth || 120;
    const localX = Math.min(gallery.width - hudW / 2, Math.max(hudW / 2, clientX - gallery.left));
    hud.style.left = `${Math.round(localX)}px`;
    const slot =
      track.firstElementChild instanceof HTMLElement
        ? track.firstElementChild.offsetWidth
        : 40;
    const windowEl = hud.querySelector<HTMLElement>('.arrow-scrub-window');
    const winW = windowEl?.clientWidth || slot * 3;
    const tx = Math.round(winW / 2 - (indexF * slot + slot / 2));
    track.style.transform = `translate3d(${tx}px, 0, 0)`;
    track.querySelectorAll<HTMLElement>('.arrow-scrub-num').forEach((el, i) => {
      el.classList.toggle('is-on', i === index);
    });
  };

  const indexFromScrubX = (clientX: number) => scrubProgress(clientX).index;

  const resetScrubHud = () => {
    const hud = scrubEl();
    if (!hud) return;
    hud.hidden = true;
    hud.style.left = '';
    const track = hud.querySelector<HTMLElement>('[data-nav-scrub-track]');
    if (track) track.style.transform = '';
    markHoverDot(-1);
  };

  const endScrub = (resume: boolean) => {
    if (!scrubbing) return;
    scrubbing = false;
    scrubPointer = 0;
    scrubLock = false;
    nav.classList.remove('is-scrubbing');
    resetScrubHud();
    const item = screen()?.slides[slide];
    if (item && !full) {
      fitGallery(item, true);
      placeGalleryArrows();
      placeCaption();
    }
    if (resume) startAutoplay();
  };

  const scrubTo = (clientX: number) => {
    paintScrubHud(clientX);
    const next = indexFromScrubX(clientX);
    if (next === slide) return;
    showSlide(next);
    playSnick();
  };

  const hoverFine = () => matchMedia('(hover: hover) and (pointer: fine)').matches;
  let hoveringDots = false;

  const hoverProgress = (clientX: number) => {
    const centres = Array.from(dotsEl().children).map((el) => {
      const box = (el as HTMLElement).getBoundingClientRect();
      return box.left + box.width / 2;
    });
    const count = centres.length;
    if (count < 2) return { count, index: slide, indexF: slide };
    if (clientX <= centres[0]) return { count, index: 0, indexF: 0 };
    if (clientX >= centres[count - 1]) return { count, index: count - 1, indexF: count - 1 };
    let i = 0;
    while (i < count - 2 && clientX > centres[i + 1]) i += 1;
    const span = centres[i + 1] - centres[i];
    const indexF = span > 0 ? i + (clientX - centres[i]) / span : i;
    return { count, index: Math.min(count - 1, Math.round(indexF)), indexF };
  };

  const openHoverHud = (clientX: number) => {
    const node = screen();
    const hud = scrubEl();
    if (!hud || !node || node.kind !== 'gallery' || node.slides.length < 2) return;
    hud.hidden = false;
    const progress = hoverProgress(clientX);
    paintScrubHud(clientX, progress);
    markHoverDot(progress.index);
  };

  const closeHoverHud = (resume: boolean) => {
    if (!hoveringDots) return;
    hoveringDots = false;
    if (!scrubbing) resetScrubHud();
    if (resume) startAutoplay();
  };

  const releasePointer = () => {
    if (holdTarget && holdPointer) {
      try {
        holdTarget.releasePointerCapture(holdPointer);
      } catch {
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
    endScrub(false);
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
    const wasGallery = nav.dataset.kind === 'gallery';
    const closeBox = wasGallery ? { width: galleryEl().offsetWidth, height: galleryEl().offsetHeight } : null;
    const closingFull = full && !reduce && wasGallery;
    if (full) dropFull(closingFull);
    const gen = ++generation;
    clearScrollFlip(false);
    stopHold(false);
    endScrub(false);
    closeHoverHud(false);
    stopAutoplay();
    const ease = cssEase('--ease-nav');
    const slot = nav.querySelector<HTMLElement>('.arrow-slot')!;
    const slotBefore = slot.getBoundingClientRect();
    let fromMask: number | null = null;
    const maskAnim = galleryEl().getAnimations()[0];
    if (maskAnim && galleryMaskOpen != null) {
      const progress = maskAnim.effect?.getComputedTiming().progress;
      if (progress != null && Number.isFinite(progress)) {
        fromMask = galleryMaskOpen ? progress : 1 - progress;
      }
    }
    const oldState = new Map<string, { rect: DOMRect; label: string; mode: string; clone: HTMLElement; opacity: number }>();
    flights()
      .filter((el) => !el.hidden)
      .forEach((el) => {
        const clone = el.cloneNode(true) as HTMLElement;
        const shape = getComputedStyle(el);
        const opacity = Number(shape.opacity);
        clone.classList.add('arrow-flight');
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
    const nowGallery = nav.dataset.kind === 'gallery';
    if (!nowGallery && !closingFull) resetCover();
    if (nowGallery && screen()?.full) {
      full = true;
      nav.classList.add('is-full', 'is-cover');
    }
    let pendingGallerySlide = false;
    if (!reduce) flightLock = true;
    if (nowGallery) {
      if (enteringGallery) {
        clearGalleryMedia();
        galleryEl().hidden = false;
        galleryEl().style.opacity = '1';
        if (!reduce) faceEl().hidden = false;
        showSlide(0, false);
      } else if (wasGallery) {
        pendingGallerySlide = true;
      } else {
        clearGalleryMedia();
        showSlide(0, false);
      }
    }
    placeCopy();
    placeCaption();
    placeGalleryArrows(null, true);
    if (!reduce && nowGallery !== wasGallery) {
      growGallery(nowGallery, fromMask, nowGallery ? null : closeBox, !nowGallery && closingFull);
    }

    const route = nodes.get(id)?.href;
    const landed = () => {
      if (gen !== generation || !route) return;
      leaveForRoute(id, route);
    };
    if (route) push = false;

    if (reduce) {
      flightLock = false;
      if (pendingGallerySlide) {
        clearGalleryMedia();
        showSlide(0, false);
      }
      flights().forEach((el) => restoreFlightHome(el));
      placeGalleryArrows();
      startAutoplay();
      if (push) history.pushState({ arrow: id }, '', id === 'landing' ? location.pathname + location.search : `#${id}`);
      landed();
      return;
    }

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
    const far = Math.max(window.innerWidth, window.innerHeight) * 2;
    const planes = new Map<string, HTMLElement>();
    const planeFor = (dir: string) => {
      let plane = planes.get(dir);
      if (plane) return plane;
      plane = document.createElement('div');
      plane.className = 'arrow-clip-plane';
      plane.setAttribute('aria-hidden', 'true');
      plane.style.position = 'absolute';
      plane.style.overflow = 'hidden';
      plane.style.pointerEvents = 'none';
      plane.style.zIndex = '6';
      plane.style.margin = '0';
      if (dir === 'right') {
        plane.style.left = `${Math.round(hub.x - slotNow.left)}px`;
        plane.style.top = `${Math.round(hub.y - far - slotNow.top)}px`;
        plane.style.width = `${Math.round(far)}px`;
        plane.style.height = `${Math.round(far * 2)}px`;
      } else if (dir === 'left') {
        plane.style.left = `${Math.round(hub.x - far - slotNow.left)}px`;
        plane.style.top = `${Math.round(hub.y - far - slotNow.top)}px`;
        plane.style.width = `${Math.round(far)}px`;
        plane.style.height = `${Math.round(far * 2)}px`;
      } else if (dir === 'down') {
        plane.style.left = `${Math.round(hub.x - far - slotNow.left)}px`;
        plane.style.top = `${Math.round(hub.y - slotNow.top)}px`;
        plane.style.width = `${Math.round(far * 2)}px`;
        plane.style.height = `${Math.round(far)}px`;
      } else {
        plane.style.left = `${Math.round(hub.x - far - slotNow.left)}px`;
        plane.style.top = `${Math.round(hub.y - far - slotNow.top)}px`;
        plane.style.width = `${Math.round(far * 2)}px`;
        plane.style.height = `${Math.round(far)}px`;
      }
      slot.append(plane);
      planes.set(dir, plane);
      return plane;
    };
    const pinInPlane = (el: HTMLElement, rect: DOMRect, plane: HTMLElement) => {
      if (el.hasAttribute('data-nav-flight') && !flightHomes.has(el) && el.parentNode) {
        flightHomes.set(el, { parent: el.parentNode, next: el.nextSibling });
      }
      const origin = plane.getBoundingClientRect();
      el.style.position = 'absolute';
      el.style.left = `${Math.round(rect.left - origin.left)}px`;
      el.style.top = `${Math.round(rect.top - origin.top)}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
      el.style.margin = '0';
      el.style.width = `${Math.round(rect.width)}px`;
      el.style.height = `${Math.round(rect.height)}px`;
      el.style.transform = 'none';
      plane.append(el);
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
    const flightDone: Promise<unknown>[] = [];
    if (!reduce) {
      oldState.forEach((prev, dir) => {
        const stay = placed.find((item) => item.el.dataset.dir === dir && (item.same || item.moved));
        if (stay) return;
        const arrival = placed.find((item) => item.el.dataset.dir === dir && !item.same && !item.moved);
        const clone = prev.clone;
        clone.style.opacity = String(prev.opacity);
        clone.style.zIndex = '';
        clone.style.clipPath = '';
        pinInPlane(clone, prev.rect, planeFor(dir));
        const move = departMove(dir, prev, arrival);
        clone.style.willChange = 'transform, opacity';
        const motion = clone.animate(
          [{ transform: 'translate(0px, 0px)' }, { transform: `translate(${move.x}px, ${move.y}px)` }],
          { duration: moveMs(), easing: ease, fill: 'both' },
        );
        clone.animate([{ opacity: prev.opacity }, { opacity: 0 }], {
          duration: Math.round(moveMs() * 0.7),
          easing: ease,
          fill: 'forwards',
        });
        flightDone.push(
          motion.finished
            .finally(() => clone.remove())
            .catch(() => {}),
        );
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
      pinInPlane(el, rect, planeFor(dir));
      el.style.zIndex = dir === 'up' ? '6' : '1';
      el.style.willChange = 'transform, opacity';
      el.style.transform = `translate(${dx}px, ${dy}px)`;
      el.style.opacity = moved ? '1' : '0';
      const anim = el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px)`, opacity: moved ? 1 : 0 },
          { transform: 'translate(0px, 0px)', opacity: 1 },
        ],
        { duration: moveMs(), easing: ease, fill: 'both' },
      );
      const done = anim.finished.finally(() => {
        if (gen !== generation) return;
        if (nav.dataset.kind === 'gallery') {
          anim.cancel();
          el.style.opacity = '';
          el.style.zIndex = '';
          el.style.willChange = '';
          el.style.transform = '';
        } else {
          restoreFlightHome(el);
        }
      });
      flightDone.push(done.catch(() => {}));
      return done.catch(() => {});
    });

    fadeLines(nav);
    Promise.all(flightDone.length ? flightDone : anims).finally(() => {
      if (gen !== generation) return;
      if (nav.dataset.kind === 'gallery') {
        flights().forEach((el) => {
          const home = flightHomes.get(el);
          if (home?.parent.isConnected) home.parent.insertBefore(el, home.next);
          flightHomes.delete(el);
          el.style.willChange = '';
        });
      }
      planes.forEach((plane) => plane.remove());
      flightLock = false;
      if (pendingGallerySlide) {
        clearGalleryMedia();
        showSlide(0, false);
      }
      if (nav.dataset.kind === 'gallery') faceEl().hidden = true;
      placeGalleryArrows();
      if (nav.dataset.kind === 'gallery') {
        const current = screen()?.slides[slide];
        const clip = galleryEl().querySelector('video');
        const sized =
          clip && !clip.hidden && clip.videoWidth
            ? { width: clip.videoWidth, height: clip.videoHeight }
            : current;
        if (sized) fitGallery(sized, true);
      }
      startAutoplay();
      landed();
    });

    if (push) history.pushState({ arrow: id }, '', id === 'landing' ? location.pathname + location.search : `#${id}`);
  };

  const activate = (dir: Dir) => {
    const node = screen();
    const backHref = nav.dataset.backHref;
    if (dir === 'up' && backHref && (full || screenId === start)) {
      routeAfterSnick(backHref);
      return;
    }
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
      if (node?.full) travel(node.parent === 'landing' ? 'landing' : node.parent, true);
      else setFull(false);
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
    if (next.href && !tree.nodes.some((node) => node.parent === next.id)) {
      routeAfterSnick(next.href);
      return;
    }
    travel(next.id, true);
  };

  const onGalleryWheel = (event: WheelEvent) => {
    if (introOn || pressFrom) return;
    if (event.ctrlKey || event.metaKey) return;
    if (isTypingTarget(event.target)) return;
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

  const backKey = (key: string) => key === 'Escape' || key === 'Backspace';

  window.addEventListener('wheel', onGalleryWheel, { passive: false });

  galleryEl().addEventListener('click', (event) => {
    if (introOn || screen()?.kind !== 'gallery') return;
    if (scrubbing) return;
    const target = event.target as Element | null;
    if (target?.closest?.('[data-nav-dots], [data-nav-scrub]')) return;
    if (screen()?.full) return;
    setFull(!full);
  });

  dotsEl().addEventListener('pointerdown', (event) => {
    if (event.button !== 0) return;
    if (introOn || scrubbing || pressFrom) return;
    if (!phone()) return;
    const node = screen();
    if (!node || node.kind !== 'gallery' || node.slides.length < 2) return;
    event.preventDefault();
    event.stopPropagation();
    clearScrollFlip(false);
    stopHold(false);
    stopAutoplay();
    scrubbing = true;
    scrubPointer = event.pointerId;
    scrubLock = true;
    nav.classList.add('is-scrubbing');
    const hud = scrubEl();
    if (hud) hud.hidden = false;
    try {
      dotsEl().setPointerCapture(event.pointerId);
    } catch {
    }
    scrubTo(event.clientX);
  });

  const onScrubMove = (event: PointerEvent) => {
    if (!scrubbing || event.pointerId !== scrubPointer) return;
    event.preventDefault();
    scrubTo(event.clientX);
  };

  const onScrubEnd = (event: PointerEvent) => {
    if (!scrubbing || event.pointerId !== scrubPointer) return;
    try {
      if (dotsEl().hasPointerCapture(event.pointerId)) dotsEl().releasePointerCapture(event.pointerId);
    } catch {
    }
    endScrub(true);
  };

  dotsEl().addEventListener('pointermove', onScrubMove);
  dotsEl().addEventListener('pointerup', onScrubEnd);
  dotsEl().addEventListener('pointercancel', onScrubEnd);
  dotsEl().addEventListener('lostpointercapture', (event) => {
    if (!scrubbing || event.pointerId !== scrubPointer) return;
    endScrub(true);
  });

  dotsEl().addEventListener('pointerenter', (event) => {
    if (event.pointerType !== 'mouse' || scrubbing || phone() || !hoverFine()) return;
    const node = screen();
    if (!node || node.kind !== 'gallery' || node.slides.length < 2) return;
    hoveringDots = true;
    stopAutoplay();
    openHoverHud(event.clientX);
  });

  dotsEl().addEventListener('pointermove', (event) => {
    if (!hoveringDots || scrubbing || event.pointerType !== 'mouse') return;
    openHoverHud(event.clientX);
  });

  dotsEl().addEventListener('pointerleave', () => {
    if (scrubbing) return;
    closeHoverHud(true);
  });

  dotsEl().addEventListener('click', (event) => {
    if (phone() || scrubbing) return;
    const node = screen();
    if (!node || node.kind !== 'gallery' || node.slides.length < 2) return;
    if (!(event.target as Element | null)?.closest?.('[data-nav-dots]')) return;
    const next = hoverProgress(event.clientX).index;
    if (next !== slide) {
      showSlide(next);
      playSnick();
    }
    if (hoveringDots) {
      const count = screen()?.slides.length ?? 0;
      paintScrubHud(event.clientX, { count, index: next, indexF: next });
    }
  });

  window.addEventListener('keydown', (event) => {
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    if (isTypingTarget(event.target)) return;
    if (document.documentElement.classList.contains('is-contact-open')) return;
    if ((event.key === ' ' || event.key === 'Enter') && screen()?.kind === 'gallery') {
      event.preventDefault();
      if (event.repeat || introOn || pressFrom) return;
      if (screen()?.full) return;
      setFull(!full);
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

  const introShift = (dir: string): [number, number] => {
    if (dir === 'up') return [0, -INTRO_PILL_SHIFT];
    if (dir === 'down') return [0, INTRO_PILL_SHIFT];
    if (dir === 'left') return [-INTRO_PILL_SHIFT, 0];
    return [INTRO_PILL_SHIFT, 0];
  };

  const playIntroControls = () => {
    const anims: Animation[] = [];
    const pillMs = INTRO_MS - INTRO_MID_MS;
    const copyMs = INTRO_MS - INTRO_COPY_MS;
    nav.querySelectorAll<HTMLElement>('.arrow-pill:not([hidden]), .arrow-back:not([hidden])').forEach((el) => {
      if (el.getBoundingClientRect().width < 1) return;
      const dir = el.dataset.dir ?? 'up';
      const [dx, dy] = introShift(dir);
      anims.push(
        el.animate([{ translate: `${dx}px ${dy}px` }, { translate: '0px 0px' }], {
          duration: pillMs,
          delay: INTRO_MID_MS,
          easing: EASE_PILL,
          fill: 'both',
        }),
      );
      anims.push(
        el.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: copyMs,
          delay: INTRO_COPY_MS,
          easing: EASE_INTRO_FADE,
          fill: 'both',
        }),
      );
    });
    const copy = nav.querySelector<HTMLElement>('.arrow-copy');
    if (copy && !copy.hidden) {
      anims.push(
        copy.animate([{ translate: `0px -${INTRO_COPY_SHIFT}px` }, { translate: '0px 0px' }], {
          duration: copyMs,
          delay: INTRO_COPY_MS,
          easing: EASE_INTRO_LINE,
          fill: 'both',
        }),
      );
      anims.push(
        copy.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: copyMs,
          delay: INTRO_COPY_MS,
          easing: EASE_INTRO_FADE,
          fill: 'both',
        }),
      );
    }
    const hint = nav.querySelector<HTMLElement>('.arrow-hint');
    if (hint && !hint.hidden && hint.getBoundingClientRect().height > 0) {
      anims.push(
        hint.animate([{ translate: `0px ${INTRO_COPY_SHIFT}px` }, { translate: '0px 0px' }], {
          duration: copyMs,
          delay: INTRO_COPY_MS,
          easing: EASE_INTRO_LINE,
          fill: 'both',
        }),
      );
      anims.push(
        hint.animate([{ opacity: 0 }, { opacity: 1 }], {
          duration: copyMs,
          delay: INTRO_COPY_MS,
          easing: EASE_INTRO_FADE,
          fill: 'both',
        }),
      );
    }
    introAnims.push(...anims);
    controlsTimer = window.setTimeout(() => nav.classList.add('is-controls'), INTRO_MID_MS);
  };

  const playIntroEyes = (ms: number) => {
    const squint = `scaleY(${INTRO_EYE_SQUINT})`;
    const open = 'scaleY(1)';
    const closeAt = Math.round((INTRO_EYE_CLOSE_MS / ms) * 1000) / 1000;
    const midAt = Math.round((INTRO_MID_MS / ms) * 1000) / 1000;
    const holdAt = Math.round((INTRO_HOLD_MS / ms) * 1000) / 1000;
    nav.querySelectorAll<SVGPathElement>('.arrow-face-blob [data-face-eye]').forEach((eye) => {
      const right = eye.dataset.faceEye === 'right';
      const frames: Keyframe[] = right
        ? [
            { offset: 0, transform: squint, easing: 'linear' },
            { offset: holdAt, transform: squint, easing: EASE_EYE_OPEN },
            { offset: closeAt, transform: open, easing: EASE_EYE_CLOSE },
            { offset: midAt, transform: squint, easing: EASE_EYE_FINAL },
            { offset: 1, transform: open },
          ]
        : [
            { offset: 0, transform: squint, easing: 'linear' },
            { offset: closeAt, transform: squint, easing: EASE_EYE_CLOSE },
            { offset: midAt, transform: open },
          ];
      introAnims.push(eye.animate(frames, { duration: ms, easing: 'linear', fill: 'both' }));
    });
  };

  const playIntroFeatures = () => {
    const move = nav.querySelector<SVGGElement>('.arrow-face-blob [data-face-move]');
    if (!move) return;
    introAnims.push(
      move.animate([{ transform: `scale(${INTRO_FEATURE_SCALE})` }, { transform: 'scale(1)' }], {
        duration: INTRO_MS - INTRO_MID_MS,
        delay: INTRO_MID_MS,
        easing: EASE_EYE_FINAL,
        fill: 'both',
      }),
    );
  };

  function endIntro() {
    introPlaying = false;
    introOn = false;
    clearTimeout(controlsTimer);
    nav.classList.add('is-controls');
    introDebug.end();
    introAnims.splice(0).forEach((anim) => anim.cancel());
    nav.classList.remove('is-face-svg');
    const scaleEl = nav.querySelector<HTMLElement>('[data-nav-scale]');
    const blob = nav.querySelector<HTMLElement>('.arrow-face-blob');
    scaleEl?.getAnimations().forEach((anim) => anim.cancel());
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
    nav.setAttribute('data-intro-settled', '');
    syncGlance();
    pulseHint();
  }

  const dropFaceFilter = () => {
    nav.querySelector('.arrow-face-blob g')?.removeAttribute('filter');
  };

  const showRestingFace = () => {
    dropFaceFilter();
    nav.querySelector('.arrow-face-blob')?.classList.add('is-face-settled');
  };

  const settleFace = () => {
    showRestingFace();
  };

  const runIntro = () => {
    const scaleEl = nav.querySelector<HTMLElement>('[data-nav-scale]')!;
    if (reduce) {
      settleFace();
      nav.classList.remove('is-intro');
      introOn = false;
      introPlaying = false;
      nav.setAttribute('data-intro-settled', '');
      pulseHint();
      syncGlance();
      return;
    }
    const phone = matchMedia('(max-width: 759px)').matches;
    const face = parseFloat(getComputedStyle(nav).getPropertyValue('--arrow-face')) || (phone ? 48 : 70);
    scaleEl.style.transform = 'none';
    nav.classList.add('is-face-svg');
    showRestingFace();
    introDebug.path('svg');
    playIntroEyes(INTRO_MS);
    playIntroFeatures();
    playIntroControls();
    const started = performance.now();
    introDebug.start(started);
    const frame = (now: number) => {
      if (!introPlaying) return;
      const workFrom = introDebugOn ? performance.now() : 0;
      const t = now - started;
      let zoom = INTRO_FACE_FROM;
      if (t > INTRO_HOLD_MS) {
        const hold = Math.min(1, (t - INTRO_HOLD_MS) / (INTRO_MID_MS - INTRO_HOLD_MS));
        zoom = INTRO_FACE_FROM + (INTRO_FACE_MID - INTRO_FACE_FROM) * easeFaceIn(hold);
      }
      if (t > INTRO_MID_MS) {
        const land = Math.min(1, (t - INTRO_MID_MS) / (INTRO_MS - INTRO_MID_MS));
        zoom = INTRO_FACE_MID + (1 - INTRO_FACE_MID) * easeFaceOut(land);
      }
      const size = Math.max(1, Math.round(face * zoom));
      scaleEl.style.width = `${size}px`;
      scaleEl.style.height = `${size}px`;
      if (introDebugOn) introDebug.frame(now, performance.now() - workFrom);
      if (t < INTRO_MS) requestAnimationFrame(frame);
      else {
        endIntro();
        const hash = location.hash.replace('#', '');
        if (hash && nodes.has(hash)) travel(hash, false);
      }
    };
    requestAnimationFrame(frame);
  };

  const hash = location.hash.replace('#', '');
  const start = nav.dataset.start && nodes.has(nav.dataset.start) ? nav.dataset.start : '';
  const opened = start || (hash && nodes.has(hash) && !nodes.get(hash)?.href ? hash : 'landing');
  const keepPath = opened === 'landing' || opened === start;
  history.replaceState(
    { arrow: opened },
    '',
    keepPath ? location.pathname + location.search : `${location.pathname}${location.search}#${opened}`,
  );
  const routed = takeRoute();
  const returning = routed && opened !== 'landing' && nodes.get(routed)?.href && nodes.get(routed)?.parent === opened && isTraverse() ? routed : null;
  screenId = returning ?? opened;
  if (screenId !== 'landing') applyCopy(screenId);
  paintChrome(screenId);
  if (screen()?.full) {
    full = true;
    nav.classList.add('is-full', 'is-cover');
  }
  warmRoutes(screenId);
  if (opened !== 'landing' && nodes.get(opened)?.kind === 'gallery') showSlide(0, false);
  placeCopy();
  placeCaption();
  placeGalleryArrows();
  const relayout = () => {
    const current = screen()?.kind === 'gallery' ? screen()?.slides[slide] : null;
    if (current && full) {
      const box = galleryEl();
      box.style.width = '';
      box.style.height = '';
      box.style.aspectRatio = '';
    }
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
  const pillResize = new ResizeObserver(() => fitProjectLink());
  pillResize.observe(nav);
  if (opened === 'landing') runIntro();
  else {
    introPlaying = false;
    introOn = false;
    const still = [...nav.querySelectorAll<HTMLElement>('.arrow-face-scale, .arrow-face-blob')];
    still.forEach((el) => (el.style.transition = 'none'));
    nav.classList.remove('is-intro');
    still.forEach((el) => el.getBoundingClientRect());
    requestAnimationFrame(() => still.forEach((el) => (el.style.transition = '')));
    nav.classList.add('is-controls');
    settleFace();
    nav.setAttribute('data-intro-settled', '');
    const hint = nav.querySelector<HTMLElement>('[data-nav-hint]');
    if (hint) hint.hidden = true;
  }
  const flyHome = (to: string) => {
    requestAnimationFrame(() => requestAnimationFrame(() => travel(to, false)));
  };
  if (returning) flyHome(opened);
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
