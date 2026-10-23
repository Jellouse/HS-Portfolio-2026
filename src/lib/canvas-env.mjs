// /canvas is a review board. Dev and Vercel previews: open (previews already sit behind
// Vercel login). Production: only for GitHub users with push access to the repo, using
// the Keystatic GitHub session (see src/lib/canvas-auth.mjs).
/** @param {Record<string, string | undefined>} env @returns {'open' | 'auth'} */
export function canvasMode(env) {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production' ? 'auth' : 'open';
  return env.NODE_ENV !== 'production' ? 'open' : 'auth';
}
