// ?introdebug: a small readout of how the homepage intro ran on this device.
// Which face path ran (gl or svg), why it fell back, setup cost, and the frame
// times for the first 3 s of the intro. Off unless the flag is in the URL.

const WINDOW_MS = 3000;

type State = {
  path: string;
  reason: string;
  setupMs: number;
  renderer: string;
  scriptAt: number;
  holdAt: number;
  startAt: number;
  last: number;
  deltas: number[];
  holdDeltas: number[];
  work: number[];
  done: boolean;
};

export const introDebugOn = typeof location !== 'undefined' && new URLSearchParams(location.search).has('introdebug');

let el: HTMLElement | null = null;
const s: State = { path: '?', reason: '', setupMs: 0, renderer: '', scriptAt: 0, holdAt: 0, startAt: 0, last: 0, deltas: [], holdDeltas: [], work: [], done: false };

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))] ?? 0;
const r1 = (n: number) => Math.round(n * 10) / 10;

function render() {
  if (!introDebugOn) return;
  if (!el) {
    el = document.createElement('pre');
    el.className = 'intro-debug';
    el.setAttribute('aria-hidden', 'true');
    document.body.appendChild(el);
  }
  const d = s.deltas;
  const sorted = [...d].sort((a, b) => a - b);
  const span = d.reduce((a, b) => a + b, 0);
  const work = [...s.work].sort((a, b) => a - b);
  const lines = [
    `intro face: ${s.path}${s.reason ? ` (fallback: ${s.reason})` : ''}`,
    `setup ${r1(s.setupMs)}ms  script at ${Math.round(s.scriptAt)}ms  held ${s.startAt ? Math.round(s.startAt - s.holdAt) : '?'}ms  clock at ${Math.round(s.startAt)}ms`,
    `dpr ${devicePixelRatio}  ${innerWidth}x${innerHeight}${s.renderer ? `  ${s.renderer}` : ''}`,
    `first ${Math.round(Math.min(span, WINDOW_MS))}ms${s.done ? '' : ' (running)'}: ${d.length} frames, ${span ? r1((d.length * 1000) / span) : 0} fps`,
    `frame ms p50 ${r1(pct(sorted, 0.5))}  p95 ${r1(pct(sorted, 0.95))}  max ${r1(sorted.at(-1) ?? 0)}`,
    `>20ms ${d.filter((x) => x > 20).length}  >34ms ${d.filter((x) => x > 34).length}  >50ms ${d.filter((x) => x > 50).length}`,
    `js per frame p50 ${r1(pct(work, 0.5))}  max ${r1(work.at(-1) ?? 0)}`,
    `held frames: ${s.holdDeltas.map((x) => Math.round(x)).join(' ')}`,
    `deltas: ${d.map((x) => Math.round(x)).join(' ')}`,
  ];
  el.textContent = lines.join('\n');
}

export const introDebug = {
  script() {
    s.scriptAt = performance.now();
  },
  path(path: 'gl' | 'svg', reason = '', setupMs = 0, renderer = '') {
    s.path = path;
    s.reason = reason;
    s.setupMs = setupMs;
    s.renderer = renderer;
    if (reason) console.warn(`[intro] face path ${path}: ${reason}`);
    render();
  },
  held(delta: number) {
    if (introDebugOn) s.holdDeltas.push(delta);
  },
  hold(now: number) {
    s.holdAt = now;
  },
  start(now: number) {
    s.startAt = now;
    s.last = now;
  },
  /** One intro frame at rAF time `now`, with `workMs` of script in it. */
  frame(now: number, workMs: number) {
    if (!introDebugOn || s.done || !s.startAt) return;
    if (now > s.last) s.deltas.push(now - s.last);
    s.work.push(workMs);
    s.last = now;
    if (now - s.startAt >= WINDOW_MS) {
      s.done = true;
      render();
    } else if (s.deltas.length % 15 === 0) render();
  },
  end() {
    if (!introDebugOn) return;
    s.done = true;
    render();
  },
};
