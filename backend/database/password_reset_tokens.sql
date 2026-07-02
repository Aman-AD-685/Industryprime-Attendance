-- Backend-owned password reset tokens.
-- Run in Supabase SQL Editor after backend/database/auth_schema.sql.

create extension if not exists pgcrypto;

create table if not exists public.password_reset_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists password_reset_tokens_user_id_idx
  on public.password_reset_tokens (user_id);

create index if not exists password_reset_tokens_token_hash_idx
  on public.password_reset_tokens (token_hash);

create index if not exists password_reset_tokens_expires_at_idx
  on public.password_reset_tokens (expires_at);

alter table public.password_reset_tokens enable row level security;

-- FastAPI uses the service role key for this table and enforces reset-token access.
