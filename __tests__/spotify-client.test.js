const handler = require('../api/spotify-client');
const { createMockRes, parsedBody } = require('./helpers');

describe('api/spotify-client', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('rejects non-GET methods with 405', async () => {
    const res = createMockRes();
    await handler({ method: 'POST' }, res);
    expect(res.statusCode).toBe(405);
    expect(res.headers['Allow']).toBe('GET');
    expect(parsedBody(res).error).toMatch(/Method not allowed/);
  });

  it('returns 500 when SPOTIFY_PUBLIC_CLIENT_ID and SPOTIFY_CLIENT_ID are missing', async () => {
    delete process.env.SPOTIFY_PUBLIC_CLIENT_ID;
    delete process.env.SPOTIFY_CLIENT_ID;
    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(500);
    expect(parsedBody(res).error).toMatch(/Missing Spotify client id/);
  });

  it('returns client_id from SPOTIFY_PUBLIC_CLIENT_ID', async () => {
    process.env.SPOTIFY_PUBLIC_CLIENT_ID = 'pub-id-123';
    process.env.SPOTIFY_REDIRECT_URI = 'http://localhost/callback';
    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    const body = parsedBody(res);
    expect(body.client_id).toBe('pub-id-123');
    expect(body.redirect_uri).toBe('http://localhost/callback');
  });

  it('falls back to SPOTIFY_CLIENT_ID when SPOTIFY_PUBLIC_CLIENT_ID is absent', async () => {
    delete process.env.SPOTIFY_PUBLIC_CLIENT_ID;
    process.env.SPOTIFY_CLIENT_ID = 'fallback-id';
    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(res.statusCode).toBe(200);
    expect(parsedBody(res).client_id).toBe('fallback-id');
  });

  it('returns empty string for redirect_uri when not set', async () => {
    process.env.SPOTIFY_PUBLIC_CLIENT_ID = 'id';
    delete process.env.SPOTIFY_REDIRECT_URI;
    const res = createMockRes();
    await handler({ method: 'GET' }, res);
    expect(parsedBody(res).redirect_uri).toBe('');
  });
});
