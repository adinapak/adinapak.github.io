const handler = require('../api/synesthetic-scene');
const { createMockRes, parsedBody } = require('./helpers');

describe('api/synesthetic-scene', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  function mockReq(body, method = 'POST') {
    return { method, body };
  }

  it('rejects non-POST methods with 405', async () => {
    const res = createMockRes();
    await handler({ method: 'GET', body: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = createMockRes();
    await handler(mockReq({ trackId: '123' }), res);
    expect(res.statusCode).toBe(400);
    expect(parsedBody(res).error).toMatch(/Missing required fields/);
  });

  it('returns 400 when trackName is missing', async () => {
    const res = createMockRes();
    await handler(mockReq({ trackId: '1', artist: 'X' }), res);
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when artist is missing', async () => {
    const res = createMockRes();
    await handler(mockReq({ trackId: '1', trackName: 'X' }), res);
    expect(res.statusCode).toBe(400);
  });

  describe('fallback scene (no OPENAI_API_KEY)', () => {
    beforeEach(() => {
      delete process.env.OPENAI_API_KEY;
    });

    it('returns club scene for nightlife keywords in track name', async () => {
      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Club Night', artist: 'DJ' }), res);
      expect(res.statusCode).toBe(200);
      const body = parsedBody(res);
      expect(body.sceneId).toBe('club');
      expect(body.lighting).toBe('strobe');
    });

    it('returns club scene for techno keyword', async () => {
      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Techno Dreams', artist: 'Producer' }), res);
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res).sceneId).toBe('club');
    });

    it('returns club scene when keyword is in artist name', async () => {
      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Song', artist: 'House Masters' }), res);
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res).sceneId).toBe('club');
    });

    it('returns dream scene as default fallback', async () => {
      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Gentle Breeze', artist: 'Ambient' }), res);
      expect(res.statusCode).toBe(200);
      const body = parsedBody(res);
      expect(body.sceneId).toBe('dream');
      expect(body.lighting).toBe('glow');
      expect(body.motionMood).toBe('floaty');
    });

    it('fallback scene has required structure', async () => {
      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Song', artist: 'Art' }), res);
      const body = parsedBody(res);
      expect(body).toHaveProperty('sceneId');
      expect(body).toHaveProperty('sceneLabel');
      expect(body).toHaveProperty('palette');
      expect(body).toHaveProperty('lighting');
      expect(body).toHaveProperty('motionMood');
      expect(body).toHaveProperty('confidence');
      expect(body).toHaveProperty('reason');
      expect(body.palette).toHaveLength(3);
    });
  });

  describe('with OPENAI_API_KEY', () => {
    beforeEach(() => {
      process.env.OPENAI_API_KEY = 'sk-test';
    });

    it('returns parsed scene from OpenAI response', async () => {
      const aiScene = {
        sceneId: 'stage',
        sceneLabel: 'grand concert hall',
        palette: ['#ff0000', '#00ff00', '#0000ff'],
        lighting: 'spotlight',
        motionMood: 'energetic',
        confidence: 0.9,
        reason: 'Concert vibes',
      };

      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ output_text: JSON.stringify(aiScene) }),
        })
      );

      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Rock', artist: 'Band' }), res);
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res)).toEqual(aiScene);
    });

    it('falls back when OpenAI returns non-ok response', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({ ok: false, status: 500 })
      );

      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Song', artist: 'Art' }), res);
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res).sceneId).toBe('dream');
    });

    it('falls back when OpenAI returns invalid sceneId', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              output_text: JSON.stringify({ sceneId: 'invalid', sceneLabel: 'x' }),
            }),
        })
      );

      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Song', artist: 'Art' }), res);
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res).sceneId).toBe('dream');
    });

    it('falls back when OpenAI returns null output_text', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ output_text: null }),
        })
      );

      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Song', artist: 'Art' }), res);
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res).sceneId).toBe('dream');
    });

    it('falls back when fetch throws an error', async () => {
      global.fetch = jest.fn(() => Promise.reject(new Error('Network error')));

      const res = createMockRes();
      await handler(mockReq({ trackId: '1', trackName: 'Song', artist: 'Art' }), res);
      expect(res.statusCode).toBe(200);
      expect(parsedBody(res).sceneId).toBe('dream');
    });

    it('sends correct payload to OpenAI', async () => {
      global.fetch = jest.fn(() =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              output_text: JSON.stringify({
                sceneId: 'lounge',
                sceneLabel: 'chill lounge',
                palette: ['#a', '#b', '#c'],
                lighting: 'dim',
                motionMood: 'slow',
                confidence: 0.7,
                reason: 'test',
              }),
            }),
        })
      );

      const res = createMockRes();
      await handler(
        mockReq({ trackId: 'tid', trackName: 'My Track', artist: 'My Artist' }),
        res
      );

      const fetchCall = global.fetch.mock.calls[0];
      expect(fetchCall[0]).toBe('https://api.openai.com/v1/responses');
      const body = JSON.parse(fetchCall[1].body);
      expect(body.input[1].content).toContain('My Track');
      expect(body.input[1].content).toContain('My Artist');
    });
  });
});
