

export function canvasMode(env) {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === 'production' ? 'auth' : 'open';
  return env.NODE_ENV !== 'production' ? 'open' : 'auth';
}
