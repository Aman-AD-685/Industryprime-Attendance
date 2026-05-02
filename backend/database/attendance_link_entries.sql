-- Public "Add Attendance" form submissions (isolated from internal `public.attendance`).
-- Run in Supabase SQL Editor after `phase2_schema.sql` / employees exist.

create table if not exists public.attendance_link_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.employees (id) on delete cascade,
  date date not null,
  in_time time,
  out_time time,
  month int not null check (month >= 1 and month <= 12),
  year int not null check (year >= 2000 and year <= 2100),
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists attendance_link_entries_user_month_idx
  on public.attendance_link_entries (user_id, year, month);

alter table public.attendance_link_entries enable row level security;

-- No policies: anon/authenticated JWT cannot access via PostgREST.
-- FastAPI uses the Supabase service role, which bypasses RLS.

comment on table public.attendance_link_entries is 'Month-wise attendance rows submitted via public /attendance-entry form.';

-- Optional: set OUT (or change IN) by hand in SQL Editor (same effect as Edit + Save on /attendance-entry).
-- Example — replace employee_code and dates/times as needed:
--
-- update public.attendance_link_entries e
-- set
--   out_time = '18:00:00'::time,
--   month = extract(month from e.date)::int,
--   year = extract(year from e.date)::int
-- from public.employees emp
-- where e.user_id = emp.id
--   and emp.employee_code = 'EMP0001'
--   and e.date = date '2026-05-01';
