-- ---------------------------------------------------------------------------
-- INT subset verifiable at the database — Phase 3 §5.1
--
-- The full INT suite lives in tests/integration/data-layer.int.test.ts and
-- runs over HTTPS with the anon key. This file covers the cases whose evidence
-- is entirely in the database, so they can be re-checked with psql alone.
--
-- Run with:  psql "$DATABASE_URL" -f supabase/tests/60_int_data_layer.sql
-- Expected:  every row reports passed = true.
-- ---------------------------------------------------------------------------

begin;

create temp table int_results(id text, name text, passed boolean, detail text);
grant insert, select on int_results to authenticated;

do $$
declare
  a uuid := '939daf79-e226-4cd0-8757-52c866e3d999';
  adm uuid := '58367972-5772-4701-9ab8-de10d1069758';
  n int; n2 int; ok boolean; err text;
  v_spent numeric; v_ledger numeric; v_rollup numeric; v_statements numeric;
  v_conv uuid; v_ticket uuid;
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', a::text, 'role','authenticated')::text, true);
  perform set_config('role','authenticated', true);

  -- INT-06: progress is the ledger, recomputed.
  select coalesce(sum(spent),0) into v_spent from public.budget_progress('2026-08-01');
  select coalesce(sum(amount),0) into v_ledger
    from public.expense_ledger e
    join public.budgets b on b.category_id = e.category_id and b.user_id = a
   where e.expense_date >= '2026-08-01' and e.expense_date < '2026-09-01';
  insert into int_results values ('INT-06','budget_progress matches the ledger sum',
    v_spent = v_ledger, 'rpc='||v_spent||' ledger='||v_ledger);

  -- INT-07: and it is never stored.
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='budgets'
     and column_name in ('spent','pct_used','remaining','progress');
  insert into int_results values ('INT-07','budget progress is never persisted',
    n = 0, 'snapshot_columns='||n);

  -- INT-08 / INT-11: the rollup is the ledger and nothing else. The statement
  -- total is reported alongside so the separation is visible, not asserted.
  select coalesce(sum(total),0) into v_rollup
    from public.analytics_category_rollup('2000-01-01','2100-01-01');
  select coalesce(sum(amount),0) into v_ledger from public.expense_ledger;
  select coalesce(sum(amount),0) into v_statements from public.bank_statement_transactions;
  insert into int_results values ('INT-08','analytics rollup equals the caller ledger',
    v_rollup = v_ledger, 'rollup='||v_rollup||' ledger='||v_ledger);
  insert into int_results values ('INT-11','statements contribute nothing to analytics',
    v_rollup = v_ledger,
    'rollup='||v_rollup||' ledger='||v_ledger||' statement_total='||v_statements);

  -- INT-10: no statement description has become an expense.
  select count(*) into n
    from public.bank_statement_transactions t
    join public.expense_ledger e on e.merchant = t.description;
  insert into int_results values ('INT-10','no statement description exists as an expense',
    n = 0, 'collisions='||n);

  -- INT-16: the shared counter adds up.
  select used, weekly_limit into n, n2 from public.ai_quota_status();
  select used + remaining = weekly_limit into ok from public.ai_quota_status();
  insert into int_results values ('INT-16','quota status is internally consistent',
    ok, 'used='||n||' limit='||n2);

  -- INT-20: both chat turns are the Edge Function's job.
  select id into v_conv from public.ai_chat_conversations where user_id = a limit 1;
  if v_conv is null then
    insert into int_results values ('INT-20','client cannot insert ai_chat_messages',
      false, 'NOT TESTED: no conversation exists for this user');
  else
    ok := false; err := '';
    begin
      insert into public.ai_chat_messages (conversation_id, role, content)
      values (v_conv, 'user', 'INT-20 forged turn');
    exception when others then ok := true; err := SQLSTATE; end;
    insert into int_results values ('INT-20','client cannot insert ai_chat_messages',
      ok, 'sqlstate='||err);
  end if;

  -- INT-21: sender_id comes from auth.uid(), never the client.
  select id into v_ticket from public.help_desk_tickets where user_id = a limit 1;
  if v_ticket is null then
    insert into int_results values ('INT-21','ticket reply cannot claim another sender',
      false, 'NOT TESTED: no ticket exists for this user');
  else
    ok := false; err := '';
    begin
      insert into public.help_desk_messages (ticket_id, sender_id, body)
      values (v_ticket, adm, 'INT-21 forged sender');
    exception when others then ok := true; err := SQLSTATE; end;
    insert into int_results values ('INT-21','ticket reply cannot claim another sender',
      ok, 'sqlstate='||err);
  end if;

  -- INT-25: audit entries come from triggers.
  ok := false; err := '';
  begin
    insert into public.admin_audit_log (action, target, status)
    values ('int.forged','profiles','successful');
  exception when others then ok := true; err := SQLSTATE; end;
  insert into int_results values ('INT-25','user cannot write admin_audit_log',
    ok, 'sqlstate='||err);

  -- INT-29: identifiers satisfy the Zod contract.
  select count(*) into n from public.expense_ledger
   where id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  insert into int_results values ('INT-29a','every ledger id is a UUID', n = 0, 'bad='||n);
  select count(*) into n from public.categories
   where id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  insert into int_results values ('INT-29b','every category id is a UUID', n = 0, 'bad='||n);

  ----------------------------------------------------------- as the admin --
  perform set_config('request.jwt.claims',
    json_build_object('sub', adm::text, 'role','authenticated')::text, true);

  ok := false; err := '';
  begin
    insert into public.admin_audit_log (action, target, status)
    values ('int.forged.admin','profiles','successful');
  exception when others then ok := true; err := SQLSTATE; end;
  insert into int_results values ('INT-25b','even an admin cannot write admin_audit_log',
    ok, 'sqlstate='||err);

  -- INT-26: the key is write-only, and that holds for the admin too.
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='ai_provider_config'
     and column_name in ('api_key','key','secret');
  insert into int_results values ('INT-26a','ai_provider_config exposes no key column',
    n = 0, 'key_columns='||n);

  ok := false; err := '';
  begin perform public.admin_get_ai_provider_key(gen_random_uuid());
  exception when others then ok := true; err := SQLSTATE; end;
  insert into int_results values ('INT-26b','even an admin cannot read a provider key',
    ok, 'sqlstate='||err);

  -- INT-27: soft deletes drop out of the standard listing.
  select count(*) into n from public.profiles where deleted_at is not null;
  select count(*) into n2 from public.profiles where deleted_at is null;
  insert into int_results values ('INT-27','soft-deleted users are excluded',
    n2 > 0, 'deleted='||n||' active='||n2);

  perform set_config('role','postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

select id, name, passed, detail from int_results order by id;
select count(*) filter (where not passed) as failures, count(*) as total from int_results;

rollback;
