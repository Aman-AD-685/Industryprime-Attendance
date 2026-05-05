-- PDF attendance upload: schema extensions (run in Supabase SQL Editor after phase2 + payroll updates).
-- Backend uses service role; RLS enabled with no policies blocks PostgREST anon/authenticated direct access.

-- Match device/PDF "EMP Code" to employees (falls back to employee_code in app if at_div_code is null).
alter table public.employees
  add column if not exists at_div_code text;

create unique index if not exists employees_at_div_code_unique
  on public.employees (at_div_code)
  where at_div_code is not null and trim(at_div_code) <> '';

create index if not exists employees_at_div_code_lookup_idx
  on public.employees (at_div_code)
  where at_div_code is not null and trim(at_div_code) <> '';

-- Traceability + rollback: delete from attendance where upload_id = '<uuid>';
alter table public.attendance
  add column if not exists upload_id uuid;

create index if not exists attendance_upload_id_idx
  on public.attendance (upload_id)
  where upload_id is not null;

comment on column public.attendance.upload_id is 'Set for rows inserted via PDF batch import; use for audit rollback.';

-- Per-upload summary (polled by UI after async processing).
create table if not exists public.attendance_upload_logs (
  upload_id uuid primary key,
  status text not null default 'processing' check (status in ('processing', 'completed', 'failed')),
  total_rows int not null default 0,
  success_count int not null default 0,
  failed_count int not null default 0,
  unmapped_count int not null default 0,
  duplicate_user_error_count int not null default 0,
  error_details jsonb not null default '{"errors": [], "rows": []}'::jsonb,
  preview_text_truncated text,
  uploaded_at timestamptz not null default now(),
  completed_at timestamptz,
  overwrite boolean not null default false,
  dry_run boolean not null default false
);

create index if not exists attendance_upload_logs_uploaded_at_idx
  on public.attendance_upload_logs (uploaded_at desc);

-- Short-lived upload tokens (hash only; never store plaintext).
create table if not exists public.attendance_upload_tokens (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  expires_at timestamptz not null,
  label text,
  created_at timestamptz not null default now()
);

create index if not exists attendance_upload_tokens_expires_idx
  on public.attendance_upload_tokens (expires_at);

alter table public.attendance_upload_logs enable row level security;
alter table public.attendance_upload_tokens enable row level security;

-- Rollback example (after verifying upload_id from UI or logs):
-- delete from public.attendance where upload_id = '00000000-0000-0000-0000-000000000000';

-- Optional: backfill PDF / device codes from existing employee codes (adjust as needed).
-- update public.employees set at_div_code = trim(regexp_replace(employee_code, '\D', '', 'g'))
-- where (at_div_code is null or trim(at_div_code) = '') and employee_code ~ '^[0-9]+';
