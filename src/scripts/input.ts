// Shared input for interactive marks: normalised cursor position (0..1 across the window),
// device tilt on phones (relative to the starting pose), or null when neither is live.
type Pos = { u: number; v: number };

let mouse: Pos | null = null;
let lastMouse = -Infinity;
let tilt: Pos | null = null;
let base: { g: number; b: number } | null = null;
let started = false;
let lastTilt = 0;
let waiting = false;

const TILT_RANGE = 30; // degrees from the starting pose to reach the edge
const clamp = (x: number) => Math.max(0, Math.min(1, x));

function onOrientation(e: DeviceOrientationEvent) {
  if (e.gamma == null || e.beta == null) return;
  if (!base) base = { g: e.gamma, b: e.beta };
  const u = clamp(0.5 + (e.gamma - base.g) / (2 * TILT_RANGE));
  const v = clamp(0.5 + (e.beta - base.b) / (2 * TILT_RANGE));
  // time-based low-pass (about 80 ms) to take the sensor jitter out
  const now = performance.now();
  const a = tilt ? 1 - Math.exp(-(now - lastTilt) / 80) : 1;
  lastTilt = now;
  tilt = tilt ? { u: tilt.u + (u - tilt.u) * a, v: tilt.v + (v - tilt.v) * a } : { u, v };
  window.dispatchEvent(new CustomEvent('hs:tilt', { detail: tilt }));
}

let listening = false;
function listenTilt() {
  if (listening) return;
  listening = true;
  window.addEventListener('deviceorientation', onOrientation);
}

export function startInput() {
  if (started) return;
  started = true;
  window.addEventListener('pointermove', (e) => {
    if (e.pointerType !== 'mouse') return;
    mouse = { u: e.clientX / window.innerWidth, v: e.clientY / window.innerHeight };
    lastMouse = performance.now();
  });
  const DOE = (window as any).DeviceOrientationEvent;
  if (!DOE) return;
  if (typeof DOE.requestPermission !== 'function' || window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    listenTilt(); // Android, desktop and others: no prompt, unchanged
    return;
  }
  // iOS: only ask when the faces or the mark are tapped, remember the answer this session.
  const KEY = 'hs-tilt';
  const saved = sessionStorage.getItem(KEY);
  if (saved === 'denied') return;
  waiting = true;
  if (saved === 'granted') {
    // already granted earlier this session: listen directly, no prompt if events arrive
    listenTilt();
    window.addEventListener('deviceorientation', () => (waiting = false), { once: true });
  }
  const ask = (e: Event) => {
    if (!waiting || tilt) return;
    if (!(e.target as Element | null)?.closest?.('.peeps, .mark, .project-mark')) return;
    // same gesture as the tap; navigation is not blocked
    DOE.requestPermission()
      .then((state: string) => {
        sessionStorage.setItem(KEY, state === 'granted' ? 'granted' : 'denied');
        waiting = false;
        if (state === 'granted') listenTilt();
      })
      .catch(() => {});
  };
  document.addEventListener('click', ask, true);
}

/** iOS before permission: callers should rest still instead of animating. */
export function tiltWaiting() {
  return waiting && !tilt;
}

/** Live position, or null when the caller should fall back to its simulated cursor. */
export function readInput(now: number): Pos | null {
  if (mouse && now - lastMouse < 2500) return mouse;
  if (tilt) return tilt;
  return null;
}
