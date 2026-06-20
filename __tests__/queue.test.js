const handler = require('../api/queue');
const { createMockRes, parsedBody } = require('./helpers');

describe('api/queue', () => {
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

  describe('normalizeTrackUri (via handler)', () => {
    beforeEach(() => {
      global.fetch = jest.fn((url) => {
        if (url.includes('api/token')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ access_token: 'tok' }),
          });
        }
        return Promise.resolve({ ok: true, status: 204, text: () => Promise.resolve('') });
      });
    });

    it('accepts a plain track ID', async () => {
      const res = createMockRes();
      await handler({ method: 'POST', query: { track_id: 'abc123' } }, res);
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res).track_uri).toBe('spotify:track:abc123');
    });

    it('accepts a spotify:track: URI', async () => {
      const res = createMockRes();
      await handler({ method: 'POST', query: { uri: 'spotify:track:xyz789' } }, res);
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res).track_uri).toBe('spotify:track:xyz789');
    });

    it('accepts a full Spotify track URL', async () => {
      const res = createMockRes();
      await handler(
        { method: 'POST', query: { track_id: 'https://open.spotify.com/track/def456?si=abc' } },
        res
      );
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res).track_uri).toBe('spotify:track:def456');
    });

    it('returns 400 when no track identifier is provided', async () => {
      const res = createMockRes();
      await handler({ method: 'POST', query: {} }, res);
      expect(res.statusCode).toBe(400);
      expect(parsedBody(res).error).toMatch(/Missing or invalid track/);
    });
  });

  describe('handler behavior', () => {
    it('rejects non-GET/POST methods with 405', async () => {
      const res = createMockRes();
      await handler({ method: 'DELETE', query: {} }, res);
      expect(res.statusCode).toBe(405);
      expect(res.headers['Allow']).toBe('GET, POST');
    });

    it('rejects requests with refresh_token in query', async () => {
      const res = createMockRes();
      await handler({ method: 'POST', query: { track_id: '123', refresh_token: 'evil' } }, res);
      expect(res.statusCode).toBe(400);
      expect(parsedBody(res).error).toMatch(/Do not pass Spotify tokens/);
    });

    it('rejects requests with access_token in query', async () => {
      const res = createMockRes();
      await handler({ method: 'POST', query: { track_id: '123', access_token: 'evil' } }, res);
      expect(res.statusCode).toBe(400);
      expect(parsedBody(res).error).toMatch(/Do not pass Spotify tokens/);
    });

    it('returns 401 when Spotify queue responds with 401', async () => {
      global.fetch = jest.fn((url) => {
        if (url.includes('api/token')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ access_token: 'tok' }),
          });
        }
        return Promise.resolve({ ok: false, status: 401, text: () => Promise.resolve('') });
      });

      const res = createMockRes();
      await handler({ method: 'POST', query: { track_id: '123' } }, res);
      expect(res.statusCode).toBe(401);
    });

    it('returns 403 when Spotify queue responds with 403', async () => {
      global.fetch = jest.fn((url) => {
        if (url.includes('api/token')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ access_token: 'tok' }),
          });
        }
        return Promise.resolve({ ok: false, status: 403, text: () => Promise.resolve('') });
      });

      const res = createMockRes();
      await handler({ method: 'POST', query: { track_id: '123' } }, res);
      expect(res.statusCode).toBe(403);
    });

    it('returns error status when queue API returns a non-ok response', async () => {
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
          status: 500,
          text: () => Promise.resolve('internal error'),
        });
      });

      const res = createMockRes();
      await handler({ method: 'POST', query: { track_id: '123' } }, res);
      expect(res.statusCode).toBe(500);
      expect(parsedBody(res).error).toMatch(/Failed to add track/);
    });

    it('returns 500 when env vars are missing', async () => {
      delete process.env.SPOTIFY_CLIENT_ID;
      const res = createMockRes();
      await handler({ method: 'POST', query: { track_id: '123' } }, res);
      expect(res.statusCode).toBe(500);
      expect(parsedBody(res).error).toMatch(/Missing Spotify environment/);
    });

    it('handles token refresh failure', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'invalid_grant' }),
        })
      );

      const res = createMockRes();
      await handler({ method: 'POST', query: { track_id: '123' } }, res);
      expect(res.statusCode).toBe(400);
      expect(parsedBody(res).error).toMatch(/Failed to refresh/);
    });
  });
});
