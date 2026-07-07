#!/usr/bin/env node
'use strict';

const GMAIL_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';
const DEFAULT_QUERY = 'from:(doordash.com) newer_than:90d ("Order Confirmation for Adina" OR receipt OR order OR DoorDash)';
const MAX_CANDIDATES = 20;
const DEFAULT_MODEL_NAME = 'manual';
const DEFAULT_MODEL_URL = '#';

const CATEGORY_KEYWORDS = [
  ['groceries', ['grocery', 'groceries', 'market', 'safeway', 'trader joe', 'whole foods', 'produce', 'banana', 'milk', 'eggs']],
  ['bowl', ['bowl', 'plate', 'rice', 'cava', 'chipotle', 'sweetgreen harvest']],
  ['salad', ['salad', 'greens', 'sweetgreen', 'lettuce']],
  ['sushi', ['sushi', 'sashimi', 'nigiri', 'roll', 'maki', 'poke']],
  ['pizza', ['pizza', 'pizzeria', 'slice']],
  ['burger', ['burger', 'fries', 'shake shack', 'hamburger', 'cheeseburger']],
  ['boba', ['boba', 'tea', 'milk tea', 'matcha', 'tapioca']],
  ['coffee', ['coffee', 'latte', 'espresso', 'cappuccino', 'starbucks', 'philz']],
  ['convenience', ['convenience', 'cvs', 'walgreens', '7-eleven', '711', 'dashmart']],
  ['dessert', ['dessert', 'ice cream', 'cookie', 'cake', 'donut', 'bakery', 'crumbl']],
  ['food', ['restaurant', 'kitchen', 'grill', 'cafe', 'taco', 'ramen', 'noodle', 'sandwich']]
];

const ZIP_CITY = new Map([
  ...range(94102, 94134).map(z => [String(z), 'San Francisco']), ['94158', 'San Francisco'],
  ...['94702','94703','94704','94705','94706','94707','94708','94709','94710','94720'].map(z => [z, 'Berkeley']),
  ...['94601','94602','94603','94605','94606','94607','94608','94609','94610','94611','94612','94618','94619','94621'].map(z => [z, 'Oakland']),
  ...['90001','90002','90003','90004','90005','90006','90007','90008','90010','90011','90012','90013','90014','90015','90016','90017','90018','90019','90020','90021','90022','90023','90024','90025','90026','90027','90028','90029','90031','90032','90033','90034','90035','90036','90037','90038','90039','90041','90042','90043','90044','90045','90046','90047','90048','90049','90056','90057','90058','90059','90061','90062','90063','90064','90065','90066','90067','90068','90069','90071','90077','90089','90094'].map(z => [z, 'Los Angeles']),
  ...['90274','90275'].map(z => [z, 'Palos Verdes'])
]);

function range(a, b) { return Array.from({ length: b - a + 1 }, (_, i) => a + i); }
function requireEnv(name) { const value = process.env[name]; if (!value) throw new Error(`Missing required env var: ${name}`); return value; }
function decodeBase64Url(data = '') { return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
function htmlToText(html) { return html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>|<\/div>|<\/tr>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function normalize(text) { return (text || '').replace(/\r/g, '\n').replace(/[\t ]+/g, ' ').replace(/\n[ \t]+/g, '\n').replace(/\n{3,}/g, '\n\n').trim(); }
function header(message, name) { return (message.payload?.headers || []).find(h => h.name?.toLowerCase() === name.toLowerCase())?.value || ''; }
function collectParts(part, out = { html: [], text: [] }) {
  if (!part) return out;
  const mime = part.mimeType || '';
  const body = part.body?.data ? decodeBase64Url(part.body.data) : '';
  if (body && mime.includes('text/html')) out.html.push(body);
  if (body && mime.includes('text/plain')) out.text.push(body);
  for (const child of part.parts || []) collectParts(child, out);
  return out;
}
function cleanLine(line) { return line.replace(/^[-•*\s]+/, '').replace(/\s+/g, ' ').trim(); }
function isUnsafeLine(line) {
  return !line || /\$\s?\d|subtotal|total|tax|tip|fees?|delivery fee|service fee|promo|discount|visa|mastercard|amex|card|order\s*#|order number|dasher|delivered to|drop.?off|address|apt|unit|phone|support|receipt|view order|track order|help/i.test(line) || /@/.test(line) || /\b\d{1,6}\s+[A-Za-z0-9 .'-]+\s+(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|ln|lane|way|ct|court)\b/i.test(line);
}
function sanitizeItem(line) { return cleanLine(line).replace(/^\d+\s*[x×]\s*/i, '').replace(/\s+\$\s?\d.*$/, '').replace(/\b(item|qty|quantity)\b:?/ig, '').trim().slice(0, 80); }
function redactSubject(subject) {
  return cleanLine(subject || 'untitled').replace(/[\w.+-]+@[\w.-]+/g, '[email]').slice(0, 100);
}
function containsRejectTerm(text) {
  return /Drive API|Developer|Merchant Portal|Partner|API access|Newsletter|promotion|promo|deal|coupon|campaign/i.test(text || '');
}
function hasOrderConfirmation(text, subject) {
  return /Order Confirmation for Adina/i.test(`${subject}\n${text}`);
}
function extractReceiptPhrase(hay) {
  return hay.match(/Order Confirmation for Adina\s+from\s+([^\n.!|]+)/i)
    || hay.match(/Order Confirmation for Adina[^\n]{0,80}?\bfrom\s+([^\n.!|]+)/i);
}
function isValidReceipt(text, subject) {
  const hay = `${subject}\n${text}`;
  if (containsRejectTerm(hay)) return false;
  if (!hasOrderConfirmation(text, subject)) return false;
  return Boolean(extractReceiptPhrase(hay) || /(?:Thanks for your order from|Your order from|order from)\s+[^\n.!]+/i.test(hay));
}
function inferMerchant(text, subject) {
  const hay = `${subject}\n${text}`;
  const receiptMatch = extractReceiptPhrase(hay);
  if (receiptMatch) return cleanLine(receiptMatch[1]).replace(/\s+(?:is confirmed|has been.*|$).*$/i, '').slice(0, 70);
  const patterns = [/Thanks for your order from\s+([^\n.!]+)/i, /Your order from\s+([^\n.!]+)/i, /order from\s+([^\n.!]+)/i, /receipt from\s+([^\n.!]+)/i];
  for (const re of patterns) { const m = hay.match(re); if (m) return cleanLine(m[1]).replace(/\s+has been.*$/i, '').slice(0, 70); }
  const idx = hay.search(/Order Confirmation for Adina/i);
  if (idx >= 0) {
    const nearby = hay.slice(idx, idx + 600).split('\n').map(cleanLine).filter(Boolean).find(l => !/Order Confirmation|DoorDash|receipt|confirmation|thanks/i.test(l) && !isUnsafeLine(l));
    if (nearby) return nearby.slice(0, 70);
  }
  return 'DoorDash';
}
function inferItems(text, merchant) {
  const lines = normalize(text).split('\n').map(cleanLine).filter(Boolean);
  const start = lines.findIndex(l => /^(items|your order|order details|order summary)$/i.test(l));
  if (start < 0) return [];
  const pool = lines.slice(start + 1, start + 18);
  const stop = /^(subtotal|total|tax|fees?|tip|payment|delivery|delivered to|pickup|address|help|support|about|terms|privacy)/i;
  const items = [];
  for (const line of pool) {
    if (stop.test(line)) break;
    if (isUnsafeLine(line)) continue;
    const item = sanitizeItem(line);
    if (item && item.length > 2 && item.toLowerCase() !== merchant.toLowerCase() && !/^doorDash$/i.test(item) && !items.includes(item)) items.push(item);
    if (items.length >= 4) break;
  }
  return items;
}
function inferFulfillment(text) {
  if (/ready for pickup|pickup|pick up/i.test(text)) return 'pickup';
  if (/delivered to|delivery|drop\s?off|drop-off|deliver/i.test(text)) return 'delivery';
  return 'unknown';
}
function inferZip(text) {
  const addressish = text.match(/(?:delivered to|delivery address|drop\s?off|drop-off|address|pickup at)[\s\S]{0,500}?\b(\d{5})(?:-\d{4})?\b/i);
  if (addressish) return addressish[1];
  const m = text.match(/\b(\d{5})(?:-\d{4})?\b/);
  return m?.[1];
}
function inferCategory(merchant, items) { const hay = `${merchant} ${items.join(' ')}`.toLowerCase(); for (const [cat, words] of CATEGORY_KEYWORDS) if (words.some(w => hay.includes(w))) return cat; return 'unknown'; }
function summarize(merchant, items, category) { if (items.length) return items.slice(0, 3).join(', '); return 'order details unavailable'; }
function activityDateLA(date) { return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date); }
function imagePrompt(category, merchant, summary) { return `minimal editorial illustration of a ${category === 'unknown' ? 'takeout food' : category} order on an off-white background`; }

async function gmailFetch(path, accessToken, init = {}) {
  const res = await fetch(`${GMAIL_API}${path}`, { ...init, headers: { Authorization: `Bearer ${accessToken}`, ...(init.headers || {}) } });
  if (!res.ok) throw new Error(`Gmail API failed (${res.status}) for ${path}`);
  return res.json();
}
async function getAccessToken() {
  const params = new URLSearchParams({ client_id: requireEnv('GMAIL_CLIENT_ID'), client_secret: requireEnv('GMAIL_CLIENT_SECRET'), refresh_token: requireEnv('GMAIL_REFRESH_TOKEN'), grant_type: 'refresh_token' });
  const res = await fetch(GMAIL_TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params });
  if (!res.ok) throw new Error(`Gmail token exchange failed (${res.status})`);
  return (await res.json()).access_token;
}
async function upsertSupabase(row) {
  const url = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${url}/rest/v1/activity_feed?on_conflict=source,activity_date`, { method: 'POST', headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' }, body: JSON.stringify(row) });
  if (!res.ok) throw new Error(`Supabase upsert failed (${res.status}): ${await res.text()}`);
  return res.json();
}

async function main() {
  const query = process.env.DOORDASH_RECEIPT_QUERY || DEFAULT_QUERY;
  console.log('Starting DoorDash receipt sync. Query window configured; raw messages will not be logged.');
  const accessToken = await getAccessToken();
  const list = await gmailFetch(`?${new URLSearchParams({ q: query, maxResults: String(MAX_CANDIDATES) })}`, accessToken);
  const candidates = list.messages || [];
  console.log(`Fetched ${candidates.length} DoorDash candidate emails.`);
  if (!candidates.length) throw new Error('No DoorDash receipt candidates found.');
  let message, text = '', subject = '';
  for (const candidate of candidates) {
    const candidateMessage = await gmailFetch(`/${candidate.id}?${new URLSearchParams({ format: 'full' })}`, accessToken);
    const candidateSubject = header(candidateMessage, 'Subject');
    const parts = collectParts(candidateMessage.payload);
    const candidateText = normalize([parts.text.join('\n'), parts.html.map(htmlToText).join('\n')].filter(Boolean).join('\n'));
    if (!isValidReceipt(candidateText, candidateSubject)) {
      console.log(`Skipped non-receipt email subject: ${redactSubject(candidateSubject)}`);
      continue;
    }
    message = candidateMessage;
    text = candidateText;
    subject = candidateSubject;
    console.log(`Selected receipt subject: ${redactSubject(subject)}`);
    break;
  }
  if (!message) throw new Error('No real DoorDash order confirmation found among candidates.');
  const merchant = inferMerchant(text, subject);
  const items = inferItems(text, merchant);
  const fulfillment_type = inferFulfillment(text);
  const orderedAt = new Date(Number(message.internalDate || Date.now()));
  const ordered_at = Number.isNaN(orderedAt.getTime()) ? new Date().toISOString() : orderedAt.toISOString();
  const zip_code = inferZip(text);
  const city = zip_code ? (ZIP_CITY.get(zip_code) || 'unknown') : 'unknown';
  const category = inferCategory(merchant, items);
  const order_summary = summarize(merchant, items, category);
  console.log(`Parsed merchant: ${merchant}`);
  console.log(`Parsed fulfillment_type: ${fulfillment_type}`);
  console.log(`Parsed zip_code: ${zip_code || 'unknown'}`);
  console.log(`Parsed item count: ${items.length}`);
  const metadata = { merchant, order_summary, items, fulfillment_type, zip_code: zip_code || null, city, category, ordered_at, image_url: null, image_alt: `Representative ${category} image for a DoorDash order`, image_model_name: DEFAULT_MODEL_NAME, image_model_url: DEFAULT_MODEL_URL };
  const row = { source: 'doordash', activity_date: activityDateLA(new Date(ordered_at)), title: 'Last DoorDash order', body: `${merchant} — ${order_summary}`, icon: 'food', occurred_at: ordered_at, visibility: 'public', metadata };
  await upsertSupabase(row);
  console.log(`DoorDash sync complete. Stored sanitized public row for ${row.activity_date}; merchant/category only: ${merchant} / ${category}.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
