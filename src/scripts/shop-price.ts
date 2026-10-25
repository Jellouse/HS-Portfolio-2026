// Live prices from the shop DB (/admin is the one source). The static HTML carries the
// seed price, so a slow or missing API (no DATABASE_URL yet) still shows a price.
type Stock = Record<string, { price_cents?: number }> | null;

export function applyPrices(data: Stock) {
  if (!data || 'error' in data) return;
  document.querySelectorAll<HTMLElement>('[data-price]').forEach((el) => {
    const cents = data[el.dataset.price!]?.price_cents;
    if (typeof cents !== 'number') return;
    const eur = cents / 100;
    const n = Number.isInteger(eur) ? String(eur) : eur.toFixed(2);
    el.textContent = el.dataset.priceStyle === 'prefix' ? `€${n}` : `${n}€`;
  });
}

export async function refreshPrices() {
  try {
    const res = await fetch('/api/shop/stock', { signal: AbortSignal.timeout(4000) });
    applyPrices(res.ok ? await res.json() : null);
  } catch {
    // Keep the static price.
  }
}

// Messages after /api/shop/buy sends the visitor back (?checkout=soon|soldout|error).
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
