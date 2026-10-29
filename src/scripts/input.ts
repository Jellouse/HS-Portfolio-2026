

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

export function readInput(now: number): Pos | null {
  if (mouse && now - lastMouse < 2500) return mouse;
  return null;
}
