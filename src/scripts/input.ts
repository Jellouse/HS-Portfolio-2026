// Shared input for interactive marks: normalised cursor position (0..1 across the window),
// or null when there is no live mouse. Phones have no tilt/orientation input: the marks
// loop on their own there.
type Pos = { u: number; v: number };

let mouse: Pos | null = null;
let lastMouse = -Infinity;
let started = false;

export function startInput() {
  if (started) return;
  started = true;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse = { u: e.clientX / window.innerWidth, v: e.clientY / window.innerHeight };
    lastMouse = performance.now();
  });
}

/** Live position, or null when the caller should fall back to its simulated cursor. */
export function readInput(now: number): Pos | null {
  if (mouse && now - lastMouse < 2500) return mouse;
  return null;
}
