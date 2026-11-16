/**
 * @jest-environment node
 * @jest-environment-options {"globalsCleanup":"off"}
 */
import { NextRequest } from 'next/server';
import { GET } from '@/app/api-proxy/[[...path]]/route';

const url = 'https://vibreo.es/api-proxy/charting/youtube-links';
const catalog = { 'spotify:track:track1': { v: 'correct-video' } };
const validResponse = () => Response.json(catalog);
const get = (request = new NextRequest(url)) => GET(request, {
  params: Promise.resolve({ path: ['charting', 'youtube-links'] }),
});

describe('complete catalogue delivery', () => {
  const fetchMock = jest.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    global.fetch = fetchMock;
  });
  afterEach(() => jest.useRealTimers());

  it('delivers a complete catalogue larger than the data cache and buffered payload limits', async () => {
    const large = { ...catalog, 'spotify:track:large': { m: 'x'.repeat(5 * 1024 * 1024) } };
    fetchMock.mockResolvedValue(Response.json(large));
    const response = await get();
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ cache: 'no-store' }));
    expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('next');
    expect(response.status).toBe(200);
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toContain('max-age=1800');
    await expect(response.json()).resolves.toEqual(large);
  });

  it('finishes a body that takes longer than the former 15-second deadline', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((_url, options) => Promise.resolve(new Response(new ReadableStream({
      start(controller) {
        options.signal.addEventListener('abort', () => controller.error(options.signal.reason));
        setTimeout(() => {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(catalog)));
          controller.close();
        }, 16_000);
      },
    }))));
    const pending = get();
    await jest.advanceTimersByTimeAsync(16_001);
    const response = await pending;
    // A completed download must not leave a timer that can cut client delivery.
    await jest.advanceTimersByTimeAsync(60_000);
    await expect(response.json()).resolves.toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a reset after headers without exposing partial bytes to the caller', async () => {
    fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new TextEncoder().encode('{"partial":')); },
      pull(controller) { controller.error(new TypeError('terminated')); },
    }))).mockResolvedValueOnce(validResponse());
    const response = await get();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    await expect(response.json()).resolves.toEqual(catalog);
  });

  it.each(['{"truncated":', 'null', '[]', '"not a map"'])(
    'retries invalid catalogue JSON: %s', async (body) => {
      fetchMock.mockResolvedValueOnce(new Response(body)).mockResolvedValueOnce(validResponse());
      const response = await get();
      expect(fetchMock).toHaveBeenCalledTimes(2);
      await expect(response.json()).resolves.toEqual(catalog);
    },
  );

  it('returns an uncached 502 instead of a truncated 200 when both attempts fail', async () => {
    fetchMock.mockImplementation(() => Promise.resolve(new Response('{"truncated":')));
    const response = await get();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(response.status).toBe(502);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual({ error: 'upstream_unavailable' });
  });

  it('retries transient upstream HTTP errors', async () => {
    fetchMock.mockResolvedValueOnce(new Response('unavailable', { status: 503 })).mockResolvedValueOnce(validResponse());
    await expect((await get()).json()).resolves.toEqual(catalog);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('preserves rate limits without retrying', async () => {
    fetchMock.mockResolvedValue(Response.json({ error: 'rate limited' }, { status: 429, headers: { 'Retry-After': '60' } }));
    const response = await get();
    expect(response.status).toBe(429);
    expect(response.headers.get('Retry-After')).toBe('60');
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('bounds stalled attempts and returns a controlled error', async () => {
    jest.useFakeTimers();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
    }));
    const pending = get();
    await jest.advanceTimersByTimeAsync(90_001);
    const response = await pending;
    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops upstream work when the client disconnects', async () => {
    const client = new AbortController();
    fetchMock.mockImplementation((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => reject(options.signal.reason));
      client.abort();
    }));
    const response = await get(new NextRequest(url, { signal: client.signal }));
    expect(response.status).toBe(502);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps memory use for an oversized upstream body', async () => {
    const cancel = jest.fn();
    fetchMock.mockImplementation(() => Promise.resolve(new Response(new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(33 * 1024 * 1024)); },
      cancel,
    }))));
    const response = await get();
    expect(response.status).toBe(502);
    expect(cancel).toHaveBeenCalledTimes(2);
  });

  it('retains origin enforcement and uncached API-host responses', async () => {
    const api = 'https://api.vibreo.es/charting/youtube-links';
    expect((await get(new NextRequest(api))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockResolvedValue(validResponse());
    const response = await get(new NextRequest(api, { headers: { Origin: 'https://vibreo.es' } }));
    expect(response.headers.get('Vercel-CDN-Cache-Control')).toBe('no-store');
    await expect(response.json()).resolves.toEqual(catalog);
  });
});
