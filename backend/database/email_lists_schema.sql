create extension if not exists pgcrypto;

create table if not exists public.email_lists (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('approval','notification','applicant')),
  email text not null,
  name text,
  approver_email text,
  created_by uuid references public.users(id),
  created_at timestamptz not null default now(),
  unique (kind, email)
);
