-- ---------------------------------------------------------------------------
-- 0014  Phase 3: session activity, server-side analytics, search indexes.
--
-- Three things the live integration needs that the mock never did:
--
--   1. `last_active_at` was writable by its own owner. The column, its index
--      and the admin analytics function that reads it have existed since
--      migration 0002, but `guard_profile_privileged_columns` did not protect
--      it — so any user could PATCH their own row and forge the value the
--      "Active Users" metric is built from. It is now guarded, and the only
--      way to move it is a definer function that always writes now() for the
--      caller's own row.
--
--   2. Analytics aggregated client-side does not scale. Two SECURITY INVOKER
--      rollups do it in Postgres instead, so RLS still scopes every row to the
--      caller and only the summary crosses the wire.
--
--   3. The ledger search is `merchant ILIKE '%term%'`. A leading wildcard
--      cannot use a btree index, so trigram indexes back the real query paths.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm with schema extensions;

-- --------------------------------------------------------------- indexes ---
-- Justified by real query paths: the ledger merchant search (Section 2.2) and
-- the admin user search. Everything else was already covered by Phase 1.
create index if not exists expense_ledger_merchant_trgm_idx
  on public.expense_ledger using gin (merchant extensions.gin_trgm_ops);

create index if not exists profiles_search_trgm_idx
  on public.profiles using gin (
    (coalesce(full_name, '') || ' ' || coalesce(email, '')) extensions.gin_trgm_ops
  );

-- ------------------------------------------------------- activity tracking --
--
-- The guard runs as a BEFORE UPDATE trigger on profiles. `touch_last_active`
-- below is SECURITY DEFINER, but that does not help it here: PostgREST callers
-- keep `auth.role() = 'authenticated'` inside a definer function, so the guard
-- would still reject them. A transaction-local flag is the escape hatch. A
-- client cannot set it — PostgREST exposes no arbitrary SQL — so the only way
-- to raise it is to call the function.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), 'postgres');
begin
  if v_role in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if (new.role       is distinct from old.role)
     or (new.is_blocked is distinct from old.is_blocked)
     or (new.deleted_at is distinct from old.deleted_at)
  then
    if not public.is_super_admin() then
      raise exception
        'Not authorized to modify role, is_blocked or deleted_at'
        using errcode = '42501';
    end if;
  end if;

  -- Activity is observed, never asserted. Even a super admin has no business
  -- writing another account's last_active_at by hand.
  if (new.last_active_at is distinct from old.last_active_at)
     and coalesce(current_setting('monetiq.touch_active', true), '') <> 'on'
  then
    raise exception
      'last_active_at is maintained by touch_last_active()'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

-- Called at most once per session per interval by the client, not on every
-- request: a write on every navigation would put a row update in the path of
-- every page load for a number that is only ever read at day granularity.
create or replace function public.touch_last_active()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  perform set_config('monetiq.touch_active', 'on', true);
  update public.profiles
     set last_active_at = now()
   where id = auth.uid()
     and deleted_at is null;
  perform set_config('monetiq.touch_active', 'off', true);
end;
$$;

comment on function public.touch_last_active() is
  'Records session activity for the calling user. The only supported way to move profiles.last_active_at; the value is always now() and always the caller''s own row.';

-- ------------------------------------------------------ analytics rollups ---
--
-- SECURITY INVOKER on purpose: RLS applies, so these can only ever aggregate
-- rows the caller is already allowed to read. A definer version here would be
-- a data leak with extra steps.
create or replace function public.analytics_category_rollup(
  p_from date,
  p_to   date
)
returns table (
  category_id   uuid,
  category_name text,
  total         numeric,
  txn_count     bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select e.category_id,
         coalesce(c.name, 'Uncategorised') as category_name,
         sum(e.amount)::numeric            as total,
         count(*)::bigint                  as txn_count
    from public.expense_ledger e
    left join public.categories c on c.id = e.category_id
   where e.expense_date >= p_from
     and e.expense_date <= p_to
   group by e.category_id, coalesce(c.name, 'Uncategorised')
   order by total desc;
$$;

create or replace function public.analytics_monthly_rollup(
  p_from date,
  p_to   date
)
returns table (
  month     text,
  total     numeric,
  txn_count bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  select to_char(date_trunc('month', e.expense_date), 'YYYY-MM') as month,
         sum(e.amount)::numeric                                  as total,
         count(*)::bigint                                        as txn_count
    from public.expense_ledger e
   where e.expense_date >= p_from
     and e.expense_date <= p_to
   group by date_trunc('month', e.expense_date)
   order by 1;
$$;

comment on function public.analytics_category_rollup(date, date) is
  'Category spend rollup from the EXPENSE LEDGER only. SECURITY INVOKER so RLS scopes it to the caller. Bank statement data is a separate feature and is not reachable from here.';
comment on function public.analytics_monthly_rollup(date, date) is
  'Monthly spend rollup from the EXPENSE LEDGER only. SECURITY INVOKER so RLS scopes it to the caller.';

-- --------------------------------------------------------------- grants ----
-- Same hardening as migration 0013: Postgres grants EXECUTE to PUBLIC on every
-- new function, and anon inherits it. Revoke first, then grant narrowly.
revoke execute on function public.touch_last_active() from public;
revoke execute on function public.analytics_category_rollup(date, date) from public;
revoke execute on function public.analytics_monthly_rollup(date, date) from public;

grant execute on function public.touch_last_active() to authenticated;
grant execute on function public.analytics_category_rollup(date, date) to authenticated;
grant execute on function public.analytics_monthly_rollup(date, date) to authenticated;
