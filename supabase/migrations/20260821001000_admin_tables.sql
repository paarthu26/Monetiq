-- ---------------------------------------------------------------------------
-- 0010  Super Admin tables.
--
-- Every table here is admin-only: regular users get no policy at all, so RLS
-- denies them by default. Several of these are PROTOTYPE-ONLY (no PRD text)
-- and are flagged as such in the Phase 1 report.
-- ---------------------------------------------------------------------------

-- role_permissions — PROTOTYPE-ONLY, and deliberately INERT.
--
-- The PRD states a flat two-role model: any super_admin can do anything any
-- other super_admin can do. The design prototype nonetheless ships a granular
-- "Roles & permissions" screen. Phase 1 resolves this by storing the toggle
-- state so the Phase 2 UI has something real to bind to, while enforcing the
-- PRD's flat model in RLS. NOTHING in any policy or authorization check reads
-- this table. Flipping a toggle here changes no permission anywhere.
create table if not exists public.role_permissions (
  id             uuid primary key default gen_random_uuid(),
  role           text not null default 'super_admin'
                   check (role in ('user', 'super_admin')),
  permission_key text not null,
  label          text not null,
  description    text,
  enabled        boolean not null default true,
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint role_permissions_role_key_unique unique (role, permission_key)
);

drop trigger if exists role_permissions_set_updated_at on public.role_permissions;
create trigger role_permissions_set_updated_at
  before update on public.role_permissions
  for each row execute function public.set_updated_at();

-- admin_audit_log — PROTOTYPE-ONLY. Append-only: admins may READ it, but no
-- client role may write to it. Rows arrive via triggers and Edge Functions
-- running with the service role (see 0012).
create table if not exists public.admin_audit_log (
  id         uuid primary key default gen_random_uuid(),
  admin_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  target     text,
  target_id  uuid,
  status     text not null default 'successful'
               check (status in ('successful', 'denied')),
  details    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_created_idx
  on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_admin_idx
  on public.admin_audit_log (admin_id, created_at desc);

-- system_service_status — PROTOTYPE-ONLY.
--
-- No monitoring integration is specified anywhere in the requirements, so
-- Phase 1 provides the data shape and admin-only access, and nothing else.
-- There is no polling job, no cron, and no real infrastructure being checked;
-- rows are maintained by hand until a real source is specified.
create table if not exists public.system_service_status (
  id           uuid primary key default gen_random_uuid(),
  service_name text not null unique,
  status       text not null default 'operational'
                 check (status in ('operational', 'warning', 'critical')),
  uptime_pct   numeric(5, 2) check (uptime_pct is null or (uptime_pct >= 0 and uptime_pct <= 100)),
  last_checked timestamptz,
  down_reason  text,
  down_since   timestamptz,
  updated_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists system_service_status_set_updated_at on public.system_service_status;
create trigger system_service_status_set_updated_at
  before update on public.system_service_status
  for each row execute function public.set_updated_at();

-- data_privacy_requests — PROTOTYPE-ONLY.
--
-- No requirement text describes what "export" or "delete" actually produces
-- or triggers, so this is a queue with a status field and nothing behind it.
create table if not exists public.data_privacy_requests (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  request_type text not null check (request_type in ('export', 'delete', 'deactivate')),
  status       text not null default 'pending'
                 check (status in ('pending', 'processing', 'completed', 'rejected')),
  notes        text,
  requested_at timestamptz not null default now(),
  resolved_at  timestamptz,
  resolved_by  uuid references public.profiles (id) on delete set null
);

create index if not exists data_privacy_requests_status_idx
  on public.data_privacy_requests (status, requested_at desc);
create index if not exists data_privacy_requests_user_idx
  on public.data_privacy_requests (user_id, requested_at desc);

-- system_alerts — PROTOTYPE-ONLY. Platform/ops alerts for the Super Admin.
-- Deliberately NOT the same table as alert_notifications (PRD 6.11), which is
-- the user-facing Expense Alerts feed.
create table if not exists public.system_alerts (
  id          uuid primary key default gen_random_uuid(),
  severity    text not null check (severity in ('info', 'warning', 'critical')),
  title       text not null check (length(btrim(title)) > 0),
  body        text,
  service     text,
  is_read     boolean not null default false,
  is_resolved boolean not null default false,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  created_at  timestamptz not null default now()
);

create index if not exists system_alerts_severity_idx
  on public.system_alerts (severity, created_at desc);
create index if not exists system_alerts_open_idx
  on public.system_alerts (created_at desc) where is_resolved = false;

-- ------------------------------------------------------------------ RLS ----
alter table public.role_permissions       enable row level security;
alter table public.admin_audit_log        enable row level security;
alter table public.system_service_status  enable row level security;
alter table public.data_privacy_requests  enable row level security;
alter table public.system_alerts          enable row level security;

drop policy if exists role_permissions_all_admin on public.role_permissions;
create policy role_permissions_all_admin on public.role_permissions
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- READ only, even for admins. There is no INSERT/UPDATE/DELETE policy at all,
-- so the audit trail cannot be edited or erased through PostgREST by anyone.
drop policy if exists admin_audit_log_select_admin on public.admin_audit_log;
create policy admin_audit_log_select_admin on public.admin_audit_log
  for select to authenticated using (public.is_super_admin());

drop policy if exists system_service_status_all_admin on public.system_service_status;
create policy system_service_status_all_admin on public.system_service_status
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists data_privacy_requests_all_admin on public.data_privacy_requests;
create policy data_privacy_requests_all_admin on public.data_privacy_requests
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists system_alerts_all_admin on public.system_alerts;
create policy system_alerts_all_admin on public.system_alerts
  for all to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

-- ----------------------------------------------------------------- seed ----
-- The five toggles the prototype's Roles & permissions screen shows.
insert into public.role_permissions (role, permission_key, label, description, enabled) values
  ('super_admin', 'view_user_data',          'View user data',                     'Display-only toggle. Not enforced anywhere in Phase 1.', true),
  ('super_admin', 'block_accounts',          'Block accounts',                     'Display-only toggle. Not enforced anywhere in Phase 1.', true),
  ('super_admin', 'reply_to_tickets',        'Reply to tickets',                   'Display-only toggle. Not enforced anywhere in Phase 1.', true),
  ('super_admin', 'edit_alert_thresholds',   'Edit alert thresholds platform-wide','Display-only toggle. Not enforced anywhere in Phase 1.', true),
  ('super_admin', 'export_financial_data',   'Export platform financial data',     'Display-only toggle. Not enforced anywhere in Phase 1.', true)
on conflict (role, permission_key) do nothing;

insert into public.system_service_status (service_name, status, uptime_pct, last_checked) values
  ('Supabase Database',   'operational', 100.00, now()),
  ('Supabase Auth',       'operational', 100.00, now()),
  ('Supabase Storage',    'operational', 100.00, now()),
  ('Edge Functions',      'operational', 100.00, now()),
  ('OCR Provider',        'operational', 100.00, now()),
  ('AI Provider',         'operational', 100.00, now())
on conflict (service_name) do nothing;

comment on table public.role_permissions is
  'PROTOTYPE-ONLY and INERT. Stores the Roles & permissions toggle state for the Phase 2 UI. No RLS policy or authorization check reads this table — the enforced model is the PRD flat two-role model.';
comment on table public.system_service_status is
  'PROTOTYPE-ONLY. Data shape only: no monitoring integration or polling job exists, because none is specified in any requirement. Rows are maintained manually in Phase 1.';
comment on table public.admin_audit_log is
  'Append-only. Admins may SELECT; no client INSERT/UPDATE/DELETE policy exists. Written by triggers and Edge Functions using the service role.';
