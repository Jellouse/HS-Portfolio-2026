/** Per-letter colour fade for the Humansize wordmark and page titles (s.engineering values). */

const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const clear = 'rgba(0, 0, 0, 0)';

const fade = async (letters: HTMLElement[], color: string) => {
  const animations = letters.map((letter, index) =>
    letter.animate(
      [{ color: clear }, { color: letter.dataset.motionColor || color }],
      {
        duration: 380,
        delay: index * 30,
        easing: 'cubic-bezier(.22,1,.36,1)',
        fill: 'both',
      },
    ),
  );
  try {
    await Promise.all(animations.map((a) => a.finished));
  } finally {
    letters.forEach((letter) => {
      letter.style.color = letter.dataset.motionColor || color;
    });
    animations.forEach((a) => a.cancel());
  }
};

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

export function letterIntroTargets(): LetterIntroTarget[] {
  const targets: LetterIntroTarget[] = [];
  document.querySelectorAll<HTMLElement>('.brand-toggle').forEach((shell) => {
    const textRoot = shell.querySelector<HTMLElement>('.brand-name') ?? shell;
    targets.push({ shell, textRoot });
  });
  document.querySelectorAll<HTMLElement>('.project-hero h1, .shop-head-title').forEach((textRoot) => {
    targets.push({ shell: textRoot, textRoot });
  });
  return targets;
}

export async function playLetterIntro() {
  const targets = letterIntroTargets();
  if (reduced.matches) {
    targets.forEach(({ shell }) => shell.classList.add('is-motion-ready'));
    return;
  }
  targets.forEach(({ shell, textRoot }) => {
    shell.classList.add('is-motion-ready');
    if (textRoot.classList.contains('brand-name')) {
      shell.setAttribute('aria-label', textRoot.textContent?.trim() || 'Humansize');
    }
  });
  const groups = targets.map(({ shell, textRoot }) => {
    const existing = [...textRoot.querySelectorAll<HTMLElement>('.motion-letter')];
    if (existing.length) {
      return { letters: existing, color: getComputedStyle(textRoot).color };
    }
    return splitLetterText(textRoot, { ariaLabel: !textRoot.classList.contains('brand-name') });
  });
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  for (const { letters, color } of groups) await fade(letters, color);
}
