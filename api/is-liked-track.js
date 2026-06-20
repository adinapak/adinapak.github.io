const { getAccessToken } = require('./_spotify-auth');

module.exports = async function handler(req, res) {
  const trackId = String(req.query.id || '').trim();

  if (!trackId) {
    return res.status(200).json({ liked: false });
  }

  try {
    const accessToken = await getAccessToken();

    const likedResponse = await fetch(
      `https://api.spotify.com/v1/me/tracks/contains?ids=${encodeURIComponent(trackId)}`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`
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
};
