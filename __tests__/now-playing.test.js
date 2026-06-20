const handler = require('../api/now-playing');
const { createMockRes, parsedBody } = require('./helpers');

describe('api/now-playing', () => {
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

  it('returns 500 when env vars are missing', async () => {
    delete process.env.SPOTIFY_CLIENT_ID;
    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(500);
    expect(parsedBody(res).error).toMatch(/Missing Spotify environment/);
  });

  it('returns is_playing:false when player returns 204', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({ status: 204, ok: false });
    });

    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(parsedBody(res)).toEqual({ is_playing: false, track: null });
  });

  it('returns 401 when Spotify player responds with 401', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({ status: 401, ok: false });
    });

    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(401);
    expect(parsedBody(res).error).toMatch(/unauthorized/i);
  });

  it('returns 403 when Spotify player responds with 403', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({ status: 403, ok: false });
    });

    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(403);
    expect(parsedBody(res).error).toMatch(/forbidden/i);
  });

  it('forwards non-ok status from player', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({
        status: 502,
        ok: false,
        text: () => Promise.resolve('bad gateway'),
      });
    });

    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(502);
    expect(parsedBody(res).error).toMatch(/Failed to fetch/);
  });

  it('returns track data when playing', async () => {
    const playbackData = {
      is_playing: true,
      progress_ms: 5000,
      item: {
        id: 'track1',
        uri: 'spotify:track:track1',
        name: 'Test Song',
        duration_ms: 200000,
        artists: [{ name: 'Artist A' }, { name: 'Artist B' }],
        album: { images: [{ url: 'https://img.com/cover.jpg' }] },
      },
    };

    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.resolve(playbackData),
      });
    });

    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    const body = parsedBody(res);
    expect(body.is_playing).toBe(true);
    expect(body.progress_ms).toBe(5000);
    expect(body.duration_ms).toBe(200000);
    expect(body.track.name).toBe('Test Song');
    expect(body.track.artist).toBe('Artist A, Artist B');
    expect(body.track.album_art_url).toBe('https://img.com/cover.jpg');
  });

  it('returns track:null when item is missing from playback', async () => {
    global.fetch = jest.fn((url) => {
      if (url.includes('api/token')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ access_token: 'tok' }),
        });
      }
      return Promise.resolve({
        status: 200,
        ok: true,
        json: () => Promise.resolve({ is_playing: true, item: null }),
      });
    });

    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    const body = parsedBody(res);
    expect(body.is_playing).toBe(true);
    expect(body.track).toBeNull();
  });

  it('returns error when token refresh fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'invalid_grant' }),
      })
    );

    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(400);
    expect(parsedBody(res).error).toMatch(/Failed to refresh/);
  });
});
