-- Add "applicant" kind: map employee email → display name in leave approval emails.
-- Run in Supabase SQL Editor once.

alter table public.email_lists drop constraint if exists email_lists_kind_check;

alter table public.email_lists
  add constraint email_lists_kind_check
  check (kind in ('approval', 'notification', 'applicant'));

comment on column public.email_lists.kind is
  'approval = Approve/Reject recipients; notification = FYI; applicant = leave apply email → display name';
