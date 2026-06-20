export default async function handler(req, res) {
  const trackId = String(req.query.id || '').trim();

  if (!trackId) {
    return res.status(200).json({ liked: false });
  }

  // Spotify track IDs are 22-char base62 strings
  if (!/^[a-zA-Z0-9]{1,64}$/.test(trackId)) {
    return res.status(400).json({ error: 'Invalid track ID format.' });
  }

  try {
    const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        Authorization:
          'Basic ' +
          Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: process.env.SPOTIFY_REFRESH_TOKEN
      })
    });

    if (!tokenResponse.ok) {
      return res.status(200).json({ liked: false });
    }

    const tokenData = await tokenResponse.json();

    const likedResponse = await fetch(
      `https://api.spotify.com/v1/me/tracks/contains?ids=${encodeURIComponent(trackId)}`,
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`
        }
      }
    );

    if (!likedResponse.ok) {
      return res.status(200).json({ liked: false });
    }

    const result = await likedResponse.json();

    return res.status(200).json({ liked: result[0] === true });
  } catch {
    return res.status(200).json({ liked: false });
  }
}
