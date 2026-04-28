function json(res, status, body) {
  res.status(status).setHeader('Content-Type', 'application/json');
  res.send(JSON.stringify(body));
}

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return json(res, 405, { error: 'Method not allowed. Use GET.' });
  }

  const clientId = process.env.SPOTIFY_PUBLIC_CLIENT_ID || process.env.SPOTIFY_CLIENT_ID || '';

  if (!clientId) {
    return json(res, 500, {
      error: 'Missing Spotify client id. Set SPOTIFY_PUBLIC_CLIENT_ID in Vercel env vars.',
    });
  }

  const redirectUri = process.env.SPOTIFY_REDIRECT_URI || '';

  return json(res, 200, {
    client_id: clientId,
    redirect_uri: redirectUri,
  });
};
