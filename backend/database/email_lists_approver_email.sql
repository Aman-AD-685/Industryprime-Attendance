-- Per-applicant approver for Leave apply from rows.
-- applicant.email = ID mail; name = employee; approver_email = who gets Approve/Reject.

alter table public.email_lists
  add column if not exists approver_email text;

comment on column public.email_lists.approver_email is
  'kind=applicant only: approver inbox for leaves applied from email (not global Approval list).';
