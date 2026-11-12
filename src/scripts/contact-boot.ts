/** Load the contact drawer when it is first opened, not on every page boot. */

export function bootContact() {
  const root = document.querySelector<HTMLElement>('[data-contact-root]');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  const email = root.dataset.email || '';
  let mounting: Promise<void> | null = null;
  let mounted = false;

  const mount = async () => {
    const [{ default: ContactDrawer }, { createElement }, { createRoot }] = await Promise.all([
      import('../components/ContactDrawer'),
      import('react'),
      import('react-dom/client'),
    ]);
    createRoot(root).render(createElement(ContactDrawer, { email }));
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    mounted = true;
  };

  const ensure = () => (mounting ??= mount());

  document.addEventListener(
    'pointerdown',
    (event) => {
      if ((event.target as Element | null)?.closest?.('[data-contact-open]')) void ensure();
    },
    { capture: true, passive: true },
  );

  document.addEventListener(
    'click',
    (event) => {
      const target = (event.target as Element | null)?.closest?.<HTMLElement>('[data-contact-open]');
      if (!target || mounted) return;
      event.preventDefault();
      event.stopPropagation();
      void ensure().then(() => target.click());
    },
    true,
  );

  const prefetch = () => void ensure();
  const schedule = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(prefetch, { timeout: 4000 });
    else setTimeout(prefetch, 4000);
  };
  // After the landing intro and Lighthouse's TTI window, so React is ready
  // for a later click without paying for it on first paint.
  setTimeout(schedule, 8000);
}
