-- ---------------------------------------------------------------------------
-- The alerts engine.
--
-- Until now Monetiq had alert *storage* (alert_notifications), alert
-- *settings* (thresholds the user picks) and an alert *screen* — but nothing
-- that ever produced an alert. The screen carried a banner admitting it.
--
-- Three of the four alert types have a rule the user themselves defines, so
-- nothing is being invented here:
--
--   overspending         month-to-date ledger total  >  threshold (₹)
--   budget_limit         category spend              >= threshold (% of cap)
--   unusual_transaction  a single expense            >  threshold (₹)
--   emi_reminder         an instalment falls due within EMI_REMINDER_DAYS
--
-- The first three are evaluated by a trigger on expense_ledger: they are all
-- consequences of money being recorded, so the moment an expense lands is
-- exactly when they become true. No scheduler is involved.
--
-- emi_reminder is the one that is genuinely time-based — nothing the user does
-- makes an instalment come due. Rather than take a pg_cron dependency, it is a
-- callable function the app invokes when it opens the alerts surface. That is
-- idempotent (see the dedupe key below), so calling it on every page load is
-- harmless, and a cron job can call the same function later without changing
-- anything.
--
-- WRITES STAY PRIVILEGED. RLS still forbids a user from inserting their own
-- notifications (RLS-11) — a user must not be able to forge an alert. These
-- functions are SECURITY DEFINER so the engine, and only the engine, writes.
-- ---------------------------------------------------------------------------

-- --------------------------------------------------------------- dedupe ----
-- Without this, every expense you record while over budget raises another
-- identical alert, and the feed becomes unusable within a day. The key names
-- the *occasion* an alert refers to, so re-evaluating the same occasion is a
-- no-op rather than a duplicate.
--
--   overspending         overspending:<YYYY-MM>            once per month
--   budget_limit         budget_limit:<budget_id>:<YYYY-MM> once per budget per month
--   unusual_transaction  unusual_transaction:<expense_id>   once per expense
--   emi_reminder         emi_reminder:<debt_id>:<YYYY-MM>   once per instalment
alter table public.alert_notifications
  add column if not exists dedupe_key text;

create unique index if not exists alert_notifications_user_dedupe_idx
  on public.alert_notifications (user_id, dedupe_key)
  where dedupe_key is not null;

comment on column public.alert_notifications.dedupe_key is
  'Names the occasion this alert refers to. Unique per user, so re-evaluating '
  'the same occasion never produces a duplicate.';

-- How many days ahead of an instalment to warn.
create or replace function public.emi_reminder_days()
returns integer language sql immutable set search_path = public as $$ select 3 $$;

-- ------------------------------------------------------------ the engine ---
create or replace function public.raise_alert(
  p_user_id    uuid,
  p_alert_type text,
  p_message    text,
  p_dedupe_key text
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.alert_notifications (user_id, alert_type, message, dedupe_key)
  values (p_user_id, p_alert_type, p_message, p_dedupe_key)
  on conflict (user_id, dedupe_key) where dedupe_key is not null do nothing;
$$;

/**
 * Evaluates the three spend-driven alert types for one user, for the month a
 * given expense falls in. Only enabled types with a threshold are considered —
 * an alert the user switched off must stay silent, and one with no threshold
 * has no rule to apply.
 */
create or replace function public.evaluate_spend_alerts(
  p_user_id      uuid,
  p_expense_id   uuid,
  p_expense_date date
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_month_start date := date_trunc('month', p_expense_date)::date;
  v_month_end   date := (date_trunc('month', p_expense_date) + interval '1 month')::date;
  v_month_label text := to_char(p_expense_date, 'YYYY-MM');
  v_threshold   numeric;
  v_total       numeric;
  v_amount      numeric;
  r             record;
begin
  ------------------------------------------------------------ overspending --
  select threshold_value into v_threshold
    from public.alert_settings
   where user_id = p_user_id and alert_type = 'overspending' and enabled;

  if v_threshold is not null then
    select coalesce(sum(amount), 0) into v_total
      from public.expense_ledger
     where user_id = p_user_id
       and expense_date >= v_month_start
       and expense_date <  v_month_end;

    if v_total > v_threshold then
      perform public.raise_alert(
        p_user_id, 'overspending',
        'You have spent ₹'||trim(to_char(v_total, 'FM9,99,99,999.00'))||' this month, '
        ||'which is over your ₹'||trim(to_char(v_threshold, 'FM9,99,99,999.00'))||' limit.',
        'overspending:'||v_month_label);
    end if;
  end if;

  ----------------------------------------------------------- budget_limit --
  select threshold_value into v_threshold
    from public.alert_settings
   where user_id = p_user_id and alert_type = 'budget_limit' and enabled;

  if v_threshold is not null then
    for r in
      select b.id as budget_id, b.monthly_cap, c.name as category_name,
             coalesce(sum(e.amount), 0) as spent
        from public.budgets b
        join public.categories c on c.id = b.category_id
        left join public.expense_ledger e
               on e.category_id = b.category_id
              and e.user_id = b.user_id
              and e.expense_date >= v_month_start
              and e.expense_date <  v_month_end
       where b.user_id = p_user_id
       group by b.id, b.monthly_cap, c.name
    loop
      if r.monthly_cap > 0
         and (r.spent / r.monthly_cap) * 100 >= v_threshold then
        perform public.raise_alert(
          p_user_id, 'budget_limit',
          r.category_name||' has reached '||round((r.spent / r.monthly_cap) * 100)
          ||'% of its ₹'||trim(to_char(r.monthly_cap, 'FM9,99,99,999.00'))||' budget.',
          'budget_limit:'||r.budget_id::text||':'||v_month_label);
      end if;
    end loop;
  end if;

  ---------------------------------------------------- unusual_transaction --
  select threshold_value into v_threshold
    from public.alert_settings
   where user_id = p_user_id and alert_type = 'unusual_transaction' and enabled;

  if v_threshold is not null and p_expense_id is not null then
    select amount into v_amount
      from public.expense_ledger where id = p_expense_id;

    if v_amount is not null and v_amount > v_threshold then
      perform public.raise_alert(
        p_user_id, 'unusual_transaction',
        'A single expense of ₹'||trim(to_char(v_amount, 'FM9,99,99,999.00'))
        ||' is larger than your ₹'||trim(to_char(v_threshold, 'FM9,99,99,999.00'))||' threshold.',
        'unusual_transaction:'||p_expense_id::text);
    end if;
  end if;
end;
$$;

create or replace function public.on_expense_alerts()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Never let an alert failure roll back the expense the user was recording.
  -- Losing the expense to save the alert is the wrong trade.
  begin
    perform public.evaluate_spend_alerts(new.user_id, new.id, new.expense_date);
  exception when others then
    raise warning 'alert_evaluation_failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists expense_ledger_alerts on public.expense_ledger;
create trigger expense_ledger_alerts
  after insert or update of amount, category_id, expense_date
  on public.expense_ledger
  for each row execute function public.on_expense_alerts();

/**
 * The time-driven half. Called by the app when it opens an alerts surface, and
 * safe to call as often as it likes. Scoped to the caller via auth.uid() so it
 * can be granted to `authenticated` without letting anyone generate alerts for
 * somebody else.
 */
create or replace function public.refresh_due_alerts()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid     uuid := auth.uid();
  v_enabled boolean;
  v_days    integer := public.emi_reminder_days();
  r         record;
  v_due     date;
begin
  if v_uid is null then
    return;
  end if;

  select enabled into v_enabled
    from public.alert_settings
   where user_id = v_uid and alert_type = 'emi_reminder';

  if not coalesce(v_enabled, false) then
    return;
  end if;

  for r in
    select d.id, d.lender_name, d.emi_amount, d.start_date
      from public.debts d
     where d.user_id = v_uid
       and d.emi_amount is not null
       and d.emi_amount > 0
       and d.outstanding_balance > 0
  loop
    -- This month's instalment falls on the same day of the month the loan
    -- started, clamped to the month's length so a loan that started on the
    -- 31st still produces a reminder in February.
    v_due := (date_trunc('month', current_date)
              + (least(
                   extract(day from r.start_date)::int,
                   extract(day from (date_trunc('month', current_date)
                                     + interval '1 month - 1 day'))::int
                 ) - 1) * interval '1 day')::date;

    if v_due >= current_date
       and v_due <= current_date + (v_days || ' days')::interval then
      perform public.raise_alert(
        v_uid, 'emi_reminder',
        'Your ₹'||trim(to_char(r.emi_amount, 'FM9,99,99,999.00'))||' instalment for '
        ||r.lender_name||' is due on '||to_char(v_due, 'DD Mon YYYY')||'.',
        'emi_reminder:'||r.id::text||':'||to_char(v_due, 'YYYY-MM'));
    end if;
  end loop;
end;
$$;

-- Only refresh_due_alerts is client-callable, and only for the caller's own
-- rows. The rest of the engine is reachable only from the trigger.
revoke execute on function public.raise_alert(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.evaluate_spend_alerts(uuid, uuid, date) from public, anon, authenticated;
revoke execute on function public.on_expense_alerts() from public, anon, authenticated;
revoke execute on function public.refresh_due_alerts() from public, anon;
grant execute on function public.refresh_due_alerts() to authenticated;
