function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

export default async function handler(req, res) {
  const trackId = String(req.query.id || '').trim();

  if (!trackId) {
    return json(res, 400, { liked: false, error: 'Missing track id query parameter.' });
  }

  const clientId = process.env.SPOTIFY_CLIENT_ID;
  const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
  const refreshToken = process.env.SPOTIFY_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    console.error('is-liked-track: Missing Spotify environment variables.');
    return json(res, 500, { liked: false, error: 'Server misconfigured — Spotify credentials missing.' });
  }

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(`${clientId}:${clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      })
    });

    if (!tokenResponse.ok) {
      const detail = await tokenResponse.text().catch(() => '');
      console.error('is-liked-track: Token refresh failed.', tokenResponse.status, detail);
      return json(res, 502, { liked: false, error: 'Failed to refresh Spotify access token.' });
    }

    const tokenData = await tokenResponse.json();

    if (!tokenData.access_token) {
      console.error('is-liked-track: Token response missing access_token.');
      return json(res, 502, { liked: false, error: 'Spotify token response missing access_token.' });
    }

    const likedResponse = await fetch(
      `https://api.spotify.com/v1/me/tracks/contains?ids=${encodeURIComponent(trackId)}`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    if (!likedResponse.ok) {
      const detail = await likedResponse.text().catch(() => '');
      console.error('is-liked-track: Spotify liked-check failed.', likedResponse.status, detail);
      return json(res, likedResponse.status, { liked: false, error: 'Spotify liked-track check failed.' });
    }

    const result = await likedResponse.json();

    return json(res, 200, { liked: result[0] === true });
  } catch (error) {
    console.error('is-liked-track: Unexpected error.', error);
    return json(res, 500, { liked: false, error: 'Unexpected server error checking liked status.' });
  }
}
