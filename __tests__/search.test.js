const handler = require('../api/search');
const { createMockRes, parsedBody } = require('./helpers');

describe('api/search', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      SPOTIFY_CLIENT_ID: 'cid',
      SPOTIFY_CLIENT_SECRET: 'secret',
      SPOTIFY_REFRESH_TOKEN: 'refresh',
    };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects non-GET methods with 405', async () => {
    const res = createMockRes();
    await handler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
  });

  it('returns empty tracks when query is empty', async () => {
    const res = createMockRes();
    await handler({ method: 'GET', query: { q: '' } }, res);
    expect(res.statusCode).toBe(200);
    expect(parsedBody(res)).toEqual({ tracks: [] });
  });

  it('returns empty tracks when query is whitespace', async () => {
    const res = createMockRes();
    await handler({ method: 'GET', query: { q: '   ' } }, res);
    expect(res.statusCode).toBe(200);
    expect(parsedBody(res)).toEqual({ tracks: [] });
  });

  it('returns tracks from Spotify search', async () => {
    const mockTracks = [{ id: '1', name: 'Song A' }, { id: '2', name: 'Song B' }];

    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tracks: { items: mockTracks } }),
      });
    });

    const res = createMockRes();
    await handler({ method: 'GET', query: { q: 'test song' } }, res);
    expect(res.statusCode).toBe(200);
    expect(parsedBody(res).tracks).toEqual(mockTracks);
  });

  it('passes search query to Spotify API URL', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ tracks: { items: [] } }),
      });
    });

    const res = createMockRes();
    await handler({ method: 'GET', query: { q: 'hello world' } }, res);

    const searchCall = global.fetch.mock.calls.find((c) =>
      c[0].includes('v1/search')
    );
    expect(searchCall).toBeDefined();
    expect(searchCall[0]).toContain('q=hello+world');
    expect(searchCall[0]).toContain('type=track');
    expect(searchCall[0]).toContain('limit=8');
  });

  it('forwards Spotify error status', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 429,
        text: () => Promise.resolve('rate limited'),
      });
    });

    const res = createMockRes();
    await handler({ method: 'GET', query: { q: 'test' } }, res);
    expect(res.statusCode).toBe(429);
    expect(parsedBody(res).error).toMatch(/search failed/i);
  });

  it('returns 500 when env vars are missing', async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    const res = createMockRes();
    await handler({ method: 'GET', query: { q: 'test' } }, res);
    expect(res.statusCode).toBe(500);
    expect(parsedBody(res).error).toMatch(/Missing Spotify environment/);
  });

  it('returns empty array when tracks.items is missing from response', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({}),
      });
    });

    const res = createMockRes();
    await handler({ method: 'GET', query: { q: 'test' } }, res);
    expect(res.statusCode).toBe(200);
    expect(parsedBody(res).tracks).toEqual([]);
  });
});
