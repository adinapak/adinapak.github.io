const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_PLAYER_URL = 'https://api.spotify.com/v1/me/player';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

async function getAccessToken() {
  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    const err = new Error('Missing Spotify environment variables.');
    err.status = 500;
    throw err;
  }

  const authHeader = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const tokenResponse = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${authHeader}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const tokenData = await tokenResponse.json().catch(() => ({}));

  if (!tokenResponse.ok || !tokenData.access_token) {
    const err = new Error('Failed to refresh Spotify access token.');
    err.status = tokenResponse.status || 502;
    err.details = tokenData;
    throw err;
  }

  return tokenData.access_token;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed. Use GET.' });
  }

  try {
    const accessToken = await getAccessToken();

    const playerResponse = await fetch(SPOTIFY_PLAYER_URL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (playerResponse.status === 204) {
      return json(res, 200, { is_playing: false, track: null });
    }

    if (playerResponse.status === 401) {
      return json(res, 401, {
        error: 'Spotify unauthorized (401). Check refresh token and app credentials.',
      });
    }

    if (playerResponse.status === 403) {
      return json(res, 403, {
        error:
          'Spotify forbidden (403). Ensure account/device permissions and required scopes.',
      });
    }

    if (!playerResponse.ok) {
      const errorBody = await playerResponse.text().catch(() => '');
      return json(res, playerResponse.status, {
        error: 'Failed to fetch current playback state.',
        details: errorBody,
      });
    }

    const playback = await playerResponse.json();
    const item = playback.item;

    if (!item) {
      return json(res, 200, { is_playing: !!playback.is_playing, track: null });
    }

    return json(res, 200, {
      is_playing: !!playback.is_playing,
      progress_ms: playback.progress_ms,
      duration_ms: item.duration_ms,
      track: {
        name: item.name,
        artist: (item.artists || []).map((artist) => artist.name).join(', '),
        album_art_url: item.album?.images?.[0]?.url || null,
      },
    });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || 'Unexpected server error.',
      details: error.details || null,
    });
  }
};
