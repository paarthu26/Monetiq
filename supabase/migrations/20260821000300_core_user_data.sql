-- ---------------------------------------------------------------------------
-- 0003  Income, categories, the Expense Ledger, and budgets.
--
-- expense_ledger is the single unified source of truth for spending. It is
-- written by exactly two paths (source = 'ocr' | 'manual'). Bank statement
-- data lives in its own tables (0004) and is never joined in here.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- income ----
create table if not exists public.income_sources (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  source_name   text not null check (length(btrim(source_name)) > 0),
  amount        numeric(14, 2) not null check (amount > 0),
  frequency     text not null check (frequency in ('one_time', 'monthly')),
  received_or_start_date date not null,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists income_sources_user_idx
  on public.income_sources (user_id, received_or_start_date desc);

drop trigger if exists income_sources_set_updated_at on public.income_sources;
create trigger income_sources_set_updated_at
  before update on public.income_sources
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------- categories ----
-- user_id null == predefined/global category, visible to everyone.
create table if not exists public.categories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid references public.profiles (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  icon       text,
  tint       text,
  created_at timestamptz not null default now()
);

-- NULLS NOT DISTINCT so the predefined set (user_id is null) is deduplicated
-- too; a plain unique constraint would treat every null user_id as distinct.
create unique index if not exists categories_user_name_key
  on public.categories (user_id, lower(name)) nulls not distinct;

create index if not exists categories_user_idx on public.categories (user_id);

-- ------------------------------------------------------- expense ledger ----
create table if not exists public.expense_ledger (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  merchant    text not null check (length(btrim(merchant)) > 0),
  amount      numeric(14, 2) not null check (amount > 0),
  expense_date date not null,
  category_id uuid references public.categories (id) on delete set null,
  source      text not null check (source in ('ocr', 'manual')),
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists expense_ledger_user_date_idx
  on public.expense_ledger (user_id, expense_date desc);
create index if not exists expense_ledger_user_category_idx
  on public.expense_ledger (user_id, category_id);

drop trigger if exists expense_ledger_set_updated_at on public.expense_ledger;
create trigger expense_ledger_set_updated_at
  before update on public.expense_ledger
  for each row execute function public.set_updated_at();

-- -------------------------------------------------------------- budgets ----
-- No per-month spend snapshot column by design: actual spend is computed live
-- from expense_ledger by public.budget_progress().
create table if not exists public.budgets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete cascade,
  monthly_cap numeric(14, 2) not null check (monthly_cap > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint budgets_user_category_key unique (user_id, category_id)
);

create index if not exists budgets_user_idx on public.budgets (user_id);

drop trigger if exists budgets_set_updated_at on public.budgets;
create trigger budgets_set_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

-- Budget progress for a given month, recomputed on every call. SECURITY
-- INVOKER so the caller's RLS applies. Reads expense_ledger only, which is
-- how "bank statement data is excluded at the query level" is realised for
-- the Budget Planner.
create or replace function public.budget_progress(
  p_month date default (date_trunc('month', now()))::date
)
returns table (
  budget_id     uuid,
  category_id   uuid,
  category_name text,
  monthly_cap   numeric,
  spent         numeric,
  remaining     numeric,
  pct_used      numeric
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    b.id,
    b.category_id,
    c.name,
    b.monthly_cap,
    coalesce(sum(e.amount), 0)::numeric,
    (b.monthly_cap - coalesce(sum(e.amount), 0))::numeric,
    round(coalesce(sum(e.amount), 0) / nullif(b.monthly_cap, 0) * 100, 2)
  from public.budgets b
  join public.categories c on c.id = b.category_id
  left join public.expense_ledger e
         on e.user_id = b.user_id
        and e.category_id = b.category_id
        and e.expense_date >= date_trunc('month', p_month)::date
        and e.expense_date <  (date_trunc('month', p_month) + interval '1 month')::date
  where b.user_id = auth.uid()
  group by b.id, b.category_id, c.name, b.monthly_cap;
$$;

comment on function public.budget_progress(date) is
  'Live budget-vs-actual for the calling user. Actual spend is computed from expense_ledger only; bank statement transactions are excluded by construction.';

-- ------------------------------------------------------------------ RLS ----
alter table public.income_sources enable row level security;
alter table public.categories     enable row level security;
alter table public.expense_ledger enable row level security;
alter table public.budgets        enable row level security;

-- income_sources: owner-only. No admin access — no admin screen reads it.
drop policy if exists income_sources_select_own on public.income_sources;
create policy income_sources_select_own on public.income_sources
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists income_sources_insert_own on public.income_sources;
create policy income_sources_insert_own on public.income_sources
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active());

drop policy if exists income_sources_update_own on public.income_sources;
create policy income_sources_update_own on public.income_sources
  for update to authenticated
  using (auth.uid() = user_id and public.is_account_active())
  with check (auth.uid() = user_id);

drop policy if exists income_sources_delete_own on public.income_sources;
create policy income_sources_delete_own on public.income_sources
  for delete to authenticated
  using (auth.uid() = user_id and public.is_account_active());

-- categories: predefined rows are readable by everyone and mutable by nobody
-- through a client role; custom rows belong to their owner.
drop policy if exists categories_select_visible on public.categories;
create policy categories_select_visible on public.categories
  for select to authenticated
  using (user_id is null or auth.uid() = user_id);

drop policy if exists categories_insert_own on public.categories;
create policy categories_insert_own on public.categories
  for insert to authenticated
  with check (user_id is not null and auth.uid() = user_id and public.is_account_active());

drop policy if exists categories_update_own on public.categories;
create policy categories_update_own on public.categories
  for update to authenticated
  using (user_id is not null and auth.uid() = user_id and public.is_account_active())
  with check (user_id is not null and auth.uid() = user_id);

drop policy if exists categories_delete_own on public.categories;
create policy categories_delete_own on public.categories
  for delete to authenticated
  using (user_id is not null and auth.uid() = user_id and public.is_account_active());

-- expense_ledger: owner-only. Deliberately no admin SELECT — no Super Admin
-- screen in scope displays another user's individual spending.
drop policy if exists expense_ledger_select_own on public.expense_ledger;
create policy expense_ledger_select_own on public.expense_ledger
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists expense_ledger_insert_own on public.expense_ledger;
create policy expense_ledger_insert_own on public.expense_ledger
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active());

drop policy if exists expense_ledger_update_own on public.expense_ledger;
create policy expense_ledger_update_own on public.expense_ledger
  for update to authenticated
  using (auth.uid() = user_id and public.is_account_active())
  with check (auth.uid() = user_id);

drop policy if exists expense_ledger_delete_own on public.expense_ledger;
create policy expense_ledger_delete_own on public.expense_ledger
  for delete to authenticated
  using (auth.uid() = user_id and public.is_account_active());

-- budgets: owner-only.
drop policy if exists budgets_select_own on public.budgets;
create policy budgets_select_own on public.budgets
  for select to authenticated using (auth.uid() = user_id);

drop policy if exists budgets_insert_own on public.budgets;
create policy budgets_insert_own on public.budgets
  for insert to authenticated
  with check (auth.uid() = user_id and public.is_account_active());

drop policy if exists budgets_update_own on public.budgets;
create policy budgets_update_own on public.budgets
  for update to authenticated
  using (auth.uid() = user_id and public.is_account_active())
  with check (auth.uid() = user_id);

drop policy if exists budgets_delete_own on public.budgets;
create policy budgets_delete_own on public.budgets
  for delete to authenticated
  using (auth.uid() = user_id and public.is_account_active());

-- --------------------------------------------------- predefined category ---
insert into public.categories (user_id, name, icon, tint) values
  (null, 'Food & Dining',        'utensils',      '#F97316'),
  (null, 'Groceries',            'shopping-cart', '#16A34A'),
  (null, 'Transport',            'bus',           '#0EA5E9'),
  (null, 'Fuel',                 'fuel',          '#EF4444'),
  (null, 'Rent',                 'home',          '#8B5CF6'),
  (null, 'Utilities',            'plug',          '#F59E0B'),
  (null, 'Mobile & Internet',    'wifi',          '#06B6D4'),
  (null, 'Shopping',             'shopping-bag',  '#EC4899'),
  (null, 'Entertainment',        'clapperboard',  '#A855F7'),
  (null, 'Health & Medical',     'heart-pulse',   '#DC2626'),
  (null, 'Education',            'graduation-cap','#2563EB'),
  (null, 'Insurance',            'shield',        '#0891B2'),
  (null, 'Investments',          'trending-up',   '#059669'),
  (null, 'EMI & Loan Payments',  'landmark',      '#B45309'),
  (null, 'Travel',               'plane',         '#3B82F6'),
  (null, 'Personal Care',        'sparkles',      '#D946EF'),
  (null, 'Subscriptions',        'repeat',        '#6366F1'),
  (null, 'Gifts & Donations',    'gift',          '#F43F5E'),
  (null, 'Household',            'sofa',          '#78716C'),
  (null, 'Miscellaneous',        'ellipsis',      '#64748B')
on conflict do nothing;
