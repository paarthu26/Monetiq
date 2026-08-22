-- ---------------------------------------------------------------------------
-- Database constraints and the shared weekly AI quota.
--
-- Constraint tests run as the OWNER, not as anon: RLS would deny an anonymous
-- write with 42501 before the CHECK constraint ever evaluated, which would
-- silently pass a test that proves nothing about the constraint.
-- ---------------------------------------------------------------------------

do $$
declare
  u1 uuid := current_setting('monetiq_test.u1')::uuid;
begin
  -- --------------------------------------------------------- constraints ---
  perform monetiq_test.expect('constraints','expense amount = 0 rejected','ERROR:23514',
    monetiq_test.x(u1, format('insert into public.expense_ledger (user_id,merchant,amount,expense_date,source) values (%L,''Z'',0,current_date,''manual'')',u1)));
  perform monetiq_test.expect('constraints','expense amount negative rejected','ERROR:23514',
    monetiq_test.x(u1, format('insert into public.expense_ledger (user_id,merchant,amount,expense_date,source) values (%L,''Z'',-100,current_date,''manual'')',u1)));
  -- Bank statement data must never be writable into the ledger.
  perform monetiq_test.expect('constraints','expense source out of enum rejected','ERROR:23514',
    monetiq_test.x(u1, format('insert into public.expense_ledger (user_id,merchant,amount,expense_date,source) values (%L,''Z'',10,current_date,''bank_statement'')',u1)));
  -- v1 debt scope.
  perform monetiq_test.expect('constraints','debt loan_type home_loan rejected','ERROR:23514',
    monetiq_test.x(u1, format('insert into public.debts (user_id,loan_type,lender_name,principal_amount,interest_rate,start_date,outstanding_balance) values (%L,''home_loan'',''X'',1,1,current_date,1)',u1)));

  begin
    insert into public.ai_usage_log (user_id, feature, status) values (u1, 'image_gen', 'success');
    perform monetiq_test.expect('constraints','ai_usage_log feature enum enforced','ERROR:23514','NO ERROR');
  exception when others then
    perform monetiq_test.expect('constraints','ai_usage_log feature enum enforced','ERROR:23514','ERROR:'||sqlstate);
  end;

  begin
    insert into public.expense_ledger (user_id, merchant, amount, expense_date, source)
    values (gen_random_uuid(), 'Orphan', 10, current_date, 'manual');
    perform monetiq_test.expect('constraints','expense_ledger user FK enforced','ERROR:23503','NO ERROR');
  exception when others then
    perform monetiq_test.expect('constraints','expense_ledger user FK enforced','ERROR:23503','ERROR:'||sqlstate);
  end;

  begin
    insert into public.content_pages (slug, title) values ('pricing', 'Rogue slug');
    perform monetiq_test.expect('constraints','content_pages slug enum enforced','ERROR:23514','NO ERROR');
  exception when others then
    perform monetiq_test.expect('constraints','content_pages slug enum enforced','ERROR:23514','ERROR:'||sqlstate);
  end;

  begin
    insert into public.categories (user_id, name) values (null, 'Groceries');
    perform monetiq_test.expect('constraints','categories unique nulls-not-distinct','ERROR:23505','NO ERROR');
  exception when others then
    perform monetiq_test.expect('constraints','categories unique nulls-not-distinct','ERROR:23505','ERROR:'||sqlstate);
  end;

  begin
    insert into public.debts (user_id,loan_type,lender_name,principal_amount,interest_rate,start_date,outstanding_balance)
    values (u1,'personal_loan','X',1000,150,current_date,500);
    perform monetiq_test.expect('constraints','debts interest_rate range enforced','ERROR:23514','NO ERROR');
  exception when others then
    perform monetiq_test.expect('constraints','debts interest_rate range enforced','ERROR:23514','ERROR:'||sqlstate);
  end;
end;
$$;

-- ------------------------------------------------- shared weekly AI quota ---
-- The rule that is easiest to get wrong: ONE counter per user across every AI
-- feature, not one counter per feature.
do $$
declare
  u2 uuid := current_setting('monetiq_test.u2')::uuid;
  used int; remaining int;
begin
  delete from public.ai_usage_log where user_id = u2;

  select q.used, q.remaining into used, remaining from public.ai_quota_status(u2) q;
  perform monetiq_test.expect('ai_quota','baseline used=0','0', used::text);
  perform monetiq_test.expect('ai_quota','baseline remaining=2','2', remaining::text);

  insert into public.ai_usage_log (user_id, feature, status) values (u2,'chatbot','failed');
  select q.used into used from public.ai_quota_status(u2) q;
  perform monetiq_test.expect('ai_quota','failed call does not consume','0', used::text);

  insert into public.ai_usage_log (user_id, feature, status, created_at)
  values (u2,'chatbot','success', public.ai_week_start() - interval '1 day');
  select q.used into used from public.ai_quota_status(u2) q;
  perform monetiq_test.expect('ai_quota','previous week not counted','0', used::text);

  insert into public.ai_usage_log (user_id, feature, status) values (u2,'chatbot','success');
  select q.used, q.remaining into used, remaining from public.ai_quota_status(u2) q;
  perform monetiq_test.expect('ai_quota','after chatbot used=1','1', used::text);

  -- Second success from a DIFFERENT feature. A per-feature counter would still
  -- read 0 for loan suggestions here; a shared counter reads 2 and is spent.
  insert into public.ai_usage_log (user_id, feature, status) values (u2,'loan_closure_suggestion','success');
  select q.used, q.remaining into used, remaining from public.ai_quota_status(u2) q;
  perform monetiq_test.expect('ai_quota','chatbot+loan share one counter, used=2','2', used::text);
  perform monetiq_test.expect('ai_quota','quota exhausted, remaining=0','0', remaining::text);
  perform monetiq_test.expect('ai_quota','3rd feature would be rejected','true', (remaining <= 0)::text);

  delete from public.ai_usage_log where user_id = u2;
end;
$$;

select suite, check_name, expected, actual
from monetiq_test.results where not passed order by id;
