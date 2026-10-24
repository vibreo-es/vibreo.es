/**
 * @jest-environment node
 * @jest-environment-options {"globalsCleanup":"off"}
 */

describe('api', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  type ApiModule = typeof import('@/lib/api');

  beforeEach(() => {
    jest.resetModules();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      delete (globalThis as { window?: Window }).window;
    }
  });

  it('routes production browser requests through the same-origin proxy', async () => {
    const payload = { songs_daily: '2026-03-29', albums_weekly: '2026-W13' };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://vibreo.es' } },
      configurable: true,
    });

    const api = await import('@/lib/api');

    await expect(api.getLatest()).resolves.toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith('/api-proxy/latest', {
      cache: 'no-store',
      headers: {},
    });
  });

  it('encodes search queries before sending them', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [],
    });

    const api = await import('@/lib/api');

    await api.searchAll('rosalia & bad bunny');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.vibreo.es/search?q=rosalia%20%26%20bad%20bunny',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('uses the local proxy outside the production origin', async () => {
    const payload = { songs_daily: '2026-04-20', artists_daily: '2026-04-20', albums_weekly: '2026-04-16' };
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => payload,
    });
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'http://localhost:3000' } },
      configurable: true,
    });

    const api = await import('@/lib/api');

    await expect(api.getLatest()).resolves.toEqual(payload);
    expect(global.fetch).toHaveBeenCalledWith('/api-proxy/latest', {
      cache: 'no-store',
      headers: {},
    });
  });

  it('throws a descriptive error when the API responds with a failure', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 503,
    });

    const api = await import('@/lib/api');

    await expect(api.getSong('abc')).rejects.toThrow('Something went wrong. Please try again later.');
  });

  it('sends an Origin header for server-side requests', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => [{ id: 1 }],
    });
    Object.defineProperty(globalThis, 'window', {
      value: undefined,
      configurable: true,
    });

    const api = await import('@/lib/api');

    await api.getChartSongsDaily('global', 'latest');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.vibreo.es/charts/songs/daily/global/latest',
      {
        cache: 'no-store',
        headers: { Origin: 'https://vibreo.es' },
      },
    );
  });

  const endpointCases: Array<[string, (api: ApiModule) => Promise<unknown>, string]> = [
    ['getChartArtistsDaily', (api) => api.getChartArtistsDaily('us', '2026-04-20'), '/charts/artists/daily/us/2026-04-20'],
    ['getChartAlbumsWeekly', (api) => api.getChartAlbumsWeekly('us', '2026-04-16'), '/charts/albums/weekly/us/2026-04-16'],
    ['getArtist', (api) => api.getArtist('artist-1'), '/artists/artist-1'],
    ['getAlbum', (api) => api.getAlbum('album-1'), '/albums/album-1'],
    ['getChartingSongs', (api) => api.getChartingSongs(), '/charting/songs'],
    ['getChartingArtists', (api) => api.getChartingArtists(), '/charting/artists'],
    ['getChartingArtist', (api) => api.getChartingArtist('artist1'), '/charting/artists/artist1'],
    ['getChartingAlbums', (api) => api.getChartingAlbums(), '/charting/albums'],
    [
      'getChartingArtistAlbums',
      (api) => (api as ApiModule & { getChartingArtistAlbums: (id: string) => Promise<unknown> }).getChartingArtistAlbums('artist1'),
      '/charting/albums/artist1',
    ],
    ['getChartingListeners', (api) => api.getChartingListeners(), '/charting/listeners'],
    ['getArtistListener', (api) => api.getArtistListener('artist1'), '/charting/listeners/artist1'],
    ['getChartingListenersPage', (api) => api.getChartingListenersPage({ limit: 50, offset: 100 }), '/charting/listeners?limit=50&offset=100'],
    ['getMarketStreams', (api) => api.getMarketStreams(), '/charting/market-streams'],
    ['getYouTubeLinks', (api) => api.getYouTubeLinks(), '/charting/youtube-links'],
    [
      'getArtistYouTubeLinks',
      (api) => (api as ApiModule & { getArtistYouTubeLinks: (id: string) => Promise<unknown> }).getArtistYouTubeLinks('artist1'),
      '/charting/youtube-links/artist1',
    ],
    ['getArtistChannels', (api) => api.getArtistChannels(), '/charting/artist-channels'],
  ];

  it.each(endpointCases)('calls the %s endpoint', async (_name, call, path) => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true }),
    });
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://vibreo.es' } },
      configurable: true,
    });

    const api = await import('@/lib/api');

    await call(api);
    expect(global.fetch).toHaveBeenCalledWith(`/api-proxy${path}`, {
      cache: 'no-store',
      headers: {},
    });
  });

  it('sends ordered hero video candidates through the same-origin proxy', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ track_id: 'track2' }),
    });
    Object.defineProperty(globalThis, 'window', {
      value: { location: { origin: 'https://vibreo.es' } },
      configurable: true,
    });

    const api = await import('@/lib/api');

    await expect(api.resolveHeroVideoTrack({
      trackIds: ['track1', 'track2'],
      artistIds: ['artist1', 'artist2'],
    })).resolves.toEqual({ track_id: 'track2' });
    expect(global.fetch).toHaveBeenCalledWith(
      '/api-proxy/charting/hero-video?track_ids=track1%2Ctrack2&artist_ids=artist1%2Cartist2',
      { cache: 'no-store', headers: {} },
    );
  });

  it('builds hero video URLs without fetching and normalizes error messages', async () => {
    const api = await import('@/lib/api');

    expect(api.getHeroVideoUrl('track-1')).toBe('/api-proxy/hero-video/track-1');
    expect(api.getErrorMessage(new Error('Custom failure'), 'Fallback')).toBe('Custom failure');
    expect(api.getErrorMessage('not an error', 'Fallback')).toBe('Fallback');
  });
});
