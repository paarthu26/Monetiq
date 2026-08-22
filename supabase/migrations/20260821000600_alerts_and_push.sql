-- ---------------------------------------------------------------------------
-- 0006  Expense Alerts (6.11) and web push subscriptions.
--
-- These are the USER-facing alerts. Platform/ops alerts for the Super Admin
-- are a separate table (system_alerts, 0011) and are deliberately not
-- conflated with these.
-- ---------------------------------------------------------------------------

create table if not exists public.alert_settings (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  alert_type      text not null check (alert_type in (
                    'overspending', 'budget_limit', 'emi_reminder', 'unusual_transaction'
                  )),
  threshold_value numeric(14, 2) check (threshold_value is null or threshold_value >= 0),
  enabled         boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint alert_settings_user_type_key unique (user_id, alert_type)
);

drop trigger if exists alert_settings_set_updated_at on public.alert_settings;
create trigger alert_settings_set_updated_at
  before update on public.alert_settings
  for each row execute function public.set_updated_at();

create table if not exists public.alert_notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  alert_type text not null check (alert_type in (
               'overspending', 'budget_limit', 'emi_reminder', 'unusual_transaction'
             )),
  message    text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists alert_notifications_user_idx
  on public.alert_notifications (user_id, created_at desc);
create index if not exists alert_notifications_unread_idx
  on public.alert_notifications (user_id) where is_read = false;

create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  endpoint   text not null,
  keys       jsonb not null,
  user_agent text,
  created_at timestamptz not null default now(),
  constraint push_subscriptions_user_endpoint_key unique (user_id, endpoint)
);

create index if not exists push_subscriptions_user_idx
  on public.push_subscriptions (user_id);

-- ------------------------------------------------------------------ RLS ----
alter table public.alert_settings      enable row level security;
alter table public.alert_notifications enable row level security;
alter table public.push_subscriptions  enable row level security;

-- alert_settings: fully owner-managed (thresholds are user-configurable).
drop policy if exists alert_settings_select_own on public.alert_settings;
create policy alert_settings_select_own on public.alert_settings
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists alert_settings_insert_own on public.alert_settings;
create policy alert_settings_insert_own on public.alert_settings
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active());

drop policy if exists alert_settings_update_own on public.alert_settings;
create policy alert_settings_update_own on public.alert_settings
  for update to authenticated
  using (auth.uid() = user_id and public.is_account_active())
  with check (auth.uid() = user_id);

drop policy if exists alert_settings_delete_own on public.alert_settings;
create policy alert_settings_delete_own on public.alert_settings
  for delete to authenticated
  using (auth.uid() = user_id and public.is_account_active());

-- alert_notifications: the owner reads, marks read, and dismisses. INSERT is
-- service-role only — a fired alert is a system statement about the user's
-- data, not something a client should be able to fabricate.
drop policy if exists alert_notifications_select_own on public.alert_notifications;
create policy alert_notifications_select_own on public.alert_notifications
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists alert_notifications_update_own on public.alert_notifications;
create policy alert_notifications_update_own on public.alert_notifications
  for update to authenticated
  using (auth.uid() = user_id and public.is_account_active())
  with check (auth.uid() = user_id);

drop policy if exists alert_notifications_delete_own on public.alert_notifications;
create policy alert_notifications_delete_own on public.alert_notifications
  for delete to authenticated
  using (auth.uid() = user_id and public.is_account_active());

-- push_subscriptions: owner-managed.
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists push_subscriptions_insert_own on public.push_subscriptions;
create policy push_subscriptions_insert_own on public.push_subscriptions
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active());

drop policy if exists push_subscriptions_update_own on public.push_subscriptions;
create policy push_subscriptions_update_own on public.push_subscriptions
  for update to authenticated
  using (auth.uid() = user_id and public.is_account_active())
  with check (auth.uid() = user_id);

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete to authenticated
  using (auth.uid() = user_id and public.is_account_active());

comment on table public.alert_notifications is
  'User-facing fired Expense Alerts (PRD 6.11). Distinct from public.system_alerts, which is the admin/ops feed.';
