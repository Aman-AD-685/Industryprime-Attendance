-- Late-arrival CL+SL rule (from 1 Oct 2026), by clock-in time on a present working day:
--   09:32 - 11:01  -> Late          (no CL deducted)
--   11:02 - 13:30  -> Half Day      (0.5 CL+SL deducted)
--   13:31 onward   -> Full Day CL   (1.0 CL+SL deducted)
--
-- The deduction itself is computed from attendance.check_in at request time (Leave + Payroll),
-- so no data change is needed for the numbers. This script only relabels Status OT/SF
-- (final_status) on rows that were saved before the rule existed, so the Attendance grid
-- shows "Half Day" / "Full Day CL" instead of "Late" for October 2026 onward.
-- Run once in Supabase SQL Editor (safe to re-run).

update public.attendance
set final_status = case
  when check_in >= time '13:31' then 'Full Day CL'
  when check_in >= time '11:02' then 'Half Day'
  else final_status
end
where date >= date '2026-10-01'
  and status = 'P'
  and check_in is not null
  and check_in >= time '11:02'
  and extract(dow from date) <> 0            -- skip Sundays
  and date not in (select holiday_date from public.holidays)
  and coalesce(final_status, '') in ('Late', 'OK', 'SF', 'OT', '', 'Present');

-- Preview before running (optional):
-- select employee_id, date, check_in, final_status
-- from public.attendance
-- where date >= '2026-10-01' and check_in >= time '11:02' and status = 'P'
-- order by date;
