# Oura activity feed

This project should not call the Oura API from frontend JavaScript. The homepage reads a public, sanitized row from Supabase. A scheduled GitHub Actions job fetches Oura data with secrets and writes only the public step-count summary.

## Required GitHub Actions secrets

Add these in GitHub: Settings -> Secrets and variables -> Actions -> New repository secret.

- `OURA_CLIENT_ID`
- `OURA_CLIENT_SECRET`
- `OURA_REFRESH_TOKEN`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Rotate the Oura client secret before adding it, because it was visible during setup.

## Supabase SQL

```sql
create table if not exists activity_feed (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  title text not null,
  body text,
  icon text,
  occurred_at timestamptz not null default now(),
  visibility text not null default 'public',
  metadata jsonb not null default '{}'::jsonb
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

The scheduled workflow uses the Supabase service role key to write rows. Do not expose the service role key in frontend code.

## Oura row shape

```json
{
  "source": "oura",
  "title": "Today's steps",
  "body": "8,421 steps",
  "icon": "steps",
  "visibility": "public",
  "metadata": {
    "steps": 8421,
    "date": "2026-04-29"
  }
}
```
