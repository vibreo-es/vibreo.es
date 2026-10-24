import { NextRequest, NextResponse } from 'next/server';

// Keep the upstream independent of api.vibreo.es, which is served by this proxy.
const API_ORIGIN = 'https://vibreo-api.gonzalo-lopez-gil.workers.dev';
const PUBLIC_ORIGIN = 'https://vibreo.es';

const ALLOWED_API_PATHS = [
  /^\/$/,
  /^\/health$/,
  /^\/hero-video\/[a-z0-9]+$/i,
  /^\/latest$/,
  /^\/search$/,
  /^\/charting\/hero-video$/,
  /^\/charting\/(?:songs|artists|albums|listeners|market-streams|youtube-links|artist-channels)$/,
  /^\/charting\/artists\/[a-z0-9]+$/i,
  /^\/charting\/albums\/[a-z0-9]+$/i,
  /^\/charting\/youtube-links\/[a-z0-9]+$/i,
  /^\/charting\/listeners\/[a-z0-9]+$/i,
  /^\/charts\/(?:songs\/daily|artists\/daily|albums\/weekly)\/[a-z0-9-]+\/(?:latest|\d{4}-\d{2}-\d{2})$/i,
  /^\/(?:songs|artists|albums)\/[a-z0-9]+$/i,
];

function allowedOrigins() {
  const origins = new Set([PUBLIC_ORIGIN, 'https://www.vibreo.es']);
  const vercelUrl = process.env.VERCEL_URL;

  if (vercelUrl) {
    origins.add(vercelUrl.startsWith('http') ? vercelUrl : `https://${vercelUrl}`);
  }

  if (process.env.NODE_ENV !== 'production') {
    origins.add('http://localhost:3000');
    origins.add('http://127.0.0.1:3000');
  }

  return origins;
}

function isAllowedOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  return !origin || allowedOrigins().has(origin);
}

function corsOrigin(request: NextRequest) {
  const origin = request.headers.get('origin');
  return origin && allowedOrigins().has(origin) ? origin : PUBLIC_ORIGIN;
}

function corsHeaders(request: NextRequest) {
  return {
    'Access-Control-Allow-Origin': corsOrigin(request),
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Range, If-Range',
    'Access-Control-Expose-Headers': 'Accept-Ranges, Content-Range, Content-Length, ETag',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

function isAllowedApiPath(path: string) {
  return ALLOWED_API_PATHS.some((pattern) => pattern.test(path));
}

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwardedFor || request.headers.get('x-real-ip') || 'unknown';
}

function upstreamHeaders(request: NextRequest): HeadersInit {
  const headers: Record<string, string> = {
    Origin: PUBLIC_ORIGIN,
    'X-Vibreo-Client-IP': getClientIp(request),
  };
  const proxySecret = process.env.VIBREO_API_PROXY_SECRET;

  if (proxySecret) {
    headers['X-Vibreo-Proxy-Secret'] = proxySecret;
  }

  for (const name of ['Range', 'If-Range']) {
    const value = request.headers.get(name);
    if (value) headers[name] = value;
  }

  return headers;
}

function revalidateSeconds(path: string): number {
  if (path === '/latest') return 60;
  if (path === '/search') return 300;
  if (path.startsWith('/charts/')) return 3600;
  if (path === '/charting/hero-video') return 300;
  if (path.startsWith('/charting/')) return 1800;
  return 86400;
}

function isMutableEntityPath(path: string): boolean {
  return /^\/(?:songs|artists|albums)\/[a-z0-9]+$/i.test(path);
}

function shouldBypassCache(path: string): boolean {
  return path === '/' || path === '/health' || path === '/latest' || isMutableEntityPath(path);
}

function cdnCacheControl(path: string, status: number): string {
  if (status >= 400) return 'no-store';
  if (shouldBypassCache(path)) return 'no-store';
  const ttl = revalidateSeconds(path);
  return `public, max-age=${ttl}, stale-while-revalidate=${Math.min(ttl, 300)}`;
}

export async function OPTIONS(request: NextRequest) {
  if (!isAllowedOrigin(request)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: corsHeaders(request) });
  }

  return new NextResponse(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path?: string[] }> },
) {
  const { path } = await params;
  const apiPath = '/' + (path ?? []).join('/');
  const isVideo = apiPath.startsWith('/hero-video/');
  const isPublicApiHost = request.nextUrl.hostname === 'api.vibreo.es'
    || request.headers.get('host') === 'api.vibreo.es';
  const referer = request.headers.get('referer');
  let allowedReferer = true;
  if (isVideo && referer) {
    try {
      allowedReferer = allowedOrigins().has(new URL(referer).origin);
    } catch {
      allowedReferer = false;
    }
  }
  const queryString = request.nextUrl.search;
  const url = `${API_ORIGIN}${apiPath}${queryString}`;

  if (!isAllowedOrigin(request) || !allowedReferer
    || (isPublicApiHost && !isVideo && !request.headers.get('origin'))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403, headers: corsHeaders(request) });
  }

  if (!isAllowedApiPath(apiPath)) {
    return NextResponse.json({ error: 'not_found' }, { status: 404, headers: corsHeaders(request) });
  }

  const fetchOptions: RequestInit & { next?: { revalidate: number } } = (isVideo || shouldBypassCache(apiPath))
    ? {
        headers: upstreamHeaders(request),
        cache: 'no-store',
      }
    : {
        headers: upstreamHeaders(request),
        cache: 'force-cache',
        next: { revalidate: revalidateSeconds(apiPath) },
      };

  let res: Response;
  try {
    res = await fetch(url, { ...fetchOptions, signal: AbortSignal.timeout(15_000) });
  } catch {
    return NextResponse.json({ error: 'upstream_unavailable' }, {
      status: 502,
      headers: { ...corsHeaders(request), 'Cache-Control': 'no-store' },
    });
  }

  const upstreamResponseHeaders: Record<string, string> = {};
  for (const name of ['Retry-After', 'X-RateLimit-Limit', 'X-RateLimit-Window']) {
    const value = res.headers.get(name);
    if (value) upstreamResponseHeaders[name] = value;
  }
  if (isVideo) {
    for (const name of ['Content-Length', 'Content-Range', 'Accept-Ranges', 'ETag', 'Last-Modified']) {
      const value = res.headers.get(name);
      if (value) upstreamResponseHeaders[name] = value;
    }
  }
  // Run origin/referer checks for every public API and media request. Never
  // populate a complete-response cache with a partial video response.
  const cdnCache = isPublicApiHost || isVideo || request.headers.has('range') || res.status === 206
    ? 'no-store' : cdnCacheControl(apiPath, res.status);

  return new NextResponse(res.body, {
    status: res.status,
    headers: {
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
      'Cache-Control': res.status >= 400 ? 'no-store'
        : isVideo ? 'private, max-age=86400' : 'public, max-age=0, must-revalidate',
      'CDN-Cache-Control': cdnCache,
      'Vercel-CDN-Cache-Control': cdnCache,
      'X-Content-Type-Options': 'nosniff',
      ...upstreamResponseHeaders,
      ...corsHeaders(request),
    },
  });
}
