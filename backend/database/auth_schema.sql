-- IndustryPrime-Attendance backend-owned authentication schema.
-- Run this in the Supabase SQL Editor before using /auth/signup or /auth/login.

create extension if not exists pgcrypto;

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  email text not null unique,
  password_hash text not null,
  role text not null default 'user' check (role in ('master_admin', 'admin', 'user')),
  created_at timestamptz not null default now()
);

create index if not exists users_role_idx on public.users (role);
create unique index if not exists users_email_lower_idx on public.users (lower(email));

-- Signup always inserts role='user' from FastAPI. To promote the first owner:
-- update public.users set role = 'master_admin' where email = 'owner@example.com';

alter table public.users enable row level security;

-- FastAPI uses the service role key for this table and enforces access in the API.
-- No browser/client policies are added because auth is not handled by Supabase Auth.
