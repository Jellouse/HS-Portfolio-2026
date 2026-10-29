/** Per-letter colour fade for the Humansize wordmark, nav, and page titles (s.engineering values). */

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clear = 'rgba(0, 0, 0, 0)';

const EASE = 'cubic-bezier(.22,1,.36,1)';
const LETTER_MS = 380;
const STAGGER_MS = 30;

export type LetterIntroTarget = { shell: HTMLElement; textRoot: HTMLElement };

export function splitLetterText(root: HTMLElement, { ariaLabel = true }: { ariaLabel?: boolean } = {}) {
  const color = getComputedStyle(root).color;
  if (ariaLabel) root.setAttribute('aria-label', root.textContent?.trim() || '');
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode as Text);
  const letters: HTMLElement[] = [];
  textNodes.forEach((textNode) => {
    const textColor = getComputedStyle(textNode.parentElement || root).color;
    const spans = [...textNode.textContent!].map((character) => {
      const letter = document.createElement('span');
      letter.className = 'motion-letter';
      letter.textContent = character === ' ' ? '\u00a0' : character;
      letter.setAttribute('aria-hidden', 'true');
      letter.dataset.motionColor = textColor;
      letter.style.color = reduced.matches ? textColor : clear;
      return letter;
    });
    textNode.replaceWith(...spans);
    letters.push(...spans);
  });
  return { letters, color };
}

/** One ordered sequence: brand name, then main nav, shop title/menu, project title, services nav. */
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
  return seq;
}

/** @deprecated use introLetterSequence */
export function letterIntroTargets(): LetterIntroTarget[] {
  return introLetterSequence();
}

export async function playLetterIntro() {
  const targets = introLetterSequence();
  if (reduced.matches) {
    targets.forEach(({ shell }) => shell.classList.add('is-motion-ready'));
    document.documentElement.classList.add('is-letter-intro-done');
    return;
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

  try {
    await Promise.all(animations.map((a) => a.finished));
  } finally {
    segments.flatMap((s) => s.letters).forEach((letter) => {
      letter.style.color = letter.dataset.motionColor || getComputedStyle(letter).color;
    });
    animations.forEach((a) => a.cancel());
    document.documentElement.classList.add('is-letter-intro-done');
  }
}
