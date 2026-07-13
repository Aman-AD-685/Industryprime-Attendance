-- Employee employment status: Current Emp (default) or Left.
-- Left employees stay visible in the month marked; hidden from Attendance/Payroll from next month.

alter table public.employees
  add column if not exists employment_status text not null default 'current';

alter table public.employees
  add column if not exists left_effective_month int;

alter table public.employees
  add column if not exists left_effective_year int;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'employees_employment_status_check'
  ) then
    alter table public.employees
      add constraint employees_employment_status_check
      check (employment_status in ('current', 'left'));
  end if;
end $$;

comment on column public.employees.employment_status is 'current = active; left = hidden from attendance/payroll after left_effective month';
comment on column public.employees.left_effective_month is 'Month when marked Left (1-12); visible through this month only';
comment on column public.employees.left_effective_year is 'Year when marked Left';
