import { initHeroBlob } from './hero-blob';
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
  nav.dataset.ready = '1';

  const raw = nav.querySelector<HTMLScriptElement>('[data-nav-tree]')?.textContent;
  if (!raw) return;
  const tree = JSON.parse(raw) as ArrowTree;
  const nodes = new Map(tree.nodes.map((node) => [node.id, node]));
  const stage = nav.querySelector<HTMLElement>('[data-nav-stage]')!;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const moveMs = () => cssMs('--dur-nav');
  const gap = 8;

  let screenId = 'landing';
  let generation = 0;
  let introOn = true;
  let introPlaying = true;
  let pressed: HTMLElement | null = null;
  let pressFrom: 'key' | 'pointer' | null = null;
  let pressKey = '';
  let slide = 0;
  let progressFrame = 0;
  let progressStart = 0;
  let autoplay = false;
  let full = false;
  let fullGen = 0;

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
        if (projectLink.hidden) return;
        sessionStorage.setItem('arrow-return', '1');
      });
    }
    const projectTitle = caption.querySelector<HTMLElement>('[data-nav-project-title]')!;
    const buy = caption.querySelector<HTMLElement>('[data-nav-buy]')!;
    const slug = caption.querySelector<HTMLInputElement>('[data-nav-buy-slug]')!;
    const gallery = nav.querySelector<HTMLElement>('[data-nav-gallery]')!;
    const cutout = !!item.alpha;
    photo.classList.toggle('is-alpha', cutout);
    gallery.classList.toggle('is-alpha', cutout);
    photo.getAnimations().forEach((anim) => anim.cancel());
    if (item.kind === 'video') {
      photo.hidden = true;
      clip.hidden = false;
      clip.poster = item.poster || '';
      if (clip.getAttribute('src') !== item.src) clip.src = item.src;
      clip.play().catch(() => {});
    } else {
      clip.pause();
      clip.hidden = true;
      clip.removeAttribute('src');
      photo.hidden = false;
      photo.src = item.src;
      photo.alt = item.alt;
    }
    photo.style.opacity = '';
    if (item.kind === 'video') {
      clip.onloadedmetadata = () => {
        if (screen()?.slides[slide] !== item || !clip.videoWidth) return;
        fitGallery({ width: clip.videoWidth, height: clip.videoHeight }, true);
      };
    }
    fitGallery(item, morph && !full);
    title.textContent = item.title;
    body.innerHTML = item.caption;
    if (item.slug) {
      projectLink.hidden = false;
      projectLink.href = `/work/${item.slug}/`;
      projectTitle.textContent = item.title;
      title.hidden = true;
      body.hidden = true;
      gallery.dataset.project = item.slug;
    } else {
      projectLink.hidden = true;
      delete gallery.dataset.project;
      title.hidden = !item.title;
      body.hidden = !item.caption;
    }
    slug.value = item.product;
    buy.hidden = !item.product;
    caption.hidden = !item.title && !item.caption && !item.product;
    const dots = nav.querySelector<HTMLElement>('[data-nav-dots]')!;
    dots.replaceChildren(
      ...node.slides.map((_, i) => {
        const dot = document.createElement('span');
        dot.className = i === slide ? 'arrow-dot is-on' : 'arrow-dot';
        return dot;
      }),
    );
    progressStart = performance.now();
    if (autoplay) wakeProgress();
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
      const t = Math.min(1, (now - progressStart) / SLIDE_MS);
      nav.querySelector<HTMLElement>('.arrow-dot.is-on')?.style.setProperty('--nav-progress', t.toFixed(3));
      if (t >= 1) {
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
    const box = edges
      ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight }
      : frame
        ?? (nav.classList.contains('is-cover')
          ? restingFrame()
          : nav.querySelector<HTMLElement>('[data-nav-gallery]')!.getBoundingClientRect());
    const size = controlSize();
    const pad = phone() ? 20 : 48;
    const y = edges ? Math.round((window.innerHeight - size) / 2) : Math.round(box.top + box.height / 2 - size / 2);
    const spots: [HTMLElement, number][] = [
      [left, edges ? pad : Math.round(box.left / 2 - size / 2)],
      [right, edges ? Math.round(window.innerWidth - pad - size) : Math.round(box.right + (window.innerWidth - box.right) / 2 - size / 2)],
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
    back.style.left = edges ? `${Math.round((window.innerWidth - size) / 2)}px` : `${Math.round(nav.clientWidth / 2 - size / 2)}px`;
    back.style.right = 'auto';
    back.style.bottom = 'auto';
    back.style.top = edges ? `${pad}px` : `${Math.round(above - size / 2)}px`;
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
    const target = open
      ? { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight, borderRadius: '0px' }
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
    el.style.position = 'fixed';
    el.style.left = `${Math.round(rect.left)}px`;
    el.style.top = `${Math.round(rect.top)}px`;
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
    const faceTop = faceEl().getBoundingClientRect().top;
    const limit = back.hidden ? faceTop : back.getBoundingClientRect().top;
    copy.style.top = `${Math.round(limit / 2)}px`;
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
    nav.querySelectorAll('.arrow-clip').forEach((el) => el.remove());
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
    const faceW = faceEl().getBoundingClientRect().width || controlSize();
    const small = Math.max(0.12, faceW / (gallery.offsetWidth || 1));
    const from = fromScale == null ? (open ? small : 1) : Math.min(1, Math.max(small, fromScale));
    const rest = 'translate(-50%, -50%) scale(1)';
    const at = (scale: number) => `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    const anim = gallery.animate(open ? [{ transform: at(from) }, { transform: rest }] : [{ transform: at(from) }, { transform: at(small), opacity: 0 }], {
      duration: moveMs(),
      easing: cssEase('--ease-nav'),
      fill: 'both',
    });
    anim.finished.finally(() => {
      if (genAt !== generation) return;
      anim.cancel();
      if (!open) gallery.hidden = true;
    });
  };

  const travel = (id: string, push: boolean) => {
    if (introOn || id === screenId || (id !== 'landing' && !nodes.has(id))) return;
    if (introPlaying) endIntro();
    if (full) dropFull();
    const gen = ++generation;
    stopAutoplay();
    const hub = hubPoint();
    const ease = cssEase('--ease-nav');
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
    if (wasLanding !== (id === 'landing')) fadeHint(id === 'landing');
    window.scrollTo(0, 0);
    const enteringGallery = !wasGallery && nav.dataset.kind === 'gallery';
    const outward = depthOf(id) > depthOf(fromId);
    if (enteringGallery && !reduce) faceEl().hidden = false;
    if (screen()?.kind === 'gallery') showSlide(0, false);
    placeGalleryArrows();
    placeCopy();
    placeCaption();
    const nowGallery = nav.dataset.kind === 'gallery';
    if (!reduce && nowGallery !== wasGallery) growGallery(nowGallery, fromScale);

    if (reduce) {
      flights().forEach(clearPin);
      placeGalleryArrows();
      startAutoplay();
      if (push) history.pushState({ arrow: id }, '', id === 'landing' ? location.pathname + location.search : `#${id}`);
      return;
    }

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
    const slot = nav.querySelector<HTMLElement>('.arrow-slot')!;
    const clips: HTMLElement[] = [];
    const verticalDir = (dir: string) => dir === 'up' || dir === 'down';
    const clipFor = (dir: string) => {
      const clip = document.createElement('div');
      clip.className = 'arrow-clip';
      clip.style.position = 'fixed';
      clip.style.overflow = 'hidden';
      clip.style.pointerEvents = 'none';
      clip.style.zIndex = '2';
      clip.style.transform = 'translateZ(0)';
      const x = `${Math.round(hub.x)}px`;
      const y = `${Math.round(hub.y)}px`;
      if (dir === 'right') {
        clip.style.left = x;
        clip.style.top = '0';
        clip.style.right = '0';
        clip.style.bottom = '0';
      } else if (dir === 'down') {
        clip.style.left = '0';
        clip.style.top = y;
        clip.style.right = '0';
        clip.style.bottom = '0';
      } else if (dir === 'up') {
        clip.style.left = '0';
        clip.style.top = '0';
        clip.style.right = '0';
        clip.style.height = y;
      } else {
        clip.style.left = '0';
        clip.style.top = '0';
        clip.style.width = x;
        clip.style.bottom = '0';
      }
      return clip;
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
        const clip = clipFor(dir);
        const originX = dir === 'right' ? hub.x : 0;
        const originY = dir === 'down' ? hub.y : 0;
        clone.style.position = 'absolute';
        clone.style.left = `${Math.round(prev.rect.left - originX)}px`;
        clone.style.top = `${Math.round(prev.rect.top - originY)}px`;
        clone.style.right = 'auto';
        clone.style.bottom = 'auto';
        clone.style.margin = '0';
        clone.style.width = `${Math.round(prev.rect.width)}px`;
        clone.style.height = `${Math.round(prev.rect.height)}px`;
        clone.style.transform = 'none';
        clone.style.opacity = String(prev.opacity);
        clip.append(clone);
        slot.append(clip);
        clips.push(clip);
        const move = departMove(dir, prev, arrival);
        const motion = clone.animate(
          [{ transform: 'translate(0px, 0px)' }, { transform: `translate(${move.x}px, ${move.y}px)` }],
          { duration: moveMs(), easing: ease, fill: 'both' },
        );
        clone.animate([{ opacity: prev.opacity }, { opacity: 0 }], {
          duration: Math.round(moveMs() * 0.7),
          easing: ease,
          fill: 'forwards',
        });
        motion.finished.finally(() => {
          if (gen === generation) clip.remove();
        });
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
          { transform: `translate(${dx}px, ${dy}px)`, opacity: moved ? 1 : 0 },
          { transform: 'translate(0px, 0px)', opacity: 1 },
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
      clips.forEach((clip) => clip.remove());
      if (nav.dataset.kind === 'gallery') faceEl().hidden = true;
      placeGalleryArrows();
      startAutoplay();
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
        sessionStorage.setItem('arrow-return', '1');
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
    if (screenId === 'about' && dir === 'left') {
      const link = document.createElement('a');
      link.href = '/services/';
      document.body.append(link);
      link.click();
      link.remove();
      return;
    }
    if (screenId === 'about' && dir === 'right') {
      if (pressFrom === 'key') nav.querySelector<HTMLElement>('[data-dir="right"]')?.click();
      return;
    }
    const next = child(screenId, dir);
    if (next) travel(next.id, true);
  };

  let holdTimer = 0;
  let flipping = false;

  const canFlip = (dir: Dir) => screen()?.kind === 'gallery' && (dir === 'left' || dir === 'right');

  const stopHold = (resume: boolean) => {
    if (holdTimer) window.clearTimeout(holdTimer);
    holdTimer = 0;
    flipping = false;
    if (resume) startAutoplay();
  };

  const startHold = (dir: Dir) => {
    if (!canFlip(dir)) return false;
    stopAutoplay();
    const step = () => showSlide(slide + (dir === 'right' ? 1 : -1));
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
    const button = (event.target as Element).closest<HTMLElement>('[data-dir]');
    if (!button || button.hidden || introOn || !nav.contains(button)) return;
    setPressed(button, 'pointer', '');
    startHold(button.dataset.dir as Dir);
  });

  window.addEventListener('pointerup', (event) => {
    if (pressFrom !== 'pointer' || !pressed) return;
    const button = pressed;
    const dir = button.dataset.dir as Dir;
    const releasedOn = (event.target as Element | null)?.closest?.('[data-dir]') === button;
    const wasFlip = flipping;
    stopHold(wasFlip);
    if (!wasFlip && releasedOn) activate(dir);
    setPressed(null, null);
  });

  window.addEventListener('pointercancel', () => {
    if (pressFrom !== 'pointer') return;
    stopHold(false);
    setPressed(null, null);
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
    if (!backKey(event.key)) startHold(dir);
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
    const scaleEl = nav.querySelector<HTMLElement>('[data-nav-scale]');
    if (scaleEl) scaleEl.style.transform = '';
    settleFace();
    nav.classList.remove('is-intro');
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
    const started = performance.now();
    let revealed = false;
    const frame = (now: number) => {
      if (!introPlaying) return;
      const t = Math.min(1, (now - started) / INTRO_MS);
      const eased = easeInOut(t);
      const zoom = INTRO_ZOOM + (1 - INTRO_ZOOM) * eased;
      const stretch = INTRO_STRETCH + (1 - INTRO_STRETCH) * eased;
      scaleEl.style.transform = `scale(${zoom.toFixed(3)}) scaleX(${stretch.toFixed(3)})`;
      disp?.setAttribute('scale', String(Math.round(DISP_FROM + (DISP_REST - DISP_FROM) * eased)));
      const soft = BLUR_FROM + (BLUR_REST - BLUR_FROM) * eased;
      blur?.setAttribute('stdDeviation', soft.toFixed(2));
      if (!revealed && now - started >= INTRO_REVEAL_MS) {
        revealed = true;
        revealIntro();
      }
      if (t < 1) requestAnimationFrame(frame);
      else {
        endIntro();
        if (!revealed) revealIntro();
        const hash = location.hash.replace('#', '');
        if (hash && nodes.has(hash)) travel(hash, false);
      }
    };
    requestAnimationFrame(frame);
  };

  const hash = location.hash.replace('#', '');
  const opened = hash && nodes.has(hash) ? hash : 'landing';
  history.replaceState(
    { arrow: opened },
    '',
    opened === 'landing' ? location.pathname + location.search : `${location.pathname}${location.search}#${opened}`,
  );
  screenId = opened;
  paintChrome(opened);
  if (opened !== 'landing' && nodes.get(opened)?.kind === 'gallery') showSlide(0, false);
  placeCopy();
  placeCaption();
  placeGalleryArrows();
  window.addEventListener('resize', () => {
    const current = screen()?.kind === 'gallery' ? screen()?.slides[slide] : null;
    if (current && !full) fitGallery(current, false);
    placeCopy();
    placeCaption();
    placeGalleryArrows();
  });
  if (opened === 'landing') runIntro();
  else {
    introPlaying = false;
    introOn = false;
    nav.classList.remove('is-intro');
    nav.classList.add('is-controls');
    settleFace();
  }
}
