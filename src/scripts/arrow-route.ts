export const ROUTE_KEY = 'arrow-route';
export const ROUTE_SWAP_KEY = 'arrow-route-swap';

const read = (key: string) => {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key: string, value: string | null) => {
  try {
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
  }
};

export function leaveForRoute(id: string, href: string) {
  write(ROUTE_KEY, id);
  write(ROUTE_SWAP_KEY, '1');
  location.assign(href);
}

export function takeRoute() {
  const id = read(ROUTE_KEY);
  write(ROUTE_KEY, null);
  return id;
}

export function isTraverse() {
  const entry = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return entry?.type === 'back_forward';
}

type SwapEvent = Event & {
  viewTransition?: { skipTransition(): void } | null;
  activation?: { entry?: { url?: string } | null } | null;
};

export function bindRouteReturn(home = '/') {
  addEventListener('pageswap', (event) => {
    const swap = event as SwapEvent;
    if (!read(ROUTE_KEY)) return;
    const dest = swap.activation?.entry?.url;
    if (!dest) return;
    const url = new URL(dest, location.href);
    if (url.origin !== location.origin || url.pathname !== home) return;
    write(ROUTE_SWAP_KEY, '1');
    swap.viewTransition?.skipTransition();
  });
}
