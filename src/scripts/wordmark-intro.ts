const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clear = 'rgba(0, 0, 0, 0)';

const EASE = 'cubic-bezier(.22,1,.36,1)';
const LETTER_MS = 380;
const STAGGER_MS = 30;

const FOLD_SELECTOR = [
  'h1',
  'h2',
  'h3',
  'h4',
  'p',
  'li',
  'figcaption',
  'summary',
  'blockquote',
  'button',
  'a',
  'label',
  'dt',
  'dd',
  '.caption',
].join(', ');

const FOLD_SKIP = [
  '[data-no-letter]',
  '[hidden]',
  '[inert]',
  '[aria-hidden="true"]',
  '.sr-only',
  '.contact-panel',
  '[data-contact]',
  '[role="dialog"]',
  '.intro-tune',
  '.hero-dials',
  'svg',
].join(', ');

const REVEAL_HOST = [
  'main :is(p, h1, h2, h3, h4, li, blockquote, figcaption, summary, .caption, .project-summary)',
  '.site-footer :is(p, li)',
].join(', ');

type FoldTarget = { el: HTMLElement; lines: boolean };

export type LetterIntroTarget = { shell: HTMLElement; textRoot: HTMLElement };

function letterSpan(character: string, textColor: string, space: 'nbsp' | 'char') {
  const letter = document.createElement('span');
  letter.className = 'motion-letter';
  letter.textContent = character === ' ' && space === 'nbsp' ? '\u00a0' : character;
  letter.setAttribute('aria-hidden', 'true');
  letter.dataset.motionColor = textColor;
  letter.style.color = reduced.matches ? textColor : clear;
  return letter;
}

export function splitLetterText(
  root: HTMLElement,
  { ariaLabel = true, wrap = false }: { ariaLabel?: boolean; wrap?: boolean } = {},
) {
  const color = getComputedStyle(root).color;
  if (ariaLabel) {
    const text = root.textContent?.trim() || '';
    if (!wrap || text) root.setAttribute('aria-label', text);
    if (wrap) {
      root.querySelectorAll<HTMLElement>('a, button').forEach((el) => {
        if (el.hasAttribute('aria-label')) return;
        const label = el.textContent?.trim();
        if (label) el.setAttribute('aria-label', label);
      });
    }
  }
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  const letters: HTMLElement[] = [];
  textNodes.forEach((textNode) => {
    const textColor = getComputedStyle(textNode.parentElement || root).color;
    if (!wrap) {
      const spans = [...textNode.textContent!].map((character) => letterSpan(character, textColor, 'nbsp'));
      textNode.replaceWith(...spans);
      letters.push(...spans);
      return;
    }
    const frag = document.createDocumentFragment();
    let word: HTMLElement | null = null;
    const pushWord = () => {
      if (!word) return;
      frag.appendChild(word);
      word = null;
    };
    for (const character of textNode.textContent!) {
      if (/\s/.test(character)) {
        pushWord();
        frag.appendChild(document.createTextNode(character));
        continue;
      }
      if (!word) {
        word = document.createElement('span');
        word.className = 'motion-word';
      }
      const letter = letterSpan(character, textColor, 'char');
      word.appendChild(letter);
      letters.push(letter);
    }
    pushWord();
    textNode.replaceWith(frag);
  });
  return { letters, color };
}

export function introLetterSequence(): LetterIntroTarget[] {
  const seq: LetterIntroTarget[] = [];
  document.querySelectorAll<HTMLElement>('.brand-toggle').forEach((shell) => {
    seq.push({ shell, textRoot: shell.querySelector<HTMLElement>('.brand-name') ?? shell });
  });
  document.querySelectorAll<HTMLElement>('.site-header .site-menu[data-main-menu] :is(a, button)').forEach((el) => {
    seq.push({ shell: el, textRoot: el });
  });
  document.querySelectorAll<HTMLElement>('.shop-head-title').forEach((textRoot) => {
    seq.push({ shell: textRoot, textRoot });
  });
  document.querySelectorAll<HTMLElement>('.shop-head .shop-menu :is(a, button)').forEach((el) => {
    seq.push({ shell: el, textRoot: el });
  });
  document.querySelectorAll<HTMLElement>('.project-hero h1').forEach((textRoot) => {
    seq.push({ shell: textRoot, textRoot });
  });
  document.querySelectorAll<HTMLElement>('main .services-menu :is(a, button)').forEach((el) => {
    seq.push({ shell: el, textRoot: el });
  });
  return seq.filter(({ textRoot }) => !textRoot.closest('[data-no-letter]'));
}

function compareReading(a: HTMLElement, b: HTMLElement) {
  const ra = a.getBoundingClientRect();
  const rb = b.getBoundingClientRect();
  if (Math.abs(ra.top - rb.top) > 2) return ra.top - rb.top;
  return ra.left - rb.left;
}

function collectFoldText(headlines: LetterIntroTarget[]) {
  const roots = headlines.map((item) => item.textRoot);
  const vh = document.documentElement.clientHeight || window.innerHeight;
  const nodes = [...document.querySelectorAll<HTMLElement>(FOLD_SELECTOR)];
  const candidates = nodes.filter((el) => {
    if (el.closest(FOLD_SKIP)) return false;
    if (roots.some((root) => root === el || root.contains(el) || el.contains(root))) return false;
    if (!el.textContent?.trim()) return false;
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') return false;
    const rect = el.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    if (rect.top >= vh || rect.bottom <= 0) return false;
    return true;
  });
  return candidates
    .filter((el) => !candidates.some((other) => other !== el && other.contains(el)))
    .sort(compareReading)
    .map((el) => {
      const rect = el.getBoundingClientRect();
      const lines = rect.bottom > vh + 1 && el.matches(REVEAL_HOST);
      return { el, lines } satisfies FoldTarget;
    });
}

export function resetLetterIntro() {
  document.documentElement.removeAttribute('data-letter-intro-prepared');
}

function signalLetterIntroPrepared() {
  const root = document.documentElement;
  if (root.hasAttribute('data-letter-intro-prepared')) return;
  root.setAttribute('data-letter-intro-prepared', '');
  document.dispatchEvent(new Event('letter-intro-prepared'));
}

function foldLines(segments: { letters: HTMLElement[]; color: string }[]) {
  const painted = segments.flatMap(({ letters, color }) => letters.map((letter) => ({ letter, color })));
  painted.sort((a, b) => {
    const ra = a.letter.getBoundingClientRect();
    const rb = b.letter.getBoundingClientRect();
    if (Math.abs(ra.top - rb.top) > 2) return ra.top - rb.top;
    return ra.left - rb.left;
  });
  const lines: { letter: HTMLElement; color: string }[][] = [];
  let lineTop = -Infinity;
  for (const item of painted) {
    const top = item.letter.getBoundingClientRect().top;
    if (!lines.length || Math.abs(top - lineTop) > 2) {
      lines.push([item]);
      lineTop = top;
    } else lines[lines.length - 1].push(item);
  }
  return lines;
}

export async function playLetterIntro() {
  const targets = introLetterSequence();
  if (reduced.matches) {
    targets.forEach(({ shell }) => shell.classList.add('is-motion-ready'));
    document.documentElement.classList.add('is-letter-intro-done');
    signalLetterIntroPrepared();
    return;
  }

  let fold: FoldTarget[] = [];
  try {
    fold = collectFoldText(targets);
    fold.forEach(({ el, lines }) => {
      if (lines) return;
      el.setAttribute('data-letter-intro', '');
      el.setAttribute('data-no-reveal', '');
    });
  } finally {
    signalLetterIntroPrepared();
  }

  const segments: { letters: HTMLElement[]; color: string }[] = [];
  for (const { shell, textRoot } of targets) {
    shell.classList.add('is-motion-ready');
    if (textRoot.classList.contains('brand-name')) {
      shell.setAttribute('aria-label', textRoot.textContent?.trim() || 'Humansize');
    }
    const existing = [...textRoot.querySelectorAll<HTMLElement>('.motion-letter')];
    if (existing.length) segments.push({ letters: existing, color: getComputedStyle(textRoot).color });
    else segments.push(splitLetterText(textRoot, { ariaLabel: !textRoot.classList.contains('brand-name') }));
  }

  const foldSegments: { letters: HTMLElement[]; color: string }[] = [];
  const vh = document.documentElement.clientHeight || window.innerHeight;
  for (const { el, lines } of fold) {
    if (!lines) {
      el.classList.add('is-motion-ready');
      const existing = [...el.querySelectorAll<HTMLElement>('.motion-letter')];
      if (existing.length) foldSegments.push({ letters: existing, color: getComputedStyle(el).color });
      else foldSegments.push(splitLetterText(el, { wrap: true }));
      continue;
    }
    el.classList.add('is-letter-host');
    const label = el.textContent?.trim() || '';
    if (label && !el.hasAttribute('aria-label')) el.setAttribute('aria-label', label);
    el.querySelectorAll<HTMLElement>('a, button').forEach((control) => {
      if (control.hasAttribute('aria-label')) return;
      const name = control.textContent?.trim();
      if (name) control.setAttribute('aria-label', name);
    });
    const words = [...el.querySelectorAll<HTMLElement>('.reveal-word')].filter((word) => {
      if (word.parentElement?.closest('.reveal-word')) return false;
      const rect = word.getBoundingClientRect();
      return rect.width > 0 && rect.top < vh;
    });
    if (!words.length) {
      el.classList.add('is-motion-ready');
      foldSegments.push(splitLetterText(el, { wrap: true, ariaLabel: false }));
      continue;
    }
    for (const word of words) {
      word.classList.remove('reveal-word');
      word.classList.add('is-letter-line', 'is-motion-ready');
      const existing = [...word.querySelectorAll<HTMLElement>('.motion-letter')];
      if (existing.length) foldSegments.push({ letters: existing, color: getComputedStyle(word).color });
      else foldSegments.push(splitLetterText(word, { ariaLabel: !word.matches('a, button') }));
    }
  }

  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

  let index = 0;
  const animations = segments.flatMap(({ letters, color }) =>
    letters.map((letter) => {
      const anim = letter.animate([{ color: clear }, { color: letter.dataset.motionColor || color }], {
        duration: LETTER_MS,
        delay: index++ * STAGGER_MS,
        easing: EASE,
        fill: 'both',
      });
      return anim;
    }),
  );

  const headlineLetters = index;
  const foldAnimations = foldLines(foldSegments).flatMap((line, lineIndex) =>
    line.map(({ letter, color }, letterIndex) =>
      letter.animate([{ color: clear }, { color: letter.dataset.motionColor || color }], {
        duration: LETTER_MS,
        delay: (headlineLetters + lineIndex + letterIndex) * STAGGER_MS,
        easing: EASE,
        fill: 'both',
      }),
    ),
  );
  animations.push(...foldAnimations);

  try {
    await Promise.all(animations.map((a) => a.finished));
  } finally {
    segments.flatMap((segment) => segment.letters).forEach((letter) => {
      letter.style.color = letter.dataset.motionColor || getComputedStyle(letter).color;
    });
    foldSegments.flatMap((segment) => segment.letters).forEach((letter) => {
      letter.style.color = '';
    });
    animations.forEach((a) => a.cancel());
    document.documentElement.classList.add('is-letter-intro-done');
  }
}
