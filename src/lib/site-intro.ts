const KEY = 'hs-site-intro-done';

export function siteIntroSeen(): boolean {
  if (typeof sessionStorage === 'undefined') return false;
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markSiteIntroSeen(): void {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {}
}
