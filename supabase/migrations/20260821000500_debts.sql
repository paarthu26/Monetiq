-- ---------------------------------------------------------------------------
-- 0005  Debt Analysis.
--
-- v1 scope is personal loans and credit cards only. Home / auto / other loan
-- types are explicitly out of scope and the check constraint enforces that at
-- the database level, not just in Zod.
-- ---------------------------------------------------------------------------

create table if not exists public.debts (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references public.profiles (id) on delete cascade,
  loan_type           text not null
                        check (loan_type in ('personal_loan', 'credit_card')),
  lender_name         text not null check (length(btrim(lender_name)) > 0),
  principal_amount    numeric(14, 2) not null check (principal_amount > 0),
  interest_rate       numeric(6, 3) not null check (interest_rate >= 0 and interest_rate <= 100),
  tenure_months       integer check (tenure_months is null or tenure_months > 0),
  emi_amount          numeric(14, 2) check (emi_amount is null or emi_amount > 0),
  start_date          date not null,
  outstanding_balance numeric(14, 2) not null check (outstanding_balance >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists debts_user_idx on public.debts (user_id, start_date desc);

drop trigger if exists debts_set_updated_at on public.debts;
create trigger debts_set_updated_at
  before update on public.debts
  for each row execute function public.set_updated_at();

alter table public.debts enable row level security;

drop policy if exists debts_select_own on public.debts;
create policy debts_select_own on public.debts
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists debts_insert_own on public.debts;
create policy debts_insert_own on public.debts
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active());

drop policy if exists debts_update_own on public.debts;
create policy debts_update_own on public.debts
  for update to authenticated
  using (auth.uid() = user_id and public.is_account_active())
  with check (auth.uid() = user_id);

drop policy if exists debts_delete_own on public.debts;
create policy debts_delete_own on public.debts
  for delete to authenticated
  using (auth.uid() = user_id and public.is_account_active());

comment on column public.debts.loan_type is
  'v1 scope: personal_loan | credit_card. Home/auto/other are future scope and rejected by the check constraint.';
