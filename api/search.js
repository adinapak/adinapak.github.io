const { json, getAccessToken } = require('./_spotify-auth');

const SPOTIFY_SEARCH_URL = 'https://api.spotify.com/v1/search';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed. Use GET.' });
  }

  const query = (req.query.q || '').trim();
  if (!query) return json(res, 200, { tracks: [] });

  try {
    const accessToken = await getAccessToken();
    const params = new URLSearchParams({ type: 'track', limit: '8', q: query });
    const response = await fetch(`${SPOTIFY_SEARCH_URL}?${params.toString()}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const details = await response.text().catch(() => '');
      return json(res, response.status, { error: 'Spotify search failed.', details });
    }

    const data = await response.json();
    return json(res, 200, { tracks: data?.tracks?.items || [] });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || 'Unexpected server error.',
      details: error.details || null,
    });
  }
};
