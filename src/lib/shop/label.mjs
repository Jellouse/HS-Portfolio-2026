
export const serialLabel = (code, serial) => `IB-${code}-${String(serial).padStart(3, '0')}`;

export const buyLabel = (s) => (!s || typeof s !== 'object' ? 'Buy' : s.soldOut ? 'Sold out' : s.label ? `Buy: ${s.label}` : 'Buy');

export function applyStock(button, slug, data) {
  const s = data && !data.error ? data[slug] : undefined;
  button.textContent = buyLabel(s);
  button.disabled = Boolean(s?.soldOut);
  if (s?.soldOut) button.setAttribute('aria-disabled', 'true');
  else button.removeAttribute('aria-disabled');
}
