create extension if not exists pgcrypto;

-- OTP signup storage. Recommended for production (rate limits + audit).
-- Without these tables, the API uses a signed signup_ticket in the browser until you run this script.
create table if not exists public.pending_signups (
  email text primary key,
  name text not null,
  password_hash text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.otp_codes (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  code_hash text not null,
  purpose text not null check (purpose in ('signup','login')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  attempt_count int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists otp_codes_email_purpose_created_idx
  on public.otp_codes (email, purpose, created_at desc);
