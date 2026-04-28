-- Payroll, attendance, and leave management update.
-- Run this in Supabase SQL Editor after auth_schema.sql and phase2_schema.sql.

alter table public.employees
  add column if not exists salary_monthly numeric not null default 0;

alter table public.attendance
  alter column check_in drop not null,
  alter column check_out drop not null,
  alter column working_hours set default 0;

create table if not exists public.leave_balances (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  year int not null,
  total_leave numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, year)
);

create table if not exists public.leave_requests (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references public.employees (id) on delete cascade,
  employee_code text,
  leave_date_start date not null,
  leave_date_end date not null,
  leave_type text,
  reason text,
  status text not null default 'pending',
  days numeric,
  not_deducted_days numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.leave_requests
  add column if not exists employee_id uuid references public.employees (id) on delete cascade,
  add column if not exists employee_code text,
  add column if not exists leave_date_start date,
  add column if not exists leave_date_end date,
  add column if not exists leave_type text,
  add column if not exists reason text,
  add column if not exists status text not null default 'pending',
  add column if not exists days numeric,
  add column if not exists not_deducted_days numeric not null default 0,
  add column if not exists updated_at timestamptz not null default now();

alter table public.leave_balances enable row level security;
alter table public.leave_requests enable row level security;

drop policy if exists leave_balances_all_auth on public.leave_balances;
create policy leave_balances_all_auth on public.leave_balances
  for all to authenticated using (true) with check (true);

drop policy if exists leave_requests_all_auth on public.leave_requests;
create policy leave_requests_all_auth on public.leave_requests
  for all to authenticated using (true) with check (true);

create index if not exists employees_email_idx on public.employees (lower(email));
create index if not exists attendance_employee_date_idx on public.attendance (employee_id, date);
create index if not exists attendance_date_idx on public.attendance (date);
create index if not exists leave_balances_employee_year_idx on public.leave_balances (employee_id, year);
create index if not exists leave_requests_employee_date_idx on public.leave_requests (employee_id, leave_date_start);
create index if not exists leave_requests_code_date_idx on public.leave_requests (employee_code, leave_date_start);
create index if not exists leave_requests_status_idx on public.leave_requests (status);
