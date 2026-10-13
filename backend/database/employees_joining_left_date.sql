-- Employees: joining date (salary counts from it) and left date (salary pauses after it).
-- Run in Supabase SQL Editor BEFORE deploying the backend that selects these columns.

alter table public.employees
  add column if not exists joining_date date;

alter table public.employees
  add column if not exists left_date date;

comment on column public.employees.joining_date is
  'Salary / attendance count starts on this date (days before it are unpaid; hidden from months before it)';
comment on column public.employees.left_date is
  'Set when marked Left; salary counts through this date, hidden from the next month onward';

-- Backfill already-left employees to the LAST day of their left month so existing payroll
-- numbers do not change (the old rule paid the whole left month).
update public.employees
set left_date = (make_date(left_effective_year, left_effective_month, 1) + interval '1 month - 1 day')::date
where employment_status = 'left'
  and left_date is null
  and left_effective_year is not null
  and left_effective_month is not null;

-- Optional: set joining dates for existing staff (payroll falls back to the first attendance
-- upload when joining_date is NULL, so this is not required).
-- update public.employees set joining_date = '2024-04-01' where employee_code = 'EMP0001';
