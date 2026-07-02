-- Effective-dated monthly salary for payroll (run in Supabase SQL Editor).
-- Payroll uses the latest row where (effective_year, effective_month) <= payslip month.

create table if not exists public.employee_salary_history (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  salary_monthly numeric(14, 2) not null check (salary_monthly >= 0),
  effective_year int not null check (effective_year between 2000 and 2100),
  effective_month int not null check (effective_month between 1 and 12),
  created_at timestamptz not null default now(),
  unique (employee_id, effective_year, effective_month)
);

create index if not exists employee_salary_history_lookup_idx
  on public.employee_salary_history (employee_id, effective_year desc, effective_month desc);
