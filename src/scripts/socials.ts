
export function initSocials() {
  const btn = document.querySelector<HTMLButtonElement>('[data-socials-toggle]');
  const socials = document.querySelector<HTMLElement>('[data-socials]');
  const menu = document.querySelector<HTMLElement>('[data-main-menu]');
  const header = btn?.closest<HTMLElement>('.site-header');
  if (!btn || !socials || !menu || !header) return;
  const FAR = 160;
  const SCROLL = 80;
  let openY = 0;

  const set = (open: boolean) => {
    if (open === (btn.getAttribute('aria-expanded') === 'true')) return;
    btn.setAttribute('aria-expanded', String(open));
    socials.hidden = !open;
    menu.hidden = open;
    header.classList.toggle('is-socials', open);
    header.classList.add('did-swap');
    openY = scrollY;
  };
  btn.addEventListener('click', () => set(btn.getAttribute('aria-expanded') !== 'true'));
  header.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || btn.getAttribute('aria-expanded') !== 'true') return;
    set(false);
    btn.focus();
  });
  addEventListener('scroll', () => Math.abs(scrollY - openY) > SCROLL && set(false), { passive: true });
  addEventListener(
    'pointermove',
    (e) => {
      if (e.pointerType === 'touch' || btn.getAttribute('aria-expanded') !== 'true') return;
      const r = header.getBoundingClientRect();
      const dx = Math.max(r.left - e.clientX, 0, e.clientX - r.right);
      const dy = Math.max(r.top - e.clientY, 0, e.clientY - r.bottom);
      if (Math.hypot(dx, dy) > FAR) set(false);
    },
    { passive: true },
  );
}
