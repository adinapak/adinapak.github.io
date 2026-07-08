-- Run this in Supabase SQL Editor.
-- Enables public leaderboard reads and authenticated (including anonymous) writes.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null check (char_length(username) between 1 and 24),
  updated_at timestamptz not null default now()
);

create table if not exists public.zetamac_scores (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  player_id text,
  username text not null check (char_length(username) between 1 and 24),
  spotify_user_id text,
  spotify_display_name text check (spotify_display_name is null or char_length(spotify_display_name) between 1 and 24),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

alter table public.zetamac_scores add column if not exists player_id text;
alter table public.zetamac_scores add column if not exists spotify_user_id text;
alter table public.zetamac_scores add column if not exists spotify_display_name text check (spotify_display_name is null or char_length(spotify_display_name) between 1 and 24);

alter table public.profiles enable row level security;
alter table public.zetamac_scores enable row level security;

-- Read access for everyone (leaderboard is public).
drop policy if exists "profiles are public read" on public.profiles;
create policy "profiles are public read"
on public.profiles for select
using (true);

drop policy if exists "scores are public read" on public.zetamac_scores;
create policy "scores are public read"
on public.zetamac_scores for select
using (true);

-- Users can create/update only their own profile.
drop policy if exists "users can upsert own profile" on public.profiles;
create policy "users can upsert own profile"
on public.profiles for all
using (auth.uid() = id)
with check (auth.uid() = id);

-- Users can insert only their own score rows.
drop policy if exists "users can insert own scores" on public.zetamac_scores;
create policy "users can insert own scores"
on public.zetamac_scores for insert
with check (auth.uid() = user_id);

-- Meal log backing table for the DoorDash card and Belly archive.
create table if not exists public.meal_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ordered_at timestamptz,
  logged_at timestamptz not null default now(),
  source text not null default 'manual',
  restaurant_name text,
  meal_mode text,
  city text,
  state text,
  description text,
  image_url text,
  image_alt text,
  image_description text,
  doordash_activity_date date,
  metadata jsonb not null default '{}',
  visibility text not null default 'public'
);

create unique index if not exists meal_logs_doordash_activity_date_idx
on public.meal_logs (source, doordash_activity_date)
where source = 'doordash' and doordash_activity_date is not null;

alter table public.meal_logs enable row level security;

drop policy if exists "meal logs are public read" on public.meal_logs;
create policy "meal logs are public read"
on public.meal_logs for select
using (visibility = 'public');

-- Server-side writers should use SUPABASE_SERVICE_ROLE_KEY. Create a public
-- Supabase Storage bucket named meal-images for Twilio MMS uploads.
