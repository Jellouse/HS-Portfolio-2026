import { makeHandler } from '@keystatic/astro/api';
import { getSecret } from 'astro:env/server';
import type { APIRoute } from 'astro';
import config from '../../../../keystatic.config';

export const prerender = false;

function firstHeader(request: Request, name: string): string | undefined {
  const value = request.headers.get(name);
  if (!value) return undefined;
  const first = value.split(',')[0]?.trim();
  return first || undefined;
}

function splitHost(host: string): { hostname: string; port?: string } {
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    const hostname = end === -1 ? host : host.slice(0, end + 1);
    const rest = end === -1 ? '' : host.slice(end + 1);
    return { hostname, port: rest.startsWith(':') ? rest.slice(1) : undefined };
  }
  const colon = host.lastIndexOf(':');
  if (colon > -1 && /^\d+$/.test(host.slice(colon + 1))) {
    return { hostname: host.slice(0, colon), port: host.slice(colon + 1) };
  }
  return { hostname: host };
}

function requestWithPublicUrl(request: Request): Request {
  const host = firstHeader(request, 'x-forwarded-host') ?? firstHeader(request, 'host');
  if (!host || /[/\\\s]/.test(host)) return request;

  const url = new URL(request.url);
  const forwardedProto = firstHeader(request, 'x-forwarded-proto')?.toLowerCase();
  const proto =
    forwardedProto === 'http' || forwardedProto === 'https'
      ? forwardedProto
      : url.protocol.replace(/:$/, '');
  const { hostname, port } = splitHost(host);
  url.protocol = `${proto}:`;
  url.hostname = hostname;
  url.port = port ?? '';

  return new Request(url, request);
}

export const ALL: APIRoute = (context) => {
  const handler = makeHandler({
    config,
    clientId: getSecret('KEYSTATIC_GITHUB_CLIENT_ID'),
    clientSecret: getSecret('KEYSTATIC_GITHUB_CLIENT_SECRET'),
    secret: getSecret('KEYSTATIC_SECRET'),
  });
  return handler({
    request: requestWithPublicUrl(context.request),
  });
};
