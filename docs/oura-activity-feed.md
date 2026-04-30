# Oura activity feed

This homepage integration is intentionally simple and safe:

- GitHub Actions calls Oura with a single personal access token secret (`OURA_ACCESS_TOKEN`).
- The workflow writes a **public** sanitized row into Supabase `activity_feed` with `source='oura'`.
- Frontend JavaScript reads only from Supabase `activity_feed` using the public anon key.
- Frontend does **not** call Oura and never uses private tokens.

## Required GitHub Actions secrets

Add these in GitHub: **Settings → Secrets and variables → Actions → New repository secret**.

- `OURA_ACCESS_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Supabase SQL

Run this SQL in Supabase SQL Editor:

```sql
create extension if not exists pgcrypto;

create table if not exists activity_feed (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text not null,
  body text,
  icon text,
  occurred_at timestamptz not null default now(),
  visibility text not null default 'public',
  metadata jsonb not null default '{}'::jsonb,
  unique (source, (metadata->>'date'))
);

create index if not exists activity_feed_source_visibility_occurred_at_idx
  on activity_feed (source, visibility, occurred_at desc);

alter table activity_feed enable row level security;

drop policy if exists "Public can read public activity" on activity_feed;
create policy "Public can read public activity"
  on activity_feed
  for select
  using (visibility = 'public');
```

## Workflow behavior

`.github/workflows/oura-sync.yml`:

1. Runs on `schedule` and `workflow_dispatch`.
2. Calls:
   - `GET https://api.ouraring.com/v2/usercollection/daily_activity?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD`
   - Header: `Authorization: Bearer $OURA_ACCESS_TOKEN`
3. Extracts `steps` from the response (`.data[0].steps`, default `0` if missing).
4. Upserts into Supabase via PostgREST with `Prefer: resolution=merge-duplicates`.

## Row shape written to `activity_feed`

```json
{
  "source": "oura",
  "title": "Today's steps",
  "body": "8421 steps",
  "icon": "steps",
  "visibility": "public",
  "metadata": {
    "steps": 8421,
    "date": "2026-04-30"
  }
}
```

## Frontend setup notes

- Ensure `supabase-config.js` defines:
  - `window.SUPABASE_URL`
  - `window.SUPABASE_ANON_KEY`
- The homepage Oura card queries:
  - `/rest/v1/activity_feed?source=eq.oura&visibility=eq.public&order=occurred_at.desc&limit=1`
