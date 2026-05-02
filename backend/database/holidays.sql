-- Company holidays: dates with no IN/OUT are auto Present in attendance (all employees).
-- Run in Supabase SQL Editor (or psql). Safe to re-run: upserts by holiday_date.

create table if not exists public.holidays (
  holiday_date date not null primary key,
  name text not null
);

alter table public.holidays enable row level security;

drop policy if exists holidays_select_auth on public.holidays;
create policy holidays_select_auth on public.holidays
  for select to authenticated using (true);

insert into public.holidays (holiday_date, name) values
  ('2026-01-01', 'New Year''s Day'),
  ('2026-01-26', 'Republic Day'),
  ('2026-03-03', 'Doljatra'),
  ('2026-03-04', 'Holi'),
  ('2026-05-01', 'May Day'),
  ('2026-08-15', 'Independence Day'),
  ('2026-09-14', 'Ganesh Chaturthi'),
  ('2026-10-02', 'Gandhi Jayanti'),
  ('2026-10-17', 'Dussehra/Durga Puja (Maha Saptami)'),
  ('2026-10-18', 'Dussehra/Durga Puja (Maha Saptami)'),
  ('2026-10-19', 'Dussehra/Durga Puja (Maha Asthami)'),
  ('2026-10-20', 'Dussehra/Durga Puja (Maha Navami)'),
  ('2026-10-21', 'Dussehra/Durga Puja (Maha Dashami)'),
  ('2026-11-08', 'Kalipuja'),
  ('2026-11-09', 'Diwali'),
  ('2026-11-11', 'Bhai Duj/ Bhai Fota'),
  ('2026-12-25', 'Christmas Day')
on conflict (holiday_date) do update set name = excluded.name;
