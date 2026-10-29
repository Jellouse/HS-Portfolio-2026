import { defineMiddleware } from 'astro:middleware';
import { RETURN_COOKIE, TOKEN_COOKIE } from './lib/canvas-auth.mjs';

export const onRequest = defineMiddleware((context, next) => {
  if (context.isPrerendered) return next();
  const path = context.url.pathname.replace(/\/$/, '');
  if (path === '/keystatic' && context.cookies.has(RETURN_COOKIE) && context.cookies.has(TOKEN_COOKIE)) {
    context.cookies.delete(RETURN_COOKIE, { path: '/' });
    return context.redirect('/canvas', 302);
  }
  return next();
});
