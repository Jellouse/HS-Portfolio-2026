import { prefersReducedMotion } from '../lib/browser';
import { NEAR, STOP_SELECTOR, stopBoxes, stopPositions, tailRoom } from '../lib/project-stops.mjs';
import { playSnick } from './ui-sound';

/**
 * Arrow keys step a project like a stack of screens: Down brings the next
 * section to the middle of the screen, Up the previous one. Up leaves the page
 * only from the very top, where the back control already handles the exit.
 *
 * The scroll is driven here rather than handed to the browser. A native smooth
 * scroll starts from rest every time it is called, so a fast second press
 * restarted the slow ramp and the page felt slower the quicker you pressed.
 * This keeps its own position and velocity, so a second press adds distance to
 * a scroll that is already moving and arrives sooner.
 */

/** A section's measurements. Where those become stops is in project-stops. */
interface Section {
  start: number;
  height: number;
  rows: { start: number; height: number }[];
}

/** How long one step takes, near enough. A critically damped spring covers
    95% of the way in 4.74 / omega seconds, so this is the real duration and it
    does not change with the distance or with how many steps are queued. */
const STEP_MS = 360;
const OMEGA = 4.74 / (STEP_MS / 1000);
/** Keeps a fast double press from smearing the page. */
const MAX_SPEED = 5200;
const REST_PX = 1;
const MAX_DT = 0.05;

const desktop = matchMedia('(min-width: 760px)');

/** Measure the page. Where those numbers turn into stops lives in
    `src/lib/project-stops.mjs`, so a test can check every page with it. */
function sections(root: HTMLElement) {
  const found: Section[] = [];
  for (const el of root.children) {
    if (!(el instanceof HTMLElement) || !el.matches(STOP_SELECTOR)) continue;
    const style = getComputedStyle(el);
    const top = Number.parseFloat(style.paddingTop) || 0;
    const bottom = Number.parseFloat(style.paddingBottom) || 0;
    // A section carries its air in padding or in margin. The padding sits
    // inside the box, so it comes off to reach the words or the picture.
    found.push({
      // Layout only. The media frames move; the block around them does not.
      start: el.getBoundingClientRect().top + scrollY + top,
      height: el.offsetHeight - top - bottom,
      rows: el.matches('.process') ? processRows(el, el.getBoundingClientRect().top + scrollY + top) : [],
    });
  }
  return found;
}

/** The rows of a process grid, as offsets from the section's own top. Its
    items sit two to a row with no wrapper, so a row is the items that share a
    top edge, the way the scroll motion reads them in
    `project-media-scroll.ts`. */
function processRows(section: HTMLElement, sectionTop: number) {
  const grid = section.querySelector<HTMLElement>('.process-grid');
  if (!grid) return [];
  const rows: { start: number; height: number }[] = [];
  let row: { start: number; height: number } | null = null;
  for (const frame of grid.children) {
    if (!(frame instanceof HTMLElement)) continue;
    // The frames carry the scroll motion's translate. Strip it, or each row is
    // measured from wherever its picture currently sits.
    const shift = new DOMMatrix(getComputedStyle(frame).transform).m42 || 0;
    const layout = Math.round(frame.getBoundingClientRect().top + scrollY - shift - sectionTop);
    if (row && Math.abs(layout - row.start) <= 4) row.height = Math.max(row.height, frame.offsetHeight);
    else {
      row = { start: layout, height: frame.offsetHeight };
      rows.push(row);
    }
  }
  return rows;
}

/** Scroll positions for the page's stops, the first being the top. */
function stops(root: HTMLElement) {
  const vh = innerHeight;
  const max = Math.max(0, Math.round(document.documentElement.scrollHeight - vh));
  return stopPositions(stopBoxes(sections(root)), vh, max);
}

function indexAt(list: number[], y: number) {
  let found = 0;
  for (let i = 0; i < list.length; i++) {
    if (list[i] > y + NEAR) break;
    found = i;
  }
  return found;
}

/** Empty room under the last stop, so centring it is reachable at all. */
function tail(root: HTMLElement) {
  return tailRoom(stopBoxes(sections(root)), document.documentElement.scrollHeight, innerHeight);
}

export function projectSections(root: HTMLElement) {
  let pos = 0;
  let vel = 0;
  let target = -1;
  let frame = 0;
  let last = 0;
  /** The value we last wrote, so a scroll we did not write is easy to spot. */
  let expect = -1;

  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    target = -1;
    expect = -1;
    vel = 0;
    pos = scrollY;
  };

  /**
   * Critically damped spring, so it arrives without overshooting. It keeps its
   * velocity when the target moves, which is what makes a second press add
   * speed instead of starting over.
   */
  const tick = (now: number) => {
    if (target < 0) return;
    const dt = Math.min(MAX_DT, Math.max(0.001, (now - last) / 1000));
    last = now;

    const goal = target;
    const x = OMEGA * dt;
    const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const gap = pos - goal;
    const pull = (vel + OMEGA * gap) * dt;

    vel = (vel - OMEGA * pull) * decay;
    vel = Math.max(-MAX_SPEED, Math.min(MAX_SPEED, vel));
    pos = goal + (gap + pull) * decay;

    // A frame that lands within a pixel is the last one. Snapping there keeps
    // a step exact, so pressing Up after Down returns to the same place.
    if (Math.abs(goal - pos) <= REST_PX || (gap !== 0 && Math.sign(pos - goal) !== Math.sign(gap))) {
      expect = goal;
      scrollTo(0, goal);
      stop();
      return;
    }

    expect = Math.round(pos);
    scrollTo(0, pos);
    frame = requestAnimationFrame(tick);
  };

  const hop = (top: number) => {
    target = top;
    if (prefersReducedMotion()) {
      scrollTo(0, top);
      stop();
      return;
    }
    if (!frame) {
      // A fresh run starts from wherever the page actually is.
      last = performance.now();
      pos = scrollY;
      frame = requestAnimationFrame(tick);
    }
  };

  /** Room at the end depends on the media heights, so it is measured again
      whenever a step is taken, and once the images have settled. */
  const paint = () => {
    if (!desktop.matches) {
      root.style.removeProperty('--project-tail');
      return;
    }
    root.style.setProperty('--project-tail', '0px');
    root.style.setProperty('--project-tail', `${tail(root)}px`);
  };

  /**
   * `true` means this key was handled and the browser must leave it alone.
   * Down at the last stop still counts: letting it through let the browser
   * scroll its own nudge, which pushed the page past the stop it was on.
   */
  const step = (dir: 1 | -1) => {
    if (!desktop.matches) return false;
    const list = stops(root);
    // A step still in flight is where the next press starts from, so presses
    // in quick succession queue sections instead of cancelling each other.
    const from = indexAt(list, target >= 0 ? target : scrollY);
    if (dir < 0) {
      // At the top there is nowhere to step, so Back keeps Up.
      if (from <= 0) return false;
      hop(list[from - 1]);
      return true;
    }
    if (from < list.length - 1) hop(list[from + 1]);
    return true;
  };

  paint();
  addEventListener('resize', paint);
  addEventListener('load', paint);
  desktop.addEventListener?.('change', paint);
  // The page grows as media arrives: images as they decode, and a video frame
  // as it takes its poster the first time it comes near. Every one of those
  // moves the end, and the room under the last stop has to follow, or every
  // stop below the growth lands off by the difference.
  if ('ResizeObserver' in window) {
    let queued = 0;
    new ResizeObserver(() => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        paint();
      });
    }).observe(root);
  }
  document.fonts?.ready.then(paint).catch(() => {});
  // Images grow the page as they decode, so the end moves. Settle it after
  // every image has landed, and once more when the intro has finished.
  const media = [...root.querySelectorAll('img')];
  Promise.all(
    media.map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((resolve) => {
            img.addEventListener('load', () => resolve(), { once: true });
            img.addEventListener('error', () => resolve(), { once: true });
          }),
    ),
  ).then(paint);

  // A scroll at a place we did not write means the visitor took over: the
  // scrollbar, a trackpad flick, a find-in-page jump. Hand the page back.
  addEventListener(
    'scroll',
    () => {
      if (expect < 0) return;
      if (Math.abs(scrollY - expect) > NEAR) stop();
    },
    { passive: true },
  );
  addEventListener('wheel', stop, { passive: true });
  addEventListener('touchstart', stop, { passive: true });

  return {
    up: () => desktop.matches && step(-1),
    down: () => desktop.matches && step(1),
  };
}
