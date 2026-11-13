/**
 * Arrow screens that are their own page (an arrow node with an href).
 *
 * The arrow page flies its controls to the route screen with travel(), the
 * same live animation every other button uses, and only then opens the page.
 * The route screen is laid out like that page, so the document swap itself
 * shows nothing new and its view transition is skipped. Going back, the arrow
 * page opens on the route screen and flies the controls home again.
 *
 * Base.astro reads ROUTE_SWAP_KEY in its inline pagereveal and pageswap
 * listeners. Keep the strings in step.
 */
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
    /* private mode */
  }
};

/** The arrow page is about to open a route screen's page. */
export function leaveForRoute(id: string, href: string) {
  write(ROUTE_KEY, id);
  write(ROUTE_SWAP_KEY, '1');
  location.assign(href);
}

/** The route screen the arrow page last left for, cleared once read. */
export function takeRoute() {
  const id = read(ROUTE_KEY);
  write(ROUTE_KEY, null);
  return id;
}

/** True when this load is a back or forward step through history. */
export function isTraverse() {
  const entry = performance.getEntriesByType?.('navigation')[0] as PerformanceNavigationTiming | undefined;
  return entry?.type === 'back_forward';
}

type SwapEvent = Event & {
  viewTransition?: { skipTransition(): void } | null;
  activation?: { entry?: { url?: string } | null } | null;
};

/**
 * On a route page. When the visitor goes back to the arrow page that opened
 * it, the document swap is skipped so the arrow page can fly the controls
 * back itself.
 */
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
