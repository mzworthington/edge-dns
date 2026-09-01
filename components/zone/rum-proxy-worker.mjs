/** First-party Cloudflare Web Analytics proxy for DNS-only GitHub Pages origins. */

export const BEACON_URL = 'https://static.cloudflareinsights.com/beacon.min.js';
export const RUM_URL = 'https://cloudflareinsights.com/cdn-cgi/rum';

export function parseAllowedOrigins(raw) {
  return String(raw || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

export function corsHeaders(origin, allowedOrigins) {
  if (!origin || !allowedOrigins.includes(origin)) {
    return {};
  }
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function withCors(response, cors) {
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(cors)) {
    headers.set(key, value);
  }
  return new Response(response.body, { status: response.status, headers });
}

function rumForwardHeaders(request) {
  const headers = new Headers();
  headers.set('content-type', request.headers.get('content-type') || 'text/plain;charset=UTF-8');
  headers.set('origin', request.headers.get('Origin') || '');
  for (const name of ['referer', 'user-agent', 'accept-language']) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('True-Client-IP');
  if (ip) {
    headers.set('CF-Connecting-IP', ip);
    headers.set('X-Forwarded-For', ip);
  }
  return headers;
}

function isRumPath(pathname) {
  return pathname === '/rum' || pathname === '/cdn-cgi/rum';
}

export async function rumProxyFetch(request, allowedOrigins, fetchImpl = fetch) {
  const origin = request.headers.get('Origin') || '';
  const cors = corsHeaders(origin, allowedOrigins);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  const url = new URL(request.url);

  if (url.pathname === '/beacon.min.js' && (request.method === 'GET' || request.method === 'HEAD')) {
    const upstream = await fetchImpl(BEACON_URL, {
      method: request.method,
      headers: { Accept: 'text/javascript,*/*' },
    });
    const headers = new Headers();
    headers.set('Content-Type', upstream.headers.get('Content-Type') || 'text/javascript;charset=UTF-8');
    headers.set('Cache-Control', 'public, max-age=86400');
    headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    for (const [key, value] of Object.entries(cors)) {
      headers.set(key, value);
    }
    const body = request.method === 'HEAD' ? null : upstream.body;
    return new Response(body, { status: upstream.status, headers });
  }

  if (isRumPath(url.pathname) && request.method === 'POST') {
    if (!cors['Access-Control-Allow-Origin']) {
      return new Response('Forbidden', { status: 403, headers: cors });
    }
    const headers = rumForwardHeaders(request);
    const rumTarget = new URL(RUM_URL);
    rumTarget.search = url.search;
    const upstream = await fetchImpl(rumTarget.toString(), {
      method: 'POST',
      headers,
      body: request.body,
    });
    const body = upstream.status === 204 || upstream.status === 205 ? null : upstream.body;
    return withCors(new Response(body, { status: upstream.status }), cors);
  }

  return new Response('Not found', { status: 404, headers: cors });
}

export default {
  async fetch(request, env) {
    return rumProxyFetch(request, parseAllowedOrigins(env?.ALLOWED_ORIGINS));
  },
};
