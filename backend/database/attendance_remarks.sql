-- Master Admin manual In/Out time entry — one remarks note per employee per date.
-- Run in Supabase SQL Editor after phase2_schema.sql / auth_schema.sql.

alter table public.attendance
  add column if not exists remarks text;

comment on column public.attendance.remarks is
  'Required audit note when Master Admin manually sets or changes check_in/check_out for this date.';
