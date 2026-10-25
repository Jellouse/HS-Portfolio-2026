// Shared by the server (stock API) and the detail-page Buy button.
export const serialLabel = (code, serial) => `IB-${code}-${String(serial).padStart(3, '0')}`;
/** s = one product from /api/shop/stock, or undefined when the API is down. */
export const buyLabel = (s) => (!s || typeof s !== 'object' ? 'Buy' : s.soldOut ? 'Sold out' : s.label ? `Buy: ${s.label}` : 'Buy');

/** Applies the live state to the button. Keeps "Buy" (enabled) on any missing data. */
export function applyStock(button, slug, data) {
  const s = data && !data.error ? data[slug] : undefined;
  button.textContent = buyLabel(s);
  button.disabled = Boolean(s?.soldOut);
  if (s?.soldOut) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}
