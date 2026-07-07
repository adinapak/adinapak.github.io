# DoorDash receipt feed

This repo syncs the latest DoorDash receipt from Gmail into a public-safe Supabase `activity_feed` row. The homepage reads only that sanitized Supabase row with the public anon key.

## Required GitHub Secrets

Add these in **GitHub → Settings → Secrets and variables → Actions**:

- `GMAIL_CLIENT_ID` — OAuth client ID for the Google Cloud project.
- `GMAIL_CLIENT_SECRET` — OAuth client secret for the same client.
- `GMAIL_REFRESH_TOKEN` — refresh token for the Gmail account that actually receives DoorDash receipts.
- `SUPABASE_URL` — project URL.
- `SUPABASE_SERVICE_ROLE_KEY` — service-role key used only by GitHub Actions.
- `DOORDASH_RECEIPT_QUERY` — optional Gmail search query. If omitted, the script uses `from:(doordash.com) newer_than:45d (receipt OR "order" OR "DoorDash")`.

Never commit OAuth client secrets, refresh tokens, `token.json`, raw receipt HTML, addresses, order numbers, or full receipts.

## Gmail OAuth setup

1. In Google Cloud Console, create or select a project.
2. Enable the **Gmail API**.
3. Configure the OAuth consent screen. A personal/testing app is fine for a personal homepage.
4. Create an OAuth client. A desktop app client is the simplest for generating a one-time refresh token locally.
5. Authenticate as the Gmail account that receives DoorDash receipts, even if it is not the GitHub account.
6. Request Gmail read-only access (`https://www.googleapis.com/auth/gmail.readonly`).
7. Exchange the authorization code for a refresh token locally, then store only the refresh token in `GMAIL_REFRESH_TOKEN`.
8. Delete any local token files after copying the refresh token to GitHub Actions secrets.

## Manual workflow trigger

1. Open the repository on GitHub.
2. Go to **Actions → DoorDash Receipt Sync**.
3. Choose **Run workflow**.
4. The workflow runs `node scripts/sync-doordash.js` on Node 20 and prints only high-level status. It must not print raw email bodies or receipt contents.

The workflow also runs every six hours by cron.

## Public data stored

The sync writes one `activity_feed` row using `source='doordash'`, `visibility='public'`, and `on_conflict=source,activity_date`.

Public columns include:

- `title`: `Last DoorDash order`
- `body`: merchant plus a compact summary
- `icon`: `food`
- `occurred_at`: inferred from Gmail `internalDate`
- `activity_date`: Los Angeles calendar date for the order

Public `metadata` includes only:

- `merchant`
- `items` — compact sanitized item names, when confidently found
- `order_summary`
- `fulfillment_type` — `delivery`, `pickup`, or `unknown`
- `city` — derived from a local zip-to-city map, or `somewhere`
- `category` — one of the local DoorDash image categories
- `ordered_at`
- `image_alt`
- `image_prompt` — generic, non-branded representative-image prompt
- `image_model_name`
- `image_model_url`

## Data intentionally discarded

The parser intentionally does not store or render:

- street address or exact delivery address
- apartment/unit number
- zip code on the frontend
- order number
- Dasher name
- phone number
- email address
- totals, fees, tips, card details, or payment details
- raw receipt HTML
- full receipt text

If parsing is uncertain, the script prefers conservative generic output over storing potentially private receipt details.
