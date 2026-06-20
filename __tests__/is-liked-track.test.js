const { default: handler } = require('../api/is-liked-track');

describe('api/is-liked-track', () => {
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

  function mockRes() {
    const res = {
      statusCode: 0,
      body: null,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        this.body = data;
      },
    };
    return res;
  }

  it('returns liked:false when id is empty', async () => {
    const res = mockRes();
    await handler({ query: { id: '' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ liked: false });
  });

  it('returns liked:false when id is missing', async () => {
    const res = mockRes();
    await handler({ query: {} }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ liked: false });
  });

  it('returns liked:true when track is liked', async () => {
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
        json: () => Promise.resolve([true]),
      });
    });

    const res = mockRes();
    await handler({ query: { id: 'track123' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ liked: true });
  });

  it('returns liked:false when track is not liked', async () => {
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
        json: () => Promise.resolve([false]),
      });
    });

    const res = mockRes();
    await handler({ query: { id: 'track123' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ liked: false });
  });

  it('returns liked:false when token refresh fails', async () => {
    global.fetch = jest.fn(() =>
      Promise.resolve({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'invalid_grant' }),
      })
    );

    const res = mockRes();
    await handler({ query: { id: 'track123' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ liked: false });
  });

  it('returns liked:false when liked-tracks API returns non-ok', async () => {
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
        json: () => Promise.resolve({}),
      });
    });

    const res = mockRes();
    await handler({ query: { id: 'track123' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ liked: false });
  });

  it('returns liked:false when fetch throws an error', async () => {
    global.fetch = jest.fn(() => Promise.reject(new Error('Network failure')));

    const res = mockRes();
    await handler({ query: { id: 'track123' } }, res);
    expect(res.statusCode).toBe(200);
    expect(res.body).toEqual({ liked: false });
  });

  it('calls the correct Spotify contains endpoint', async () => {
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
        json: () => Promise.resolve([true]),
      });
    });

    const res = mockRes();
    await handler({ query: { id: 'mytrack' } }, res);

    const likedCall = global.fetch.mock.calls.find((c) =>
      c[0].includes('me/tracks/contains')
    );
    expect(likedCall).toBeDefined();
    expect(likedCall[0]).toContain('ids=mytrack');
  });
});
