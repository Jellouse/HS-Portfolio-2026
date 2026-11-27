const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

const TEXT_ENTRY = 'input, textarea, [contenteditable="true"]';
const EXIT_KEYS = new Set(['ArrowUp', 'Escape', 'Backspace']);

export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia(REDUCED_MOTION).matches;
}

export function isTypingTarget(target: EventTarget | null): boolean {
  return target instanceof Element && Boolean(target.closest(TEXT_ENTRY));
}

export function isExitKey(key: string): boolean {
  return EXIT_KEYS.has(key);
}
