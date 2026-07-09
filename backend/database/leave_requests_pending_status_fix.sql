-- Fix leave_requests rows that were decided (email or dashboard) but still look pending.
-- Run once in Supabase SQL Editor after leave_requests_workflow_columns.sql.

-- Rows approved via email/dashboard metadata but status still pending/null
update public.leave_requests
set status = 'approved'
where lower(trim(coalesce(status, 'pending'))) in ('', 'pending')
  and (
    approved_at is not null
    or nullif(trim(coalesce(approved_by, '')), '') is not null
    or decision_token_used is true
  );

-- Rows rejected via email/dashboard metadata but status still pending/null
update public.leave_requests
set status = 'rejected'
where lower(trim(coalesce(status, 'pending'))) in ('', 'pending')
  and (
    rejected_at is not null
    or nullif(trim(coalesce(rejected_by, '')), '') is not null
    or nullif(trim(coalesce(rejection_remarks, '')), '') is not null
  );

-- Normalize status casing for consistent filters
update public.leave_requests
set status = lower(trim(status))
where status is not null
  and status <> lower(trim(status));

-- Dashboard pending list (same rule as API is_pending_leave_request)
-- select id, employee_id, leave_date_start, status, approved_at, rejected_at
-- from public.leave_requests
-- where lower(trim(coalesce(status, 'pending'))) in ('', 'pending')
--   and approved_at is null
--   and approved_by is null
--   and rejected_at is null
--   and rejected_by is null
--   and coalesce(decision_token_used, false) = false
-- order by created_at desc;
