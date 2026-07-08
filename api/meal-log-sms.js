'use strict';

function env(name, fallback = '') { return process.env[name] || fallback; }
function twiml(message) { return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${escapeXml(message)}</Message></Response>`; }
function escapeXml(value) { return String(value).replace(/[<>&'"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[c])); }
function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}
async function parsePayload(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  const raw = await readBody(req);
  return Object.fromEntries(new URLSearchParams(raw));
}
async function supabase(path, init = {}) {
  const url = env('SUPABASE_URL').replace(/\/$/, '');
  const key = env('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${url}${path}`, { ...init, headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Supabase ${res.status}`);
  return res.status === 204 ? null : res.json();
}
async function latestMeal() {
  const rows = await supabase('/rest/v1/meal_logs?visibility=eq.public&order=logged_at.desc.nullslast,ordered_at.desc.nullslast&limit=1');
  return Array.isArray(rows) ? rows[0] : null;
}
function normalizeMode(value = '') {
  const v = value.trim().toLowerCase().replace(/[-\s]+/g, ' ');
  if (v === 'pickup') return 'pickup';
  if (v === 'delivery') return 'delivery';
  if (v === 'dining in' || v === 'dine in' || v === 'dining_in') return 'dining_in';
  if (v === 'made by me' || v === 'made_by_me' || v === 'homemade') return 'made_by_me';
  return 'unknown';
}
function parseCommand(body = '') {
  const text = body.trim();
  let match = text.match(/^([1-4])\s+([\s\S]+)$/);
  if (match) {
    const value = match[2].trim();
    if (match[1] === '1') return { type: 'update', patch: { restaurant_name: value } };
    if (match[1] === '2') return { type: 'update', patch: { meal_mode: normalizeMode(value) } };
    if (match[1] === '3') return { type: 'update', patch: { city: value } };
    if (match[1] === '4') return { type: 'update', patch: { description: value } };
  }
  match = text.match(/^new\s+([\s\S]+)$/i);
  if (match) {
    const parts = match[1].split('|').map(p => p.trim()).filter(Boolean);
    if (parts.length >= 3) {
      const [restaurantOrMode, modeOrCity, cityOrNote, ...rest] = parts;
      const mode = normalizeMode(modeOrCity);
      if (mode === 'unknown' && normalizeMode(restaurantOrMode) !== 'unknown') {
        return { type: 'new', row: { restaurant_name: null, meal_mode: normalizeMode(restaurantOrMode), city: modeOrCity, description: [cityOrNote, ...rest].join(' | ') || null } };
      }
      return { type: 'new', row: { restaurant_name: restaurantOrMode, meal_mode: mode, city: cityOrNote, description: rest.join(' | ') || null } };
    }
  }
  return null;
}
async function describeImage(url) {
  if (!env('OPENAI_API_KEY')) return null;
  try {
    const res = await fetch('https://api.openai.com/v1/responses', { method: 'POST', headers: { Authorization: `Bearer ${env('OPENAI_API_KEY')}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'gpt-4.1-mini', input: [{ role: 'user', content: [{ type: 'input_text', text: 'Describe only visible food/drink in 3-8 words. Do not mention people, faces, addresses, backgrounds, or sensitive details.' }, { type: 'input_image', image_url: url }] }], max_output_tokens: 40 }) });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.output_text || '').trim().slice(0, 120) || null;
  } catch { return null; }
}
async function uploadTwilioMedia(mediaUrl, contentType, mediaSid) {
  const auth = Buffer.from(`${env('TWILIO_ACCOUNT_SID')}:${env('TWILIO_AUTH_TOKEN')}`).toString('base64');
  const media = await fetch(mediaUrl, { headers: { Authorization: `Basic ${auth}` } });
  if (!media.ok) throw new Error('Twilio media download failed');
  const ext = contentType.includes('png') ? 'png' : contentType.includes('gif') ? 'gif' : contentType.includes('webp') ? 'webp' : 'jpg';
  const path = `twilio/${new Date().toISOString().slice(0, 10)}/${mediaSid || Date.now()}.${ext}`;
  const bucket = env('SUPABASE_STORAGE_BUCKET', 'meal-images');
  await supabase(`/storage/v1/object/${bucket}/${path}`, { method: 'POST', headers: { 'Content-Type': contentType || 'image/jpeg', 'x-upsert': 'true' }, body: Buffer.from(await media.arrayBuffer()) });
  return `${env('SUPABASE_URL').replace(/\/$/, '')}/storage/v1/object/public/${bucket}/${path}`;
}
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'text/xml');
  try {
    if (req.method !== 'POST') { res.status(405).send(twiml('Meal log update failed.')); return; }
    const payload = await parsePayload(req);
    if (payload.From !== env('ALLOWED_MMS_FROM')) { res.status(403).send(twiml('Unauthorized.')); return; }
    const body = (payload.Body || '').trim();
    const mediaCount = Number(payload.NumMedia || 0);
    const command = parseCommand(body);
    if (command?.type === 'new') {
      await supabase('/rest/v1/meal_logs', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...command.row, source: 'manual', logged_at: new Date().toISOString(), visibility: 'public', metadata: {} }) });
      res.status(200).send(twiml('Created meal log.')); return;
    }
    const latest = await latestMeal();
    if (!latest && mediaCount > 0) { res.status(200).send(twiml('No meal exists yet. Text: new restaurant | mode | city | note')); return; }
    if (!latest) { res.status(200).send(twiml('Meal log update failed.')); return; }
    if (command?.type === 'update') {
      await supabase(`/rest/v1/meal_logs?id=eq.${latest.id}`, { method: 'PATCH', body: JSON.stringify({ ...command.patch, logged_at: new Date().toISOString(), metadata: { ...(latest.metadata || {}), manual_updated_at: new Date().toISOString() } }) });
      res.status(200).send(twiml('Updated meal log.')); return;
    }
    if (mediaCount > 0) {
      const imageUrl = await uploadTwilioMedia(payload.MediaUrl0, payload.MediaContentType0 || 'image/jpeg', payload.MediaSid0);
      const desc = await describeImage(imageUrl);
      await supabase(`/rest/v1/meal_logs?id=eq.${latest.id}`, { method: 'PATCH', body: JSON.stringify({ image_url: imageUrl, image_alt: desc || 'Meal photo', image_description: desc, logged_at: new Date().toISOString(), metadata: { ...(latest.metadata || {}), manual_image_note: body || undefined, twilio_media_sid: payload.MediaSid0 || undefined } }) });
      res.status(200).send(twiml('Updated latest meal image.')); return;
    }
    res.status(200).send(twiml('Meal log update failed.'));
  } catch (error) {
    console.error('Meal log SMS webhook failed.');
    res.status(200).send(twiml('Meal log update failed.'));
  }
};
