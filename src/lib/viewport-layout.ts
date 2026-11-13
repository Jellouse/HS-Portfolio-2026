
export function stableViewportHeight(probe: HTMLElement, vw: number): number {
  const root = document.documentElement;
  const wAttr = 'data-layout-vw';
  const hAttr = 'data-layout-vh';
  if (root.getAttribute(wAttr) !== String(vw)) {
    root.setAttribute(wAttr, String(vw));
    const h = Math.round(Math.max(window.innerHeight, probe.getBoundingClientRect().height));
    root.setAttribute(hAttr, String(h));
    return h;
  }
  const stored = Number(root.getAttribute(hAttr));
  if (stored > 0) return stored;
  return Math.round(probe.getBoundingClientRect().height);
}

export function clearStableViewportHeight() {
  document.documentElement.removeAttribute('data-layout-vw');
  document.documentElement.removeAttribute('data-layout-vh');
}

export type AppView = {
  top: number;
  left: number;
  width: number;
  height: number;
  inset: boolean;
};

type ViewBox = {
  offsetTop: number;
  offsetLeft: number;
  width: number;
  height: number;
};

/** How much the visual viewport may differ from the small viewport before we treat it as an inset. */
const VIEW_SLACK = 1;

/**
 * The visible area the arrow-nav stage should fill.
 *
 * When an overlay (the X in-app tweet sheet, the compact URL bar) makes the
 * visual viewport shorter than 100svh, use that visible height so the stage
 * is not centred in a taller box and left sitting too low. When the visual
 * viewport is taller than 100svh (mobile Safari hiding its URL bar), keep
 * 100svh so the designed layout does not jump.
 */
export function visibleAppView(
  view: ViewBox | null | undefined,
  svh: number,
  layout: { width: number; height: number },
): AppView {
  const svhH = Math.max(1, Math.round(svh));
  const layoutW = Math.max(1, Math.round(layout.width));
  if (!view) {
    return { top: 0, left: 0, width: layoutW, height: svhH, inset: false };
  }
  const top = Math.max(0, Math.round(view.offsetTop));
  const left = Math.max(0, Math.round(view.offsetLeft));
  const width = Math.max(1, Math.round(view.width));
  const vvH = Math.max(1, Math.round(view.height));
  const height = vvH < svhH - VIEW_SLACK ? vvH : svhH;
  const inset = top > 0 || left > 0 || height < svhH - VIEW_SLACK || width < layoutW - VIEW_SLACK;
  return {
    top: inset ? top : 0,
    left: inset ? left : 0,
    width: inset ? width : layoutW,
    height,
    inset,
  };
}

export function applyAppView(view: AppView, root: HTMLElement = document.documentElement) {
  if (view.inset) {
    root.style.setProperty('--app-vt', `${view.top}px`);
    root.style.setProperty('--app-vl', `${view.left}px`);
    root.style.setProperty('--app-vw', `${view.width}px`);
    root.style.setProperty('--app-vh', `${view.height}px`);
    root.setAttribute('data-app-inset', '');
  } else {
    root.style.removeProperty('--app-vt');
    root.style.removeProperty('--app-vl');
    root.style.removeProperty('--app-vw');
    root.style.removeProperty('--app-vh');
    root.removeAttribute('data-app-inset');
  }
}


export function measureAppView(): AppView {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:0;left:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
  document.body.append(probe);
  const view = visibleAppView(window.visualViewport, probe.getBoundingClientRect().height, {
    width: document.documentElement.clientWidth || window.innerWidth,
    height: window.innerHeight,
  });
  probe.remove();
  return view;
}

export function syncAppViewport(): AppView {
  const view = measureAppView();
  applyAppView(view);
  return view;
}

export function bindAppViewport(onChange?: (view: AppView) => void): () => void {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:absolute;top:0;left:0;width:1px;height:100svh;visibility:hidden;pointer-events:none';
  document.body.append(probe);

  const sync = () => {
    const view = visibleAppView(window.visualViewport, probe.getBoundingClientRect().height, {
      width: document.documentElement.clientWidth || window.innerWidth,
      height: window.innerHeight,
    });
    applyAppView(view);
    onChange?.(view);
  };

  const vv = window.visualViewport;
  vv?.addEventListener('resize', sync);
  vv?.addEventListener('scroll', sync);
  window.addEventListener('resize', sync);
  sync();
  return () => {
    vv?.removeEventListener('resize', sync);
    vv?.removeEventListener('scroll', sync);
    window.removeEventListener('resize', sync);
    probe.remove();
  };
}
