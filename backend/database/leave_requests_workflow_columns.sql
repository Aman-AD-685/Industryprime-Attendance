-- Leave email approval workflow (run in Supabase SQL editor).
-- Adds audit fields, single-use token id, and rejection metadata for public.email_decision links.

alter table public.leave_requests
  add column if not exists approved_by text,
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_by text,
  add column if not exists rejected_at timestamptz,
  add column if not exists rejection_remarks text,
  add column if not exists decision_token_used boolean default false,
  add column if not exists email_decision_jti text;

create index if not exists leave_requests_status_created_idx
  on public.leave_requests (status, created_at desc);

create index if not exists leave_requests_employee_created_idx
  on public.leave_requests (employee_id, created_at desc);

comment on column public.leave_requests.email_decision_jti is
  'Last consumed decision-token jti (single-use email approve/reject).';

comment on column public.leave_requests.decision_token_used is
  'True after a successful email-token decision (approve/reject).';
