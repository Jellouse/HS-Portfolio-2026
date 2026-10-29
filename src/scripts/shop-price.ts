

type Stock = Record<string, { price_cents?: number }> | null;

export function applyPrices(data: Stock) {
  if (!data || 'error' in data) return;
  document.querySelectorAll<HTMLElement>('[data-price]').forEach((el) => {
    const cents = data[el.dataset.price!]?.price_cents;
    if (typeof cents !== 'number') return;
    const eur = cents / 100;
    const n = Number.isInteger(eur) ? String(eur) : eur.toFixed(2);
    const text = el.dataset.priceStyle === 'prefix' ? `€${n}` : `${n}€`;
    if (el.textContent === text) return;
    el.textContent = text;

    el.classList.remove('price-swap');
    void el.offsetWidth;
    el.classList.add('price-swap');
    el.addEventListener('animationend', () => el.classList.remove('price-swap'), { once: true });
  });
}

export async function refreshPrices() {
  try {
    const res = await fetch('/api/shop/stock', { signal: AbortSignal.timeout(4000) });
    applyPrices(res.ok ? await res.json() : null);
  } catch {

  }
}

const NOTES: Record<string, string> = {
  soon: 'Checkout opens soon.',
  soldout: 'Sold out.',
  error: 'Checkout is not available right now. Please try again later.',
};
export function showBuyNote() {
  const el = document.querySelector<HTMLElement>('[data-buy-note]');
  const key = new URL(location.href).searchParams.get('checkout') || '';
  if (!el || !NOTES[key]) return;
  el.textContent = NOTES[key];
  el.hidden = false;
  el.setAttribute('role', 'status');
}
