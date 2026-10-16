// Public read-only front for the humansize-media R2 bucket.
// - GET/HEAD only, with Range support (video players request byte ranges)
// - 300 requests/minute per IP via the free rate-limiting binding
// - long immutable caching; on a custom domain the Cache API also keeps repeat views off R2
//   (on *.workers.dev the Cache API is a no-op, the browser/CDN cache headers still apply)

const CACHE = 'public, max-age=31536000, immutable';

export default {
  async fetch(request, env, ctx) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405, headers: { allow: 'GET, HEAD' } });
    }

    const ip = request.headers.get('cf-connecting-ip') ?? 'unknown';
    const { success } = await env.PER_IP.limit({ key: ip });
    if (!success) return new Response('Too many requests', { status: 429, headers: { 'retry-after': '60' } });

    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.slice(1));
    if (!key || key.endsWith('/')) return new Response('Not found', { status: 404 });

    // whole-file GETs can be served from the edge cache (custom domain only)
    const cache = caches.default;
    const ranged = request.headers.has('range');
    if (!ranged && request.method === 'GET') {
      const hit = await cache.match(request);
      if (hit) return hit;
    }

    const object =
      request.method === 'HEAD'
        ? await env.MEDIA.head(key)
        : await env.MEDIA.get(key, { range: request.headers, onlyIf: request.headers });
    if (!object) return new Response('Not found', { status: 404 });

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('cache-control', CACHE);
    headers.set('accept-ranges', 'bytes');
    headers.set('access-control-allow-origin', '*');

    if (request.method === 'HEAD' || !('body' in object) || !object.body) {
      headers.set('content-length', String(object.size));
      return new Response(null, { status: 'body' in object ? 304 : 200, headers });
    }

    if (ranged && object.range) {
      const { offset = 0, length = object.size - offset } = object.range;
      headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
      headers.set('content-length', String(length));
      return new Response(object.body, { status: 206, headers });
    }

    headers.set('content-length', String(object.size));
    const response = new Response(object.body, { status: 200, headers });
    if (request.method === 'GET') ctx.waitUntil(cache.put(request, response.clone()));
    return response;
  },
};
