-- ---------------------------------------------------------------------------
-- 0007  AI: shared usage quota, chatbot conversations, provider configuration.
--
-- The weekly quota (2 successful AI generations per user per week) is ONE
-- shared counter across every AI feature — chatbot, bank statement report and
-- loan closure suggestion all decrement the same allowance. It is enforced
-- server-side in the Edge Functions because it is a cross-row rule that RLS
-- cannot express.
--
-- Quota integrity is why ai_usage_log has no client INSERT/UPDATE/DELETE
-- policy: if a user could delete their own log rows they could reset their
-- own quota. This is a deliberate narrowing of the generic "owner has full
-- CRUD" rule and is flagged in the Phase 1 report.
-- ---------------------------------------------------------------------------

create table if not exists public.ai_usage_log (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  feature      text not null check (feature in (
                 'chatbot', 'bank_statement_report', 'loan_closure_suggestion'
               )),
  status       text not null check (status in ('success', 'failed')),
  provider     text,
  model        text,
  prompt_tokens     integer,
  completion_tokens integer,
  cost_usd     numeric(12, 6),
  duration_ms  integer,
  error_code   text,
  created_at   timestamptz not null default now()
);

create index if not exists ai_usage_log_user_created_idx
  on public.ai_usage_log (user_id, created_at desc);
-- Backs the quota count directly.
create index if not exists ai_usage_log_quota_idx
  on public.ai_usage_log (user_id, created_at desc) where status = 'success';
-- Backs the Super Admin AI Management dashboard.
create index if not exists ai_usage_log_provider_created_idx
  on public.ai_usage_log (provider, created_at desc);

-- Start of the current quota week, anchored to Monday 00:00 India time. The
-- product is India-only, so a UTC week boundary would roll over at 05:30 IST
-- and surprise users.
create or replace function public.ai_week_start(p_at timestamptz default now())
returns timestamptz
language sql
stable
as $$
  select (date_trunc('week', p_at at time zone 'Asia/Kolkata')) at time zone 'Asia/Kolkata';
$$;

-- SECURITY INVOKER on purpose: the caller's RLS on ai_usage_log decides what
-- they can count, so a user can only ever see their own quota. Edge Functions
-- call this with the service role and bypass RLS.
create or replace function public.ai_quota_status(p_uid uuid default auth.uid())
returns table (
  used         integer,
  weekly_limit integer,
  remaining    integer,
  week_start   timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    count(*)::integer,
    2,
    greatest(0, 2 - count(*)::integer),
    public.ai_week_start()
  from public.ai_usage_log l
  where l.user_id = p_uid
    and l.status = 'success'
    and l.created_at >= public.ai_week_start();
$$;

comment on function public.ai_quota_status(uuid) is
  'Shared weekly AI quota (2 successful generations/user/week) across chatbot, bank statement report and loan closure suggestion. Counts ai_usage_log, not per-feature counters.';

-- -------------------------------------------------------------- chatbot ----
create table if not exists public.ai_chat_conversations (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  title      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_chat_conversations_user_idx
  on public.ai_chat_conversations (user_id, updated_at desc);

drop trigger if exists ai_chat_conversations_set_updated_at on public.ai_chat_conversations;
create trigger ai_chat_conversations_set_updated_at
  before update on public.ai_chat_conversations
  for each row execute function public.set_updated_at();

create table if not exists public.ai_chat_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_chat_conversations (id) on delete cascade,
  role            text not null check (role in ('user', 'assistant')),
  content         text not null,
  created_at      timestamptz not null default now()
);

create index if not exists ai_chat_messages_conversation_idx
  on public.ai_chat_messages (conversation_id, created_at);

-- ------------------------------------------------------ provider config ----
-- There is deliberately NO api_key column. The secret lives in Supabase Vault
-- and this table stores only its id. See 0014 for the service-role-only
-- accessor functions.
create table if not exists public.ai_provider_config (
  id                  uuid primary key default gen_random_uuid(),
  provider            text not null check (length(btrim(provider)) > 0),
  model               text not null,
  label               text,
  is_active           boolean not null default false,
  is_enabled          boolean not null default true,
  monthly_usage_limit integer check (monthly_usage_limit is null or monthly_usage_limit > 0),
  vault_secret_id     uuid,
  has_key             boolean not null default false,
  updated_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint ai_provider_config_provider_model_key unique (provider, model)
);

-- At most one provider may be the active one at a time.
create unique index if not exists ai_provider_config_single_active_idx
  on public.ai_provider_config ((is_active)) where is_active;

drop trigger if exists ai_provider_config_set_updated_at on public.ai_provider_config;
create trigger ai_provider_config_set_updated_at
  before update on public.ai_provider_config
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------ RLS ----
alter table public.ai_usage_log           enable row level security;
alter table public.ai_chat_conversations  enable row level security;
alter table public.ai_chat_messages       enable row level security;
alter table public.ai_provider_config     enable row level security;

-- ai_usage_log: read-only for the owner, readable by admins (PRD 6.12 "AI
-- Usage" and the AI Management dashboard). Written only by Edge Functions
-- with the service role.
drop policy if exists ai_usage_log_select_own on public.ai_usage_log;
create policy ai_usage_log_select_own on public.ai_usage_log
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists ai_usage_log_select_admin on public.ai_usage_log;
create policy ai_usage_log_select_admin on public.ai_usage_log
  for select to authenticated using (public.is_super_admin());

-- Conversations are owner-managed; the messages inside them are written by
-- the ai-chat Edge Function (which persists both the user turn and the
-- assistant turn) so that a client cannot forge assistant content.
drop policy if exists ai_chat_conversations_select_own on public.ai_chat_conversations;
create policy ai_chat_conversations_select_own on public.ai_chat_conversations
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists ai_chat_conversations_insert_own on public.ai_chat_conversations;
create policy ai_chat_conversations_insert_own on public.ai_chat_conversations
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active());

drop policy if exists ai_chat_conversations_update_own on public.ai_chat_conversations;
create policy ai_chat_conversations_update_own on public.ai_chat_conversations
  for update to authenticated
  using (auth.uid() = user_id and public.is_account_active())
  with check (auth.uid() = user_id);

drop policy if exists ai_chat_conversations_delete_own on public.ai_chat_conversations;
create policy ai_chat_conversations_delete_own on public.ai_chat_conversations
  for delete to authenticated
  using (auth.uid() = user_id and public.is_account_active());

drop policy if exists ai_chat_messages_select_own on public.ai_chat_messages;
create policy ai_chat_messages_select_own on public.ai_chat_messages
  for select to authenticated
  using (exists (
    select 1 from public.ai_chat_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ));

drop policy if exists ai_chat_messages_delete_own on public.ai_chat_messages;
create policy ai_chat_messages_delete_own on public.ai_chat_messages
  for delete to authenticated
  using (exists (
    select 1 from public.ai_chat_conversations c
    where c.id = conversation_id and c.user_id = auth.uid()
  ) and public.is_account_active());

-- ai_provider_config: admin-only in every direction. Regular users get no
-- policy at all, so RLS denies them by default.
drop policy if exists ai_provider_config_select_admin on public.ai_provider_config;
create policy ai_provider_config_select_admin on public.ai_provider_config
  for select to authenticated using (public.is_super_admin());

drop policy if exists ai_provider_config_insert_admin on public.ai_provider_config;
create policy ai_provider_config_insert_admin on public.ai_provider_config
  for insert to authenticated with check (public.is_super_admin());

drop policy if exists ai_provider_config_update_admin on public.ai_provider_config;
create policy ai_provider_config_update_admin on public.ai_provider_config
  for update to authenticated
  using (public.is_super_admin()) with check (public.is_super_admin());

drop policy if exists ai_provider_config_delete_admin on public.ai_provider_config;
create policy ai_provider_config_delete_admin on public.ai_provider_config
  for delete to authenticated using (public.is_super_admin());

comment on table public.ai_provider_config is
  'Provider metadata only. The API key itself is in Supabase Vault; this table holds vault_secret_id and a has_key flag. No client role can read the secret.';
