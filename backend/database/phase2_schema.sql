-- Phase 2 — HRIS core tables (Supabase SQL Editor)
--
-- If you already use multi-tenant tables (tenants/profiles/attendance_records), back up data first.
-- This script DROPS conflicting public table names.

create extension if not exists "pgcrypto";

drop table if exists public.attendance_logs_raw cascade;
drop table if exists public.attendance cascade;
drop table if exists public.employees cascade;

-- Employees master (required before attendance rows)
create table public.employees (
  id uuid primary key default gen_random_uuid(),
  employee_code text not null unique,
  name text,
  email text,
  department text,
  designation text,
  created_at timestamptz not null default now()
);

-- Clean attendance (linked by employee_id)
-- final_status: derived by FastAPI rules engine (present / late / half_day / etc.)
create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  check_in time not null,
  check_out time not null,
  working_hours numeric not null,
  status text,
  late_minutes int not null default 0,
  overtime_hours numeric not null default 0,
  final_status text,
  source text not null default 'excel',
  created_at timestamptz not null default now(),
  unique (employee_id, date)
);

-- Raw device / integration logs (process later → attendance)
create table public.attendance_logs_raw (
  id uuid primary key default gen_random_uuid(),
  device_user_id text,
  "timestamp" timestamptz,
  device_id text,
  raw_json jsonb,
  created_at timestamptz not null default now()
);

-- RLS: allow authenticated users (JWT from Supabase Auth) full access.
-- Backend calls PostgREST with the user access token.
alter table public.employees enable row level security;
alter table public.attendance enable row level security;
alter table public.attendance_logs_raw enable row level security;

create policy employees_select_auth on public.employees
  for select to authenticated using (true);
create policy employees_insert_auth on public.employees
  for insert to authenticated with check (true);
create policy employees_update_auth on public.employees
  for update to authenticated using (true) with check (true);
create policy employees_delete_auth on public.employees
  for delete to authenticated using (true);

create policy attendance_select_auth on public.attendance
  for select to authenticated using (true);
create policy attendance_insert_auth on public.attendance
  for insert to authenticated with check (true);
create policy attendance_update_auth on public.attendance
  for update to authenticated using (true) with check (true);
create policy attendance_delete_auth on public.attendance
  for delete to authenticated using (true);

create policy raw_logs_select_auth on public.attendance_logs_raw
  for select to authenticated using (true);
create policy raw_logs_insert_auth on public.attendance_logs_raw
  for insert to authenticated with check (true);
create policy raw_logs_update_auth on public.attendance_logs_raw
  for update to authenticated using (true) with check (true);
create policy raw_logs_delete_auth on public.attendance_logs_raw
  for delete to authenticated using (true);
