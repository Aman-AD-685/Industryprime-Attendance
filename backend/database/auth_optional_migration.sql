-- Optional HRIS auth enhancements (run in Supabase SQL Editor if not already applied).
-- Required for login/signup: backend/database/auth_schema.sql
-- Required for OTP signup: backend/database/otp_schema.sql

-- Optional: account active flag (FMS-style inactive user block at login).
alter table public.users
  add column if not exists is_active boolean not null default true;

create index if not exists users_is_active_idx on public.users (is_active) where is_active = true;

-- No refresh_token table needed — HRIS uses stateless JWT refresh tokens (see POST /auth/refresh).
