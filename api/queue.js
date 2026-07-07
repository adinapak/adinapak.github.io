const { json, getAccessToken } = require('./_spotify-auth');

const SPOTIFY_QUEUE_URL = 'https://api.spotify.com/v1/me/player/queue';

function normalizeTrackUri(trackIdOrUri) {
  if (!trackIdOrUri) return null;

  if (trackIdOrUri.startsWith('spotify:track:')) {
    return trackIdOrUri;
  }

  if (trackIdOrUri.includes('open.spotify.com/track/')) {
    const cleanUrl = trackIdOrUri.split('?')[0];
    const id = cleanUrl.split('/track/')[1];
    if (!id) return null;
    return `spotify:track:${id}`;
  }

  return `spotify:track:${trackIdOrUri}`;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST');
    return json(res, 405, { error: 'Method not allowed. Use GET or POST.' });
  }


  if (req.query.refresh_token || req.query.access_token) {
    return json(res, 400, {
      error: 'Do not pass Spotify tokens in query params. Server uses env credentials only.',
    });
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
};
