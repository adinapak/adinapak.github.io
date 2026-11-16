const { predict } = require('../lib/spotify-prediction');
let cached = null;
let expiresAt = 0;
let pending = null;

async function loadPrediction() {
  const { SPOTIFY_CLIENT_ID: id, SPOTIFY_CLIENT_SECRET: secret, SPOTIFY_REFRESH_TOKEN: refresh } = process.env;
  if (!id || !secret || !refresh) throw new Error('Spotify is not configured');
  const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
    signal: AbortSignal.timeout(8000),
  });
  if (!tokenResponse.ok) throw new Error('Spotify authentication unavailable');
  const token = await tokenResponse.json();
  if (!token.access_token) throw new Error('Spotify authentication unavailable');
  async function read(path) {
    const response = await fetch(`https://api.spotify.com/v1/me/${path}`, {
      headers: { Authorization: `Bearer ${token.access_token}` },
      signal: AbortSignal.timeout(8000),
    });
    // The existing refresh token may not yet have both read scopes.
    if (response.status === 403) return { items: [], needsAuthorization: true };
    if (!response.ok) throw new Error('Spotify listening data unavailable');
    return response.json();
  }
  const [top, recent] = await Promise.all([
    read('top/tracks?time_range=short_term&limit=50'),
    read('player/recently-played?limit=50'),
  ]);
  const prediction = predict(top.items || [], recent.items || []);
  return {
    prediction,
    needs_authorization: Boolean(top.needsAuthorization || recent.needsAuthorization),
    generated_at: new Date().toISOString(),
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Use GET' });
  }
  try {
    if (!cached || Date.now() >= expiresAt) {
      if (!pending) pending = loadPrediction().finally(() => { pending = null; });
      cached = await pending;
      expiresAt = Date.now() + 5 * 60 * 1000;
    }
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=60');
    return res.status(200).json(cached);
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ prediction: null, error: 'Prediction temporarily unavailable' });
  }
};
