/**
 * @jest-environment node
 * @jest-environment-options {"globalsCleanup":"off"}
 */

import { NextRequest } from 'next/server';
import { GET, OPTIONS } from '@/app/api-proxy/[[...path]]/route';

describe('api proxy route', () => {
  const fetchMock = jest.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });

  it('streams videos without the Next data cache and preserves range headers', async () => {
    fetchMock.mockResolvedValue(new Response('mp4', {
      status: 206,
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Range': 'bytes 0-2/3000',
        'Content-Length': '3',
        'Accept-Ranges': 'bytes',
        ETag: '"video-v1"',
      },
    }));
    const response = await GET(new NextRequest('https://vibreo.es/api-proxy/hero-video/track1', {
      headers: { Range: 'bytes=0-2', 'If-Range': '"video-v1"', Referer: 'https://vibreo.es/' },
    }), { params: Promise.resolve({ path: ['hero-video', 'track1'] }) });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://vibreo-api.gonzalo-lopez-gil.workers.dev/hero-video/track1',
      expect.objectContaining({ cache: 'no-store', headers: expect.objectContaining({
        Range: 'bytes=0-2', 'If-Range': '"video-v1"',
      }) }),
    );
    expect(response.status).toBe(206);
    expect(response.headers.get('Content-Type')).toBe('video/mp4');
    expect(response.headers.get('Content-Range')).toBe('bytes 0-2/3000');
    expect(response.headers.get('Content-Length')).toBe('3');
    expect(response.headers.get('Accept-Ranges')).toBe('bytes');
    expect(response.headers.get('ETag')).toBe('"video-v1"');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store');
    await expect(response.text()).resolves.toBe('mp4');
  });

  it('rejects video hotlinks from an unrelated referer', async () => {
    const response = await GET(new NextRequest('https://vibreo.es/api-proxy/hero-video/track1', {
      headers: { Referer: 'https://evil.example/' },
    }), { params: Promise.resolve({ path: ['hero-video', 'track1'] }) });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('retains the public API origin requirement after the host rewrite', async () => {
    const response = await GET(new NextRequest('https://api.vibreo.es/latest'), {
      params: Promise.resolve({ path: ['latest'] }),
    });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps the exact production origin requirement on the public API hostname', async () => {
    const response = await GET(new NextRequest('https://api.vibreo.es/latest', {
      headers: { Origin: 'https://www.vibreo.es' },
    }), { params: Promise.resolve({ path: ['latest'] }) });
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://vibreo.es');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects public API preflight requests without an origin', async () => {
    const response = await OPTIONS(new NextRequest('https://api.vibreo.es/latest'));
    expect(response.status).toBe(403);
  });

  it('serves the API root health check through the Worker', async () => {
    fetchMock.mockResolvedValue(new Response('{"status":"ok"}'));
    const response = await GET(new NextRequest('https://api.vibreo.es/', {
      headers: { Origin: 'https://vibreo.es' },
    }), { params: Promise.resolve({}) });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith('https://vibreo-api.gonzalo-lopez-gil.workers.dev/',
      expect.objectContaining({ cache: 'no-store' }));
  });

  it('returns an uncached gateway error when the upstream is unreachable', async () => {
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const response = await GET(new NextRequest('https://vibreo.es/api-proxy/latest'), {
      params: Promise.resolve({ path: ['latest'] }),
    });
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error: 'upstream_unavailable' });
  });

  it('forwards allowed paths to the public API with client IP and CDN caching', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/charting/songs?limit=5', {
        headers: {
          Origin: 'https://vibreo.es',
          'X-Forwarded-For': '203.0.113.10, 198.51.100.20',
        },
      }),
      { params: Promise.resolve({ path: ['charting', 'songs'] }) },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://vibreo-api.gonzalo-lopez-gil.workers.dev/charting/songs?limit=5', {
      cache: 'force-cache',
      signal: expect.any(AbortSignal),
      headers: {
        Origin: 'https://vibreo.es',
        'X-Vibreo-Client-IP': '203.0.113.10',
      },
      next: { revalidate: 1800 },
    });
    expect(response.status).toBe(201);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://vibreo.es');
    expect(response.headers.get('Cache-Control')).toBe('public, max-age=0, must-revalidate');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('public, max-age=1800, stale-while-revalidate=300');
    expect(response.headers.get('Vary')).toBe('Origin');
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it('forwards the listener charting artifact', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/charting/listeners', {
        headers: { Origin: 'https://vibreo.es' },
      }),
      { params: Promise.resolve({ path: ['charting', 'listeners'] }) },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://vibreo-api.gonzalo-lopez-gil.workers.dev/charting/listeners', expect.objectContaining({
      next: { revalidate: 1800 },
    }));
    expect(response.status).toBe(200);
  });

  it('does not cache latest metadata through the proxy', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ songs_daily: '2026-06-09' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/latest', {
        headers: { Origin: 'https://vibreo.es' },
      }),
      { params: Promise.resolve({ path: ['latest'] }) },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://vibreo-api.gonzalo-lopez-gil.workers.dev/latest', {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
      headers: {
        Origin: 'https://vibreo.es',
        'X-Vibreo-Client-IP': 'unknown',
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store');
  });

  it.each([
    ['artist entity', ['artists', 'artist1'], 'https://vibreo-api.gonzalo-lopez-gil.workers.dev/artists/artist1'],
    ['song entity', ['songs', 'song1'], 'https://vibreo-api.gonzalo-lopez-gil.workers.dev/songs/song1'],
    ['album entity', ['albums', 'album1'], 'https://vibreo-api.gonzalo-lopez-gil.workers.dev/albums/album1'],
  ])('does not cache %s responses through the proxy', async (_label, path, expectedUrl) => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      new NextRequest(`https://vibreo.es/api-proxy/${path.join('/')}`, {
        headers: { Origin: 'https://vibreo.es' },
      }),
      { params: Promise.resolve({ path }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(expectedUrl, {
      cache: 'no-store',
      signal: expect.any(AbortSignal),
      headers: {
        Origin: 'https://vibreo.es',
        'X-Vibreo-Client-IP': 'unknown',
      },
    });
    expect(response.status).toBe(200);
    expect(response.headers.get('CDN-Cache-Control')).toBe('no-store');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store');
  });

  it('forwards one artist listener record through the proxy', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/charting/listeners/artist1', {
        headers: { Origin: 'https://vibreo.es' },
      }),
      { params: Promise.resolve({ path: ['charting', 'listeners', 'artist1'] }) },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://vibreo-api.gonzalo-lopez-gil.workers.dev/charting/listeners/artist1', expect.objectContaining({
      next: { revalidate: 1800 },
    }));
    expect(response.status).toBe(200);
  });

  it('forwards one artist charting record through the proxy', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/charting/artists/artist1', {
        headers: { Origin: 'https://vibreo.es' },
      }),
      { params: Promise.resolve({ path: ['charting', 'artists', 'artist1'] }) },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://vibreo-api.gonzalo-lopez-gil.workers.dev/charting/artists/artist1', expect.objectContaining({
      next: { revalidate: 1800 },
    }));
    expect(response.status).toBe(200);
  });

  it('forwards one artist album charting record through the proxy', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/charting/albums/artist1', {
        headers: { Origin: 'https://vibreo.es' },
      }),
      { params: Promise.resolve({ path: ['charting', 'albums', 'artist1'] }) },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://vibreo-api.gonzalo-lopez-gil.workers.dev/charting/albums/artist1', expect.objectContaining({
      next: { revalidate: 1800 },
    }));
    expect(response.status).toBe(200);
  });

  it('forwards one artist YouTube link map through the proxy', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/charting/youtube-links/artist1', {
        headers: { Origin: 'https://vibreo.es' },
      }),
      { params: Promise.resolve({ path: ['charting', 'youtube-links', 'artist1'] }) },
    );

    expect(fetchMock).toHaveBeenCalledWith('https://vibreo-api.gonzalo-lopez-gil.workers.dev/charting/youtube-links/artist1', expect.objectContaining({
      next: { revalidate: 1800 },
    }));
    expect(response.status).toBe(200);
  });

  it('forwards hero video resolution with a short cache lifetime', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ track_id: 'track-1' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/charting/hero-video?artist_ids=artist1', {
        headers: { Origin: 'https://vibreo.es' },
      }),
      { params: Promise.resolve({ path: ['charting', 'hero-video'] }) },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://vibreo-api.gonzalo-lopez-gil.workers.dev/charting/hero-video?artist_ids=artist1',
      expect.objectContaining({ next: { revalidate: 300 } }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('public, max-age=300, stale-while-revalidate=300');
  });

  it('rejects browser requests from unknown origins before contacting the API', async () => {
    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/latest', {
        headers: { Origin: 'https://evil.example' },
      }),
      { params: Promise.resolve({ path: ['latest'] }) },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://vibreo.es');
  });

  it('rejects unlisted API paths before contacting the API', async () => {
    const response = await GET(
      new NextRequest('https://vibreo.es/api-proxy/internal/users', {
        headers: { Origin: 'https://vibreo.es' },
      }),
      { params: Promise.resolve({ path: ['internal', 'users'] }) },
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(response.status).toBe(404);
  });

  it('allows preflight requests from the production origin', async () => {
    const response = await OPTIONS(
      new NextRequest('https://vibreo.es/api-proxy/latest', {
        headers: { Origin: 'https://vibreo.es' },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://vibreo.es');
    expect(response.headers.get('Access-Control-Allow-Methods')).toBe('GET, OPTIONS');
  });

  it('rejects preflight requests from unknown origins', async () => {
    const response = await OPTIONS(
      new NextRequest('https://vibreo.es/api-proxy/latest', {
        headers: { Origin: 'https://evil.example' },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('https://vibreo.es');
  });
});
