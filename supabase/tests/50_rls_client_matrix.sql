-- ---------------------------------------------------------------------------
-- RLS-01 .. RLS-14  — Phase 3 §5.2
--
-- Runs every case as a real PostgREST caller by setting `request.jwt.claims`
-- and `role`, which is exactly what PostgREST does per request. That makes
-- these the same policies the browser hits, evaluated the same way.
--
-- Two things this file is careful about, because getting them wrong produces
-- a green run that proves nothing:
--
--   1. Every "denied" case operates on a row that actually exists. An UPDATE
--      or DELETE matching zero rows raises nothing and changes nothing, which
--      looks identical to a policy denial. The seeds below exist so each
--      denial is real.
--   2. Returning to a trusted context needs `request.jwt.claims` cleared, not
--      just `role` reset. `auth.role()` reads the claims, so leaving them set
--      makes the profiles guard trigger fire on the test's own cleanup.
--
-- Run with:  psql "$DATABASE_URL" -f supabase/tests/50_rls_client_matrix.sql
-- Expected:  every row reports passed = true.
-- ---------------------------------------------------------------------------

begin;

create temp table rls_results(id text, name text, passed boolean, detail text);
grant insert, select on rls_results to authenticated, anon;

-- Stable identities from the Phase 1 dev seed.
create temp table ids as
select '939daf79-e226-4cd0-8757-52c866e3d999'::uuid as user_a,
       'c259cad8-60a0-4e11-8062-5085684fa634'::uuid as user_b,
       '58367972-5772-4701-9ab8-de10d1069758'::uuid as admin_id;

-- --------------------------------------------------------------- seeding ---
insert into public.expense_ledger (user_id, merchant, amount, expense_date, source)
select user_a, 'RLS-Probe-A', 111, '2026-08-10', 'manual' from ids
where not exists (select 1 from public.expense_ledger where merchant = 'RLS-Probe-A');

insert into public.expense_ledger (user_id, merchant, amount, expense_date, source)
select user_b, 'RLS-Probe-B', 222, '2026-08-11', 'manual' from ids
where not exists (select 1 from public.expense_ledger where merchant = 'RLS-Probe-B');

insert into public.debts (user_id, loan_type, lender_name, principal_amount,
                          interest_rate, tenure_months, emi_amount, start_date,
                          outstanding_balance)
select user_a, 'personal_loan', 'RLS-Probe-Lender', 500000, 10.5, 60, 10746.95,
       '2026-08-01', 480000 from ids
where not exists (select 1 from public.debts where lender_name = 'RLS-Probe-Lender');

insert into public.help_desk_tickets (user_id, category, priority, subject)
select user_a, 'billing', 'low', 'RLS-Probe-Ticket' from ids
where not exists (select 1 from public.help_desk_tickets where subject = 'RLS-Probe-Ticket');

insert into public.ai_usage_log (user_id, feature, status)
select user_b, 'chatbot', 'success' from ids
where not exists (select 1 from public.ai_usage_log
                  where user_id = (select user_b from ids));

-- ----------------------------------------------------------- the matrix ---
do $$
declare
  a uuid; b uuid; adm uuid;
  n int; n2 int; ok boolean; err text; v_id uuid; v_status text;
begin
  select user_a, user_b, admin_id into a, b, adm from ids;

  --------------------------------------------------- as user B (a peer) ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', b::text, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  select count(*) into n from public.expense_ledger where merchant = 'RLS-Probe-A';
  insert into rls_results values ('RLS-01','B reads A ledger', n = 0, 'rows='||n);

  ok := false; err := '';
  begin
    insert into public.expense_ledger (user_id, merchant, amount, expense_date, source)
    values (a, 'RLS-Forged', 1, '2026-08-01', 'manual');
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-02','B writes to A ledger', ok, 'sqlstate='||err);

  select count(*) into n from public.debts where lender_name = 'RLS-Probe-Lender';
  insert into rls_results values ('RLS-03a','B reads A debts', n = 0, 'rows='||n);
  select count(*) into n from public.help_desk_tickets where subject = 'RLS-Probe-Ticket';
  insert into rls_results values ('RLS-03b','B reads A tickets', n = 0, 'rows='||n);
  select count(*) into n from public.budgets where user_id = a;
  insert into rls_results values ('RLS-03c','B reads A budgets', n = 0, 'rows='||n);
  select count(*) into n from public.bank_statement_uploads where user_id = a;
  insert into rls_results values ('RLS-03d','B reads A statements', n = 0, 'rows='||n);
  select count(*) into n from public.ai_chat_conversations where user_id = a;
  insert into rls_results values ('RLS-03e','B reads A chat', n = 0, 'rows='||n);

  select count(*) into n from public.admin_audit_log;
  insert into rls_results values ('RLS-04a','user reads admin_audit_log', n = 0, 'rows='||n);
  select count(*) into n from public.ai_provider_config;
  insert into rls_results values ('RLS-04b','user reads ai_provider_config', n = 0, 'rows='||n);
  select count(*) into n from public.role_permissions;
  insert into rls_results values ('RLS-04c','user reads role_permissions', n = 0, 'rows='||n);
  select count(*) into n from public.data_privacy_requests;
  insert into rls_results values ('RLS-04d','user reads data_privacy_requests', n = 0, 'rows='||n);
  select count(*) into n from public.system_service_status;
  insert into rls_results values ('RLS-04e','user reads system_service_status', n = 0, 'rows='||n);

  ok := false; err := '';
  begin perform public.admin_analytics_overview(30);
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-05a','user calls admin_analytics_overview', ok,
    'sqlstate='||err);

  ok := false; err := '';
  begin perform public.admin_get_ai_provider_key(gen_random_uuid());
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-05b','user calls admin_get_ai_provider_key', ok,
    'sqlstate='||err);

  ok := false; err := '';
  begin update public.profiles set role = 'super_admin' where id = b;
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-06','user promotes self to super_admin', ok,
    'sqlstate='||err);

  -- RLS-07a asserts the OUTCOME, not the mechanism, and Phase 4 had to correct
  -- it for that reason. The original form asserted "an exception is raised",
  -- which is only one of the two ways this write is refused:
  --
  --   * when the user is ACTIVE, the row matches the UPDATE policy, the guard
  --     trigger fires, and 42501 is raised;
  --   * when the user is BLOCKED, the policy matches ZERO rows, so nothing is
  --     written and nothing is raised.
  --
  -- The second case made the original assertion fail against a live database
  -- even though the account correctly stayed blocked. It is the same trap this
  -- file warns about at the top, hit by the file itself. Asserting the value is
  -- unchanged covers both paths and cannot pass vacuously.
  declare v_before boolean; v_after boolean;
  begin
    perform set_config('role','postgres', true);
    perform set_config('request.jwt.claims', '', true);
    update public.profiles set is_blocked = true where id = b;
    select is_blocked into v_before from public.profiles where id = b;

    perform set_config('request.jwt.claims',
      json_build_object('sub', b::text, 'role','authenticated')::text, true);
    perform set_config('role','authenticated', true);
    begin update public.profiles set is_blocked = false where id = b;
    exception when others then null; end;

    perform set_config('role','postgres', true);
    perform set_config('request.jwt.claims', '', true);
    select is_blocked into v_after from public.profiles where id = b;
    update public.profiles set is_blocked = false where id = b;

    perform set_config('request.jwt.claims',
      json_build_object('sub', b::text, 'role','authenticated')::text, true);
    perform set_config('role','authenticated', true);

    insert into rls_results values ('RLS-07a','blocked user unblocks self', 
      v_before and v_after, 'before='||v_before||' after='||v_after);
  end;

  -- The same column in the other direction, where the row IS visible to the
  -- policy, so the guard trigger is what refuses it.
  ok := false; err := '';
  begin update public.profiles set is_blocked = true where id = b;
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-07a2','active user sets own is_blocked', ok,
    'sqlstate='||err);

  ok := false; err := '';
  begin update public.profiles set deleted_at = now() where id = b;
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-07b','user edits own deleted_at', ok, 'sqlstate='||err);

  ok := false; err := '';
  begin update public.profiles set last_active_at = now() + interval '10 years' where id = b;
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-07c','user forges own last_active_at', ok,
    'sqlstate='||err);

  -- Seeded above, so this is a real row the delete could have removed.
  select count(*) into n from public.ai_usage_log where user_id = b;
  begin delete from public.ai_usage_log where user_id = b;
  exception when others then null; end;
  select count(*) into n2 from public.ai_usage_log where user_id = b;
  insert into rls_results values ('RLS-10','user deletes own ai_usage_log to reset quota',
    n > 0 and n = n2, 'before='||n||' after='||n2);

  ok := false; err := '';
  begin
    insert into public.alert_notifications (user_id, alert_type, message)
    values (b, 'overspending', 'self-issued');
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-11','user inserts own alert_notifications', ok,
    'sqlstate='||err);

  -- Inserted here so the UPDATE has something to bite on. There is no UPDATE
  -- policy on this table at all, so the write is silently inert by design.
  insert into public.bank_statement_uploads (user_id, status, original_filename)
  values (b, 'processing', 'rls12-probe.csv') returning id into v_id;
  begin update public.bank_statement_uploads set status = 'completed' where id = v_id;
  exception when others then null; end;
  select status into v_status from public.bank_statement_uploads where id = v_id;
  insert into rls_results values ('RLS-12','user sets statement status to completed',
    v_status = 'processing', 'status_after='||coalesce(v_status,'<unreadable>'));

  ------------------------------------------- the Phase 4 rate counter -----
  -- request_rate_log has BOTH its grants revoked and RLS with zero policies,
  -- so a client gets a hard 42501 rather than an empty result. A user must not
  -- be able to read their own counter, forge entries, or prune it to reset it.
  ok := false; err := '';
  begin select count(*) into n from public.request_rate_log;
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-15a','user reads request_rate_log', ok, 'sqlstate='||err);

  ok := false; err := '';
  begin insert into public.request_rate_log (user_id, action) values (b, 'process_receipt');
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-15b','user writes request_rate_log', ok, 'sqlstate='||err);

  ok := false; err := '';
  begin perform public.prune_request_rate_log();
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-15c','user calls prune_request_rate_log', ok, 'sqlstate='||err);

  --------------------------------------------------------- as the admin ----
  perform set_config('request.jwt.claims',
    json_build_object('sub', adm::text, 'role','authenticated')::text, true);

  -- No blanket read over another user's records, by design.
  select count(*) into n from public.expense_ledger where user_id = a;
  insert into rls_results values ('RLS-13a','super admin reads another user ledger',
    n = 0, 'rows='||n);
  select count(*) into n from public.bank_statement_uploads where user_id = b;
  insert into rls_results values ('RLS-13b','super admin reads another user statements',
    n = 0, 'rows='||n);
  -- The surfaces an admin is meant to have still work.
  select count(*) into n from public.profiles;
  insert into rls_results values ('RLS-13c','super admin reads profiles (intended)',
    n > 1, 'rows='||n);

  ok := false; err := '';
  begin select count(*) into n from public.request_rate_log;
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-15d','super admin reads request_rate_log', ok,
    'sqlstate='||err);

  ------------------------------------------------------- as anon (no JWT) --
  perform set_config('request.jwt.claims', '', true);
  perform set_config('role','anon', true);

  select count(*) into n from public.expense_ledger;
  insert into rls_results values ('RLS-14a','anon reads expense_ledger', n = 0, 'rows='||n);
  select count(*) into n from public.profiles;
  insert into rls_results values ('RLS-14b','anon reads profiles', n = 0, 'rows='||n);
  select count(*) into n from public.debts;
  insert into rls_results values ('RLS-14c','anon reads debts', n = 0, 'rows='||n);
  select count(*) into n from public.ai_provider_config;
  insert into rls_results values ('RLS-14d','anon reads ai_provider_config', n = 0, 'rows='||n);

  ok := false; err := '';
  begin perform public.is_super_admin();
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-14e','anon calls is_super_admin', ok, 'sqlstate='||err);

  ---------------------------------------------- blocked account (08 / 09) --
  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set is_blocked = true where id = b;

  perform set_config('request.jwt.claims',
    json_build_object('sub', b::text, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  select count(*) into n from public.expense_ledger where user_id = b;
  insert into rls_results values ('RLS-08a','blocked user reads own ledger', n >= 1, 'rows='||n);
  select count(*) into n from public.profiles where id = b;
  insert into rls_results values ('RLS-08b','blocked user reads own profile', n = 1, 'rows='||n);
  select count(*) into n from public.bank_statement_uploads where user_id = b;
  insert into rls_results values ('RLS-08c','blocked user reads own statements', n >= 1,
    'rows='||n);

  ok := false; err := '';
  begin
    insert into public.expense_ledger (user_id, merchant, amount, expense_date, source)
    values (b, 'Blocked-Write-Probe', 5, '2026-08-20', 'manual');
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-09a','blocked user inserts an expense', ok,
    'sqlstate='||err);

  ok := false; err := '';
  begin
    insert into public.help_desk_tickets (user_id, category, priority, subject)
    values (b, 'billing', 'low', 'Blocked-Ticket-Probe');
  exception when others then ok := true; err := SQLSTATE; end;
  insert into rls_results values ('RLS-09b','blocked user raises a ticket', ok,
    'sqlstate='||err);

  begin update public.expense_ledger set amount = 999999 where user_id = b;
  exception when others then null; end;
  select count(*) into n from public.expense_ledger where user_id = b and amount = 999999;
  insert into rls_results values ('RLS-09c','blocked user edits an expense', n = 0,
    'changed='||n);

  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set is_blocked = false where id = b;
end $$;

select id, name, passed, detail from rls_results order by id;

select count(*) filter (where not passed) as failures,
       count(*) as total
from rls_results;

-- Nothing above is meant to persist.
rollback;
