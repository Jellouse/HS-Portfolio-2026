// Shared input for interactive marks: normalised cursor position (0..1 across the window),
// device tilt on phones (relative to the starting pose), or null when neither is live.
type Pos = { u: number; v: number };

let mouse: Pos | null = null;
let lastMouse = -Infinity;
let tilt: Pos | null = null;
let base: { g: number; b: number } | null = null;
let started = false;
let lastTilt = 0;

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

function listenTilt() {
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
  if (typeof DOE.requestPermission === 'function') {
    // iOS: ask quietly on the first tap, the system prompt is the only UI
    const ask = () => {
      DOE.requestPermission()
        .then((state: string) => state === 'granted' && listenTilt())
        .catch(() => {});
    };
    window.addEventListener('pointerup', ask, { once: true });
  } else {
    listenTilt();
  }
}

/** Live position, or null when the caller should fall back to its simulated cursor. */
export function readInput(now: number): Pos | null {
  if (mouse && now - lastMouse < 2500) return mouse;
  if (tilt) return tilt;
  return null;
}
