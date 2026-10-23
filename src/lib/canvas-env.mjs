// /canvas is a review board: dev and Vercel preview only, never production.
/** @param {Record<string, string | undefined>} env */
export function canvasEnabled(env) {
  if (env.VERCEL_ENV) return env.VERCEL_ENV !== 'production';
  return env.NODE_ENV !== 'production' || env.CANVAS === '1';
}
