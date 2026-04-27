const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
const SPOTIFY_QUEUE_URL = 'https://api.spotify.com/v1/me/player/queue';

function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

function normalizeTrackUri(trackIdOrUri) {
  if (!trackIdOrUri) return null;

  if (trackIdOrUri.startsWith('spotify:track:')) {
    return trackIdOrUri;
  }

  // If user passes a full Spotify track URL, convert to URI.
  if (trackIdOrUri.includes('open.spotify.com/track/')) {
    const cleanUrl = trackIdOrUri.split('?')[0];
    const id = cleanUrl.split('/track/')[1];
    if (!id) return null;
    return `spotify:track:${id}`;
  }

  return `spotify:track:${trackIdOrUri}`;
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
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed. Use GET or POST.' });
  }

  const inputTrack = req.query.track_id || req.query.trackId || req.query.uri;
  const trackUri = normalizeTrackUri(inputTrack);

  if (!trackUri) {
    return json(res, 400, {
      error:
        'Missing or invalid track identifier. Pass ?track_id=<Spotify Track ID|URI|URL>.',
    });
  }

  try {
    const accessToken = await getAccessToken();

    const queueResponse = await fetch(
      `${SPOTIFY_QUEUE_URL}?${new URLSearchParams({ uri: trackUri })}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (queueResponse.status === 401) {
      return json(res, 401, {
        error: 'Spotify unauthorized (401). Check refresh token and app credentials.',
      });
    }

    if (queueResponse.status === 403) {
      return json(res, 403, {
        error:
          'Spotify forbidden (403). Ensure account/device permissions and required scopes.',
      });
    }

    if (!queueResponse.ok) {
      const errorBody = await queueResponse.text().catch(() => '');
      return json(res, queueResponse.status, {
        error: 'Failed to add track to Spotify queue.',
        details: errorBody,
      });
    }

    return json(res, 200, {
      ok: true,
      message: 'Track added to queue.',
      track_uri: trackUri,
    });
  } catch (error) {
    return json(res, error.status || 500, {
      error: error.message || 'Unexpected server error.',
      details: error.details || null,
    });
  }
}
