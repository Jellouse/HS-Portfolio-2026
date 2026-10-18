// Tiny Lenis smoothing for desktop wheel/trackpad only.
// Touch, coarse pointers, reduced motion, and CMS/preview routes stay native.

import Lenis from 'lenis';

/** Single tuning knob. Higher → closer to native. ~0.3 = barely noticeable (was 0.14, too strong). */
export const SMOOTH_LERP = 0.3;

let lenis: Lenis | null = null;
let wired = false;

function allowedHere() {
  const path = location.pathname;
  if (path.startsWith('/keystatic') || path.startsWith('/preview')) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  // Desktop only: fine pointer + hover. Coarse/touch keep native scroll (iOS + guard).
  if (window.matchMedia('(pointer: coarse)').matches) return false;
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return false;
  return true;
}

function destroy() {
  if (!lenis) return;
  lenis.destroy();
  lenis = null;
}

function start() {
  if (!allowedHere() || lenis) return;

  lenis = new Lenis({
    lerp: SMOOTH_LERP,
    smoothWheel: true,
    syncTouch: false,
    autoRaf: true,
    anchors: true,
    stopInertiaOnNavigate: true,
    // We already skip init when reduced-motion matches; keep Lenis's own guard on.
    respectReducedMotion: true,
  });
}

function wireLifecycle() {
  if (wired) return;
  wired = true;

  // Cross-document view transitions / unload: drop Lenis so the next page
  // (or bfcache restore) does not inherit a mid-lerp or stopped scroll.
  window.addEventListener('pagehide', destroy);
  window.addEventListener('pageswap', destroy);

  window.addEventListener('pageshow', (event) => {
    if (event.persisted) {
      destroy();
      start();
    }
  });

  // If the user flips reduced-motion or switches to a coarse pointer mid-session.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarse = window.matchMedia('(pointer: coarse)');
  const onPrefChange = () => {
    destroy();
    start();
  };
  reduce.addEventListener('change', onPrefChange);
  coarse.addEventListener('change', onPrefChange);
}

export function initSmoothScroll() {
  wireLifecycle();
  start();
}
