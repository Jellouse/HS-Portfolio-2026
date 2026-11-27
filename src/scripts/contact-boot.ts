export function bootContact() {
  const root = document.querySelector<HTMLElement>('[data-contact-root]');
  if (!root || root.dataset.bound === '1') return;
  root.dataset.bound = '1';
  const email = root.dataset.email || '';
  let mounting: Promise<void> | null = null;

  // The drawer sets this once its document listeners are installed.
  const ready = () => document.documentElement.hasAttribute('data-contact-ready');

  const settle = () =>
    new Promise<void>((done) => {
      const started = performance.now();
      const tick = () => {
        if (ready() || performance.now() - started > 3000) done();
        else requestAnimationFrame(tick);
      };
      tick();
    });

  const mount = async () => {
    const [{ default: ContactDrawer }, { createElement }, { createRoot }] = await Promise.all([
      import('../components/ContactDrawer'),
      import('react'),
      import('react-dom/client'),
    ]);
    createRoot(root).render(createElement(ContactDrawer, { email }));
    await settle();
  };

  const ensure = () =>
    (mounting ??= mount().catch((error) => {
      mounting = null;
      throw error;
    }));

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
      if (!target || ready()) return;
      event.preventDefault();
      event.stopPropagation();
      void ensure()
        .then(() => target.click())
        .catch(() => {});
    },
    true,
  );

  const prefetch = () => void ensure().catch(() => {});
  const schedule = () => {
    if ('requestIdleCallback' in window) window.requestIdleCallback(prefetch, { timeout: 4000 });
    else setTimeout(prefetch, 4000);
  };
  setTimeout(schedule, 8000);
}
