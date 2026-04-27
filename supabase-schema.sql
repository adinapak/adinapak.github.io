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
  username text not null check (char_length(username) between 1 and 24),
  score integer not null check (score >= 0),
  created_at timestamptz not null default now()
);

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
