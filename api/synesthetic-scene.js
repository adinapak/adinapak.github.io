const ALLOWED_SCENE_IDS = new Set(['club', 'field', 'stage', 'lounge', 'dream']);

function fallbackScene(trackName = '', artist = '') {
  const text = `${String(trackName).toLowerCase()} ${String(artist).toLowerCase()}`;
  if (text.includes('house') || text.includes('techno') || text.includes('club')) {
    return {
      sceneId: 'club',
      sceneLabel: 'warehouse club under violet strobes',
      palette: ['#141018', '#7d5fff', '#f6f1ff'],
      lighting: 'strobe',
      motionMood: 'elastic',
      confidence: 0.58,
      reason: 'Deterministic metadata fallback mapped nightlife-like keywords.'
    };
  }
  return {
    sceneId: 'dream',
    sceneLabel: 'soft dreamscape with violet haze',
    palette: ['#a78bfa', '#0f0f1a', '#e9ddff'],
    lighting: 'glow',
    motionMood: 'floaty',
    confidence: 0.45,
    reason: 'Deterministic metadata fallback used neutral ambient mapping.'
  };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { trackId = '', trackName = '', artist = '' } = req.body || {};
  if (!trackId || !trackName || !artist) return res.status(400).json({ error: 'Missing required fields' });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return res.status(200).json(fallbackScene(trackName, artist));
  }

  try {
    const prompt = [
      'Infer a plausible expressive dance-scene environment from Spotify metadata.',
      'Return strict JSON only with keys: sceneId, sceneLabel, palette, lighting, motionMood, confidence, reason.',
      'Allowed sceneId values: club, field, stage, lounge, dream.',
      'Infer an environment, not exact genre. Be concise and evocative.',
      'Do not identify real people. Do not request or generate images.'
    ].join(' ');

    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: process.env.SYNESTHETIC_SCENE_MODEL || 'gpt-4.1-mini',
        input: [
          { role: 'system', content: prompt },
          {
            role: 'user',
            content: JSON.stringify({ trackId, trackName, artist })
          }
        ],
        text: {
          format: {
            type: 'json_schema',
            name: 'synesthetic_scene',
            schema: {
              type: 'object',
              additionalProperties: false,
              required: ['sceneId', 'sceneLabel', 'palette', 'lighting', 'motionMood', 'confidence', 'reason'],
              properties: {
                sceneId: { type: 'string', enum: ['club', 'field', 'stage', 'lounge', 'dream'] },
                sceneLabel: { type: 'string' },
                palette: {
                  type: 'array',
                  minItems: 3,
                  maxItems: 3,
                  items: { type: 'string' }
                },
                lighting: { type: 'string' },
                motionMood: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                reason: { type: 'string' }
              }
            }
          }
        }
      })
    });

    if (!response.ok) return res.status(200).json(fallbackScene(trackName, artist));
    const payload = await response.json();
    const raw = payload?.output_text;
    const parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || !ALLOWED_SCENE_IDS.has(parsed.sceneId)) return res.status(200).json(fallbackScene(trackName, artist));
    return res.status(200).json(parsed);
  } catch (error) {
    return res.status(200).json(fallbackScene(trackName, artist));
  }
};
