-- ---------------------------------------------------------------------------
-- 0004  Bank Statement Analysis — a READ-ONLY feature, structurally separate
--       from the Expense Ledger.
--
-- Nothing in this file writes to public.expense_ledger, and no view or
-- function here unions the two. Budget Planner, Analytics and Expense Alerts
-- query expense_ledger directly and therefore cannot see this data.
--
-- There is no raw-file column anywhere: the uploaded PDF/CSV is deleted from
-- the staging bucket by the process-bank-statement Edge Function as part of
-- its own execution. Only extracted, structured rows survive.
-- ---------------------------------------------------------------------------

create table if not exists public.bank_statement_uploads (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  bank_name     text,
  original_filename text,
  period_from   date,
  period_to     date,
  status        text not null default 'processing'
                  check (status in ('processing', 'completed', 'failed')),
  failure_reason text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint bank_statement_uploads_period_order
    check (period_from is null or period_to is null or period_from <= period_to)
);

create index if not exists bank_statement_uploads_user_idx
  on public.bank_statement_uploads (user_id, created_at desc);

drop trigger if exists bank_statement_uploads_set_updated_at on public.bank_statement_uploads;
create trigger bank_statement_uploads_set_updated_at
  before update on public.bank_statement_uploads
  for each row execute function public.set_updated_at();

create table if not exists public.bank_statement_transactions (
  id          uuid primary key default gen_random_uuid(),
  upload_id   uuid not null references public.bank_statement_uploads (id) on delete cascade,
  txn_date    date not null,
  description text,
  amount      numeric(14, 2) not null check (amount > 0),
  direction   text not null check (direction in ('credit', 'debit')),
  category_guess text,
  created_at  timestamptz not null default now()
);

create index if not exists bank_statement_transactions_upload_idx
  on public.bank_statement_transactions (upload_id, txn_date desc);

create table if not exists public.bank_statement_analysis_results (
  id            uuid primary key default gen_random_uuid(),
  upload_id     uuid not null references public.bank_statement_uploads (id) on delete cascade,
  total_income  numeric(14, 2) not null default 0,
  total_expense numeric(14, 2) not null default 0,
  net_savings   numeric(14, 2) generated always as (total_income - total_expense) stored,
  category_breakdown jsonb not null default '{}'::jsonb,
  transaction_count integer not null default 0,
  ai_summary    text,
  ai_disclaimer text not null default
    'This report includes AI-generated content. Figures are derived from the statement you uploaded and may contain errors. Verify against your bank records before acting on them.',
  generated_at  timestamptz not null default now(),
  constraint bank_statement_analysis_results_upload_key unique (upload_id)
);

create index if not exists bank_statement_analysis_results_upload_idx
  on public.bank_statement_analysis_results (upload_id);

-- ------------------------------------------------------------------ RLS ----
alter table public.bank_statement_uploads            enable row level security;
alter table public.bank_statement_transactions       enable row level security;
alter table public.bank_statement_analysis_results   enable row level security;

-- Owner may create the upload record and read/delete their own history.
-- UPDATE is intentionally NOT granted to any client role: status transitions
-- are written by the process-bank-statement Edge Function using the service
-- role, so a user cannot mark a failed analysis "completed".
drop policy if exists bank_statement_uploads_select_own on public.bank_statement_uploads;
create policy bank_statement_uploads_select_own on public.bank_statement_uploads
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists bank_statement_uploads_insert_own on public.bank_statement_uploads;
create policy bank_statement_uploads_insert_own on public.bank_statement_uploads
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active() and status = 'processing');

drop policy if exists bank_statement_uploads_delete_own on public.bank_statement_uploads;
create policy bank_statement_uploads_delete_own on public.bank_statement_uploads
  for delete to authenticated
  using (auth.uid() = user_id and public.is_account_active());

-- Extracted rows: owner reads and may delete (via cascade or directly).
-- Writes are service-role only — this data is produced by extraction, never
-- typed in by a user.
drop policy if exists bank_statement_transactions_select_own on public.bank_statement_transactions;
create policy bank_statement_transactions_select_own on public.bank_statement_transactions
  for select to authenticated
  using (exists (
    select 1 from public.bank_statement_uploads u
    where u.id = upload_id and u.user_id = auth.uid()
  ));

drop policy if exists bank_statement_transactions_delete_own on public.bank_statement_transactions;
create policy bank_statement_transactions_delete_own on public.bank_statement_transactions
  for delete to authenticated
  using (exists (
    select 1 from public.bank_statement_uploads u
    where u.id = upload_id and u.user_id = auth.uid()
  ) and public.is_account_active());

drop policy if exists bank_statement_analysis_results_select_own on public.bank_statement_analysis_results;
create policy bank_statement_analysis_results_select_own on public.bank_statement_analysis_results
  for select to authenticated
  using (exists (
    select 1 from public.bank_statement_uploads u
    where u.id = upload_id and u.user_id = auth.uid()
  ));

drop policy if exists bank_statement_analysis_results_delete_own on public.bank_statement_analysis_results;
create policy bank_statement_analysis_results_delete_own on public.bank_statement_analysis_results
  for delete to authenticated
  using (exists (
    select 1 from public.bank_statement_uploads u
    where u.id = upload_id and u.user_id = auth.uid()
  ) and public.is_account_active());

comment on table public.bank_statement_transactions is
  'Extracted statement lines. READ-ONLY feature data: must never be inserted into or joined with public.expense_ledger.';
