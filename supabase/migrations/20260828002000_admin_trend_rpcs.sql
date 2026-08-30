-- ---------------------------------------------------------------------------
-- Monthly trend series for the Super Admin analytics screens.
--
-- The existing admin_* dashboard functions answer "what does the last N days
-- look like in total" — one row, or one row per provider. A line chart needs a
-- point per period, which none of them produce. These add that, and nothing
-- else: every figure is derived from tables that already exist. There is no
-- new reporting table and no metric here that is not backed by real rows.
--
-- All of them follow the conventions of 0011: SECURITY DEFINER because they
-- aggregate across every user, with an explicit is_super_admin() check as the
-- first statement — the function is the boundary, not RLS. Months are bucketed
-- in Asia/Kolkata, matching admin_ocr_dashboard.
--
-- WHAT IS DELIBERATELY ABSENT
-- There is no uptime-history or HTTP-latency series, because no table records
-- either. system_service_status holds a single current row per service that a
-- human edits by hand. Inventing a line from it would be fabrication, so the
-- System monitoring screen keeps its status cards for uptime and charts only
-- what is genuinely measured: the platform's own success rate, error rate and
-- processing time, from ai_usage_log and ocr_scan_log.
-- ---------------------------------------------------------------------------

-- Shared month axis. Generating the months means a period with no activity
-- comes back as a zero row rather than vanishing from the series, which is
-- what stops a chart implying "no data" where the truth is "nothing happened".
create or replace function public.admin_month_series(p_from date, p_to date)
returns table (month text)
language sql
stable
set search_path = public
as $$
  select to_char(m, 'YYYY-MM')
  from generate_series(date_trunc('month', p_from), date_trunc('month', p_to), interval '1 month') m;
$$;

-- --------------------------------------------------------- user growth ----
create or replace function public.admin_user_growth(p_from date, p_to date)
returns table (month text, new_users bigint, total_users bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  with months as (select m.month from public.admin_month_series(p_from, p_to) m),
  signups as (
    select to_char(p.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
           count(*) as n
    from public.profiles p
    where p.deleted_at is null
    group by 1
  )
  select
    mo.month,
    coalesce(s.n, 0),
    -- Cumulative: everyone who had signed up by the end of that month, which
    -- is what "growth" means on this chart.
    --
    -- The cast is required, not cosmetic: sum() over bigint returns numeric,
    -- the column is declared bigint, and Postgres rejects the mismatch when
    -- the function is CALLED rather than when it is created. It applied
    -- cleanly and then failed on first use.
    (select coalesce(sum(s2.n), 0)::bigint from signups s2 where s2.month <= mo.month)
  from months mo
  left join signups s on s.month = mo.month
  order by mo.month;
end;
$$;

-- -------------------------------------------------------- active users ----
-- Genuine monthly actives: users who DID something that month. Derived from
-- the activity tables rather than profiles.last_active_at, which holds a single
-- timestamp per user and so cannot answer "was this user active last March".
create or replace function public.admin_active_users(p_from date, p_to date)
returns table (month text, active_users bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  with months as (select m.month from public.admin_month_series(p_from, p_to) m),
  activity as (
    select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month, user_id
      from public.expense_ledger
    union all
    select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM'), user_id
      from public.ai_usage_log
    union all
    select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM'), user_id
      from public.ocr_scan_log
    union all
    select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM'), user_id
      from public.bank_statement_uploads
  )
  select mo.month, count(distinct a.user_id)
  from months mo
  left join activity a on a.month = mo.month
  group by mo.month
  order by mo.month;
end;
$$;

-- ------------------------------------------------------- feature usage ----
create or replace function public.admin_feature_usage(p_from date, p_to date)
returns table (
  month        text,
  expenses     bigint,
  ocr_scans    bigint,
  ai_requests  bigint,
  statements   bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  with months as (select m.month from public.admin_month_series(p_from, p_to) m)
  select
    mo.month,
    (select count(*) from public.expense_ledger e
      where to_char(e.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = mo.month),
    (select count(*) from public.ocr_scan_log o
      where to_char(o.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = mo.month),
    (select count(*) from public.ai_usage_log a
      where to_char(a.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = mo.month),
    (select count(*) from public.bank_statement_uploads b
      where to_char(b.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') = mo.month)
  from months mo
  order by mo.month;
end;
$$;

-- ---------------------------------------------------------- OCR trend -----
create or replace function public.admin_ocr_trend(p_from date, p_to date)
returns table (
  month            text,
  scans            bigint,
  successes        bigint,
  failures         bigint,
  success_rate_pct numeric,
  avg_duration_ms  numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  with months as (select m.month from public.admin_month_series(p_from, p_to) m),
  agg as (
    select to_char(l.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
           count(*) as scans,
           count(*) filter (where l.status = 'success') as successes,
           count(*) filter (where l.status = 'failed')  as failures,
           avg(l.duration_ms) as avg_ms
    from public.ocr_scan_log l
    group by 1
  )
  select
    mo.month,
    coalesce(a.scans, 0),
    coalesce(a.successes, 0),
    coalesce(a.failures, 0),
    -- A month with no scans has no rate. Zero would read as "everything
    -- failed", so it stays null and the chart leaves a gap.
    round(100.0 * a.successes / nullif(a.scans, 0), 2),
    round(a.avg_ms, 2)
  from months mo
  left join agg a on a.month = mo.month
  order by mo.month;
end;
$$;

-- ----------------------------------------------------------- AI trend -----
create or replace function public.admin_ai_trend(p_from date, p_to date)
returns table (
  month            text,
  requests         bigint,
  successes        bigint,
  failures         bigint,
  success_rate_pct numeric,
  avg_duration_ms  numeric,
  total_cost_usd   numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  with months as (select m.month from public.admin_month_series(p_from, p_to) m),
  agg as (
    select to_char(l.created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
           count(*) as requests,
           count(*) filter (where l.status = 'success') as successes,
           count(*) filter (where l.status = 'failed')  as failures,
           avg(l.duration_ms) as avg_ms,
           sum(coalesce(l.cost_usd, 0)) as cost
    from public.ai_usage_log l
    group by 1
  )
  select
    mo.month,
    coalesce(a.requests, 0),
    coalesce(a.successes, 0),
    coalesce(a.failures, 0),
    round(100.0 * a.successes / nullif(a.requests, 0), 2),
    round(a.avg_ms, 2),
    round(coalesce(a.cost, 0), 6)
  from months mo
  left join agg a on a.month = mo.month
  order by mo.month;
end;
$$;

-- ------------------------------------------------- platform operations ----
-- AI and OCR together: the only two pipelines that record an outcome and a
-- duration. This is what backs "system performance" on the dashboard and both
-- the error-rate and processing-time charts on System monitoring.
create or replace function public.admin_ops_trend(p_from date, p_to date)
returns table (
  month            text,
  operations       bigint,
  successes        bigint,
  failures         bigint,
  success_rate_pct numeric,
  error_rate_pct   numeric,
  avg_duration_ms  numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.is_super_admin() then
    raise exception 'Not authorized' using errcode = '42501';
  end if;

  return query
  with months as (select m.month from public.admin_month_series(p_from, p_to) m),
  ops as (
    select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM') as month,
           status, duration_ms
      from public.ai_usage_log
    union all
    select to_char(created_at at time zone 'Asia/Kolkata', 'YYYY-MM'),
           status, duration_ms
      from public.ocr_scan_log
  ),
  agg as (
    -- Qualified as ops.month on purpose: a bare `month` here collides with
    -- this function's OUT parameter of the same name, and PL/pgSQL raises
    -- "column reference month is ambiguous" at call time, not at create time.
    select ops.month as month,
           count(*) as operations,
           count(*) filter (where ops.status = 'success') as successes,
           count(*) filter (where ops.status = 'failed')  as failures,
           avg(ops.duration_ms) as avg_ms
    from ops group by ops.month
  )
  select
    mo.month,
    coalesce(a.operations, 0),
    coalesce(a.successes, 0),
    coalesce(a.failures, 0),
    round(100.0 * a.successes / nullif(a.operations, 0), 2),
    round(100.0 * a.failures  / nullif(a.operations, 0), 2),
    round(a.avg_ms, 2)
  from months mo
  left join agg a on a.month = mo.month
  order by mo.month;
end;
$$;

-- `revoke ... from anon` alone is not enough: Supabase also grants EXECUTE via
-- PUBLIC, so anon keeps the privilege through that and the linter flags it as
-- publicly callable. Both have to go. This is the same trap Phase 3 hit on
-- three earlier RPCs — the in-body is_super_admin() guard still refuses the
-- call, but a caller should not be able to reach the function at all.
revoke execute on function public.admin_month_series(date, date) from public, anon, authenticated;

revoke execute on function public.admin_user_growth(date, date)   from public, anon;
revoke execute on function public.admin_active_users(date, date)  from public, anon;
revoke execute on function public.admin_feature_usage(date, date) from public, anon;
revoke execute on function public.admin_ocr_trend(date, date)     from public, anon;
revoke execute on function public.admin_ai_trend(date, date)      from public, anon;
revoke execute on function public.admin_ops_trend(date, date)     from public, anon;

-- Revoking from PUBLIC also strips authenticated, so the intended caller is
-- granted back explicitly.
grant execute on function public.admin_user_growth(date, date)   to authenticated;
grant execute on function public.admin_active_users(date, date)  to authenticated;
grant execute on function public.admin_feature_usage(date, date) to authenticated;
grant execute on function public.admin_ocr_trend(date, date)     to authenticated;
grant execute on function public.admin_ai_trend(date, date)      to authenticated;
grant execute on function public.admin_ops_trend(date, date)     to authenticated;
