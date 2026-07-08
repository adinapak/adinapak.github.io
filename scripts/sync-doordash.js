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

const ZIP_LOCATIONS = new Map([
  ['90274', { city: 'Palos Verdes', state: 'CA' }],
  ['90275', { city: 'Rancho Palos Verdes', state: 'CA' }],
  ['90272', { city: 'Pacific Palisades', state: 'CA' }]
]);

function requireEnv(name) { const value = process.env[name]; if (!value) throw new Error(`Missing required env var: ${name}`); return value; }
function decodeBase64Url(data = '') { return Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
function htmlToText(html) { return decodeHtmlEntities(html.replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<br\s*\/?\s*>/gi, '\n').replace(/<\/p>|<\/div>|<\/tr>|<\/li>/gi, '\n').replace(/<[^>]+>/g, ' ')); }
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
function decodeHtmlEntities(text = '') { return text.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>'); }
function normalizeMerchantName(merchant) { const cleaned = cleanLine(merchant || '').replace(/^(?:from|at)\s+/i, '').replace(/[|•].*$/, '').trim(); return cleaned.toLowerCase() === 'misc' ? 'misc coffee' : cleaned; }
function trimMerchantCandidate(candidate) { return normalizeMerchantName((candidate || '').split(/\n|\r|\s+[—–-]\s+|\s+View order\b|\s+Receipt\b|\s+Order details\b|\s+Subtotal\b|\s+Total\b|\s+Help\b|\s+DoorDash\b/i)[0]).slice(0, 70); }
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
  return hay.match(/Order Confirmation for Adina\s+from\s+(.{1,140})/i)
    || hay.match(/Order Confirmation for Adina[^\n]{0,80}?\bfrom\s+(.{1,140})/i);
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
  if (receiptMatch) return trimMerchantCandidate(receiptMatch[1]).replace(/\s+(?:is confirmed|has been.*)$/i, '').trim();
  const patterns = [/Thanks for your order from\s+([^\n.!]+)/i, /Your order from\s+([^\n.!]+)/i, /order from\s+([^\n.!]+)/i, /receipt from\s+([^\n.!]+)/i];
  for (const re of patterns) { const m = hay.match(re); if (m) return trimMerchantCandidate(m[1]).replace(/\s+has been.*$/i, '').trim(); }
  const idx = hay.search(/Order Confirmation for Adina/i);
  if (idx >= 0) {
    const nearby = hay.slice(idx, idx + 600).split('\n').map(cleanLine).filter(Boolean).find(l => !/Order Confirmation|DoorDash|receipt|confirmation|thanks/i.test(l) && !isUnsafeLine(l));
    if (nearby) return normalizeMerchantName(nearby).slice(0, 70);
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
function inferLocation(zip) {
  if (!zip) return { city: 'unknown', state: null };
  if (ZIP_LOCATIONS.has(zip)) return ZIP_LOCATIONS.get(zip);
  if (/^(900|901|902)\d{2}$/.test(zip)) return { city: 'Los Angeles', state: 'CA' };
  if (/^941\d{2}$/.test(zip)) return { city: 'San Francisco', state: 'CA' };
  if (/^947\d{2}$/.test(zip)) return { city: 'Berkeley', state: 'CA' };
  if (/^946\d{2}$/.test(zip)) return { city: 'Oakland', state: 'CA' };
  return { city: 'unknown', state: null };
}
function extractVendorUrl(html, merchant) {
  const decoded = decodeHtmlEntities(html || '');
  const hrefs = [...decoded.matchAll(/href=["']([^"']+)["']/gi)].map(m => decodeHtmlEntities(m[1]));
  const cleanMerchantSlug = normalizeMerchantName(merchant).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const candidates = hrefs.filter(href => /^https?:\/\//i.test(href) && /doordash\.com/i.test(href) && !/unsubscribe|privacy|help|support|email-preferences/i.test(href));
  return candidates.find(href => /doordash\.com\/store/i.test(href))
    || candidates.find(href => cleanMerchantSlug && href.toLowerCase().includes(cleanMerchantSlug))
    || null;
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
async function supabaseFetch(path, init = {}) {
  const url = requireEnv('SUPABASE_URL').replace(/\/$/, '');
  const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  const res = await fetch(`${url}${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      ...(init.headers || {})
    }
  });
  if (!res.ok) throw new Error(`Supabase request failed (${res.status}): ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}
async function upsertSupabase(row) {
  return supabaseFetch('/rest/v1/activity_feed?on_conflict=source,activity_date', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify(row)
  });
}
function isManualMealEdit(row) {
  const metadata = row?.metadata || {};
  return Boolean(metadata.manual_image_note || metadata.manual_updated_at || metadata.twilio_media_sid || row?.source === 'manual');
}
async function upsertMealLog(meal) {
  const query = new URLSearchParams({
    source: 'eq.doordash',
    doordash_activity_date: `eq.${meal.doordash_activity_date}`,
    visibility: 'eq.public',
    limit: '1'
  });
  const existing = await supabaseFetch(`/rest/v1/meal_logs?${query}`);
  const current = Array.isArray(existing) ? existing[0] : null;
  if (!current) {
    return supabaseFetch('/rest/v1/meal_logs', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(meal)
    });
  }
  const manual = isManualMealEdit(current);
  const patch = {
    ordered_at: meal.ordered_at,
    source: 'doordash',
    restaurant_name: current.restaurant_name || meal.restaurant_name,
    meal_mode: current.meal_mode || meal.meal_mode,
    city: current.city || meal.city,
    state: current.state || meal.state,
    description: manual && current.description ? current.description : meal.description,
    image_url: manual && current.image_url ? current.image_url : (current.image_url || meal.image_url),
    image_alt: manual && current.image_alt ? current.image_alt : (current.image_alt || meal.image_alt),
    doordash_activity_date: meal.doordash_activity_date,
    metadata: { ...(meal.metadata || {}), ...(current.metadata || {}) },
    visibility: 'public'
  };
  return supabaseFetch(`/rest/v1/meal_logs?id=eq.${current.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(patch)
  });
}

async function main() {
  const query = process.env.DOORDASH_RECEIPT_QUERY || DEFAULT_QUERY;
  console.log('Starting DoorDash receipt sync. Query window configured; raw messages will not be logged.');
  const accessToken = await getAccessToken();
  const list = await gmailFetch(`?${new URLSearchParams({ q: query, maxResults: String(MAX_CANDIDATES) })}`, accessToken);
  const candidates = list.messages || [];
  console.log(`Fetched ${candidates.length} DoorDash candidate emails.`);
  if (!candidates.length) throw new Error('No DoorDash receipt candidates found.');
  let message, text = '', subject = '', html = '';
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
    html = parts.html.join('\n');
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
  const { city, state } = inferLocation(zip_code);
  const category = inferCategory(merchant, items);
  const order_summary = summarize(merchant, items, category);
  const vendor_url = extractVendorUrl(html, merchant);
  console.log(`Parsed merchant: ${merchant}`);
  console.log(`Parsed fulfillment_type: ${fulfillment_type}`);
  console.log(`Parsed zip_code: ${zip_code || 'unknown'}`);
  console.log(`Parsed item count: ${items.length}`);
  const metadata = { merchant, order_summary, items, fulfillment_type, zip_code: zip_code || null, city, state, vendor_url, category, ordered_at, image_url: null, image_alt: `Representative ${category} image for a DoorDash order`, image_model_name: DEFAULT_MODEL_NAME, image_model_url: DEFAULT_MODEL_URL };
  const row = { source: 'doordash', activity_date: activityDateLA(new Date(ordered_at)), title: 'Last DoorDash order', body: `${merchant} — ${order_summary}`, icon: 'food', occurred_at: ordered_at, visibility: 'public', metadata };
  await upsertSupabase(row);
  await upsertMealLog({
    ordered_at,
    source: 'doordash',
    restaurant_name: merchant,
    meal_mode: fulfillment_type,
    city: city === 'unknown' ? null : city,
    state,
    description: order_summary,
    image_url: metadata.image_url,
    image_alt: metadata.image_alt,
    doordash_activity_date: row.activity_date,
    metadata: { category, vendor_url, zip_code: zip_code || null, items, order_summary, fulfillment_type },
    visibility: 'public'
  });
  console.log(`DoorDash sync complete. Stored sanitized public row and meal log for ${row.activity_date}; merchant/category only: ${merchant} / ${category}.`);
}

main().catch(err => { console.error(err.message); process.exit(1); });
