// Pan-and-zoom board of live iframes. Vanilla TS.
type Page = { name: string; path: string };
type Width = { w: number; vh: number };
type Frame = { el: HTMLDivElement; box: HTMLDivElement; src: string; w: number; h: number; row: number; col: number; iframe?: HTMLIFrameElement };

const GAP_X = 80;
const GAP_Y = 160;
const GROUP_GAP = 240;
const LABEL = 32;
const MIN = 0.005;
const MAX = 4;

export function mountCanvas() {
  const data = JSON.parse(document.getElementById('canvas-data')!.textContent || '{}') as { pages: Page[]; widths: Width[] };
  const board = document.getElementById('board') as HTMLDivElement;
  const world = document.getElementById('world') as HTMLDivElement;
  const zoomEl = document.getElementById('zoom')!;
  const q = new URLSearchParams(location.search);
  const hosts = [
    { label: location.host, origin: location.origin },
    ...(q.get('compare') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const u = new URL(/^https?:\/\//.test(s) ? s : `https://${s}`);
        return { label: u.host, origin: u.origin };
      }),
  ];

  const frames: Frame[] = [];
  // Columns: each page is a group (1440 then 390, top-aligned), groups left to right.
  // Rows: this host first, compared hosts below in the same column order.
  const cols: { x: number; w: number; vh: number; page: Page }[] = [];
  let x = 0;
  data.pages.forEach((page, pi) => {
    if (pi > 0) x += GROUP_GAP - GAP_X;
    for (const width of data.widths) {
      cols.push({ x, w: width.w, vh: width.vh, page });
      x += width.w + GAP_X;
    }
  });
  const rowLabels: HTMLDivElement[] = [];
  hosts.forEach((host, row) => {
    if (hosts.length > 1) {
      const g = document.createElement('div');
      g.className = 'group-label';
      g.textContent = host.label;
      g.style.left = '0px';
      world.appendChild(g);
      rowLabels.push(g);
    }
    cols.forEach((col, ci) => {
      const page = col.page;
      const el = document.createElement('div');
      el.className = 'frame';
      const label = document.createElement('a');
      label.className = 'frame-label';
      label.href = host.origin + page.path;
      label.target = '_blank';
      label.rel = 'noopener';
      label.textContent = `${page.name} · ${col.w}${hosts.length > 1 ? ` · ${host.label}` : ''}`;
      const box = document.createElement('div');
      box.className = 'frame-box';
      el.append(label, box);
      world.appendChild(el);
      const sep = page.path.includes('?') ? '&' : '?';
      frames.push({ el, box, src: `${host.origin}${page.path}${sep}canvas=1&vh=${col.vh}`, w: col.w, h: col.vh, row, col: ci });
    });
  });

  const ROW_HEAD = hosts.length > 1 ? 48 : 0;
  const layout = () => {
    let y = 0;
    for (let row = 0; row < hosts.length; row++) {
      const inRow = frames.filter((f) => f.row === row);
      const rowH = Math.max(...inRow.map((f) => f.h));
      if (rowLabels[row]) rowLabels[row].style.top = `${y - LABEL - ROW_HEAD}px`;
      for (const f of inRow) {
        f.el.style.left = `${cols[f.col].x}px`;
        f.el.style.top = `${y}px`;
        f.box.style.width = `${f.w}px`;
        f.box.style.height = `${f.h}px`;
      }
      y += rowH + GAP_Y + LABEL + ROW_HEAD;
    }
    bounds = { w: x - GAP_X, h: y - GAP_Y - LABEL - ROW_HEAD };
  };
  let bounds = { w: 0, h: 0 };

  // view
  let s = 1;
  let tx = 0;
  let ty = 0;
  const apply = () => {
    world.style.transform = `translate(${tx}px,${ty}px) scale(${s})`;
    zoomEl.textContent = `${Math.round(s * 100)}%`;
  };
  const zoomAt = (ns: number, cx: number, cy: number) => {
    ns = Math.min(MAX, Math.max(MIN, ns));
    tx = cx - ((cx - tx) * ns) / s;
    ty = cy - ((cy - ty) * ns) / s;
    s = ns;
    apply();
  };
  const pad = 48;
  const top = () => pad + LABEL + ROW_HEAD;
  // 0: whole board width, top-aligned (frames are tall; scroll down to see more).
  const fit = () => {
    s = Math.min(MAX, Math.max(MIN, (innerWidth - pad * 2) / bounds.w));
    tx = (innerWidth - bounds.w * s) / 2;
    ty = top() * Math.min(1, s * 4);
    apply();
  };
  // Initial: the first screen (900 px tall) of every frame fits the viewport height.
  const firstScreen = () => {
    const sh = (innerHeight - top() - pad) / data.widths[0].vh;
    s = Math.min(1, Math.max(MIN, sh));
    tx = pad;
    ty = top();
    apply();
  };
  const actual = () => zoomAt(1, innerWidth / 2, innerHeight / 2);

  // iframe heights
  // Interact mode: frames take the pointer only when on (button / I) or while Alt is held.
  const hint = document.getElementById('interact') as HTMLButtonElement;
  let interact = false;
  const setInteract = (on: boolean) => {
    interact = on;
    document.body.classList.toggle('interact', on);
    hint.textContent = `Interact: ${on ? 'on' : 'off'} (I, or hold ⌥)`;
    hint.setAttribute('aria-pressed', String(on));
    if (!on && document.activeElement instanceof HTMLIFrameElement) document.activeElement.blur();
  };
  hint.addEventListener('click', () => setInteract(!interact));
  setInteract(false);
  const setAlt = (on: boolean) => document.body.classList.toggle('alt', on);
  addEventListener('blur', () => setAlt(false));
  board.addEventListener('pointermove', (e) => { if (!e.altKey) setAlt(false); });

  addEventListener('message', (e) => {
    const d = e.data;
    if (d && d.type === 'canvas-escape') { setInteract(false); setAlt(false); return; }
    if (!d || d.type !== 'canvas-height' || typeof d.h !== 'number') return;
    const f = frames.find((fr) => fr.iframe && fr.iframe.contentWindow === e.source);
    if (!f || Math.abs(f.h - d.h) < 2) return;
    f.h = Math.max(f.h, Math.min(d.h, 40000));
    layout();
  });

  // lazy mount near the viewport
  const io = new IntersectionObserver(
    (entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const f = frames.find((fr) => fr.box === en.target);
        if (!f || f.iframe) continue;
        const iframe = document.createElement('iframe');
        iframe.src = f.src;
        iframe.loading = 'eager';
        iframe.title = f.src;
        f.box.appendChild(iframe);
        f.iframe = iframe;
        io.unobserve(f.box);
      }
    },
    { rootMargin: '100%' },
  );
  frames.forEach((f) => io.observe(f.box));

  // pan
  let panning = false;
  let space = false;
  let last = { x: 0, y: 0 };
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { d: number; s: number } | null = null;
  board.addEventListener('pointerdown', (e) => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), s };
      document.body.classList.add('pinch');
      return;
    }
    if ((e.target as HTMLElement).closest('.frame-label') && !space) return;
    panning = true;
    last = { x: e.clientX, y: e.clientY };
    board.classList.add('is-panning');
    board.setPointerCapture(e.pointerId);
  });
  board.addEventListener('pointermove', (e) => {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      zoomAt((pinch.s * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d, (a.x + b.x) / 2, (a.y + b.y) / 2);
      return;
    }
    if (!panning) return;
    tx += e.clientX - last.x;
    ty += e.clientY - last.y;
    last = { x: e.clientX, y: e.clientY };
    apply();
  });
  const end = (e: PointerEvent) => {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) {
      pinch = null;
      document.body.classList.remove('pinch');
    }
    panning = false;
    board.classList.remove('is-panning');
  };
  board.addEventListener('pointerup', end);
  board.addEventListener('pointercancel', end);

  board.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(s * Math.exp(-e.deltaY * 0.01), e.clientX, e.clientY);
      } else {
        tx -= e.deltaX;
        ty -= e.deltaY;
        apply();
      }
    },
    { passive: false },
  );

  addEventListener('keydown', (e) => {
    if (e.target instanceof HTMLInputElement) return;
    if (e.key === 'Escape') setInteract(false);
    else if ((e.key === 'i' || e.key === 'I') && !e.metaKey && !e.ctrlKey) setInteract(!interact);
    else if (e.key === 'Alt') setAlt(true);
    else if (e.code === 'Space') {
      space = true;
      document.body.classList.add('space');
      e.preventDefault();
    } else if (e.key === '+' || e.key === '=') zoomAt(s * 1.25, innerWidth / 2, innerHeight / 2);
    else if (e.key === '-' || e.key === '_') zoomAt(s / 1.25, innerWidth / 2, innerHeight / 2);
    else if (e.key === '0') fit();
    else if (e.key === '1') actual();
  });
  addEventListener('keyup', (e) => {
    if (e.key === 'Alt') setAlt(false);
    if (e.code === 'Space') {
      space = false;
      document.body.classList.remove('space');
    }
  });
  // Pan with space anywhere: a transparent shield is unnecessary since iframes ignore pointers while space is held.

  layout();
  firstScreen();
  (window as unknown as { __canvas: unknown }).__canvas = { fit, actual, zoomAt, frames, get s() { return s; }, set view(v: { s: number; tx: number; ty: number }) { s = v.s; tx = v.tx; ty = v.ty; apply(); } };
}
