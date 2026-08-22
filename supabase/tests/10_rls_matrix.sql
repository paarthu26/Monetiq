-- ---------------------------------------------------------------------------
-- RLS matrix for the user-owned tables.
--
-- For each table, with a fixture row owned by USER 1:
--   SELECT : anon / owner / non-owner / admin
--   INSERT : anon / non-owner-forging-owner / owner
--   UPDATE : anon / non-owner / owner
--
-- Denial cases run BEFORE the owner's own INSERT on purpose: several of these
-- tables carry unique constraints, and if the owner inserted first, a later
-- duplicate could raise 23505 before the RLS check ever ran — which would look
-- like a pass for the wrong reason.
--
-- Set these before running (see README):
--   select set_config('monetiq_test.u1', '<user1 uuid>', false);
--   select set_config('monetiq_test.u2', '<user2 uuid>', false);
--   select set_config('monetiq_test.admin', '<admin uuid>', false);
-- ---------------------------------------------------------------------------

do $$
declare
  u1    uuid := current_setting('monetiq_test.u1')::uuid;
  u2    uuid := current_setting('monetiq_test.u2')::uuid;
  admin uuid := current_setting('monetiq_test.admin')::uuid;
  fid   uuid;
  sel   text;
  spec  record;
begin
  for spec in
    select * from (values
      -- table, insert template (%L = acting user), update SET clause,
      -- expected owner INSERT, expected owner UPDATE, expected admin SELECT
      ('income_sources',
       'insert into public.income_sources (user_id, source_name, amount, frequency, received_or_start_date) values (%L, ''T'', 1000, ''monthly'', current_date)',
       'source_name = ''updated''', 'OK:1', 'OK:1', '0'),
      ('expense_ledger',
       'insert into public.expense_ledger (user_id, merchant, amount, expense_date, source) values (%L, ''T'', 10, current_date, ''manual'')',
       'notes = ''updated''', 'OK:1', 'OK:1', '0'),
      ('budgets',
       'insert into public.budgets (user_id, category_id, monthly_cap) values (%L, (select id from public.categories where user_id is null and name = ''Fuel''), 5000)',
       'monthly_cap = 9999', 'OK:1', 'OK:1', '0'),
      ('debts',
       'insert into public.debts (user_id, loan_type, lender_name, principal_amount, interest_rate, start_date, outstanding_balance) values (%L, ''credit_card'', ''T'', 50000, 18, current_date, 20000)',
       'outstanding_balance = 1', 'OK:1', 'OK:1', '0'),
      ('alert_settings',
       'insert into public.alert_settings (user_id, alert_type, threshold_value) values (%L, ''emi_reminder'', 100)',
       'enabled = false', 'OK:1', 'OK:1', '0'),
      -- Fired alerts are system statements about the user's data: the owner
      -- reads and dismisses them but may not fabricate one.
      ('alert_notifications',
       'insert into public.alert_notifications (user_id, alert_type, message) values (%L, ''overspending'', ''x'')',
       'is_read = true', 'ERROR:42501', 'OK:1', '0'),
      ('push_subscriptions',
       'insert into public.push_subscriptions (user_id, endpoint, keys) values (%L, ''https://example.test/p2'', ''{}''::jsonb)',
       'user_agent = ''updated''', 'OK:1', 'OK:1', '0'),
      -- Quota integrity: if a user could insert or delete their own usage rows
      -- they could reset their own weekly AI allowance. Read-only for owners,
      -- readable by admins for PRD 6.12.
      ('ai_usage_log',
       'insert into public.ai_usage_log (user_id, feature, status) values (%L, ''chatbot'', ''success'')',
       'status = ''failed''', 'ERROR:42501', 'OK:0', '1'),
      ('ai_chat_conversations',
       'insert into public.ai_chat_conversations (user_id, title) values (%L, ''T'')',
       'title = ''updated''', 'OK:1', 'OK:1', '0'),
      ('ocr_scan_log',
       'insert into public.ocr_scan_log (user_id, status) values (%L, ''success'')',
       'failure_reason = ''x''', 'ERROR:42501', 'OK:0', '1'),
      ('help_desk_tickets',
       'insert into public.help_desk_tickets (user_id, category, priority, subject) values (%L, ''Billing'', ''low'', ''T'')',
       'priority = ''high''', 'OK:1', 'OK:1', '1'),
      -- Status transitions are written by the Edge Function with the service
      -- role, so a user cannot mark a failed analysis "completed".
      ('bank_statement_uploads',
       'insert into public.bank_statement_uploads (user_id, bank_name, status) values (%L, ''T'', ''processing'')',
       'status = ''completed''', 'OK:1', 'OK:0', '0')
    ) as t(tbl, ins, upd, exp_owner_ins, exp_owner_upd, exp_admin_sel)
  loop
    select row_id into fid from monetiq_test.fixtures where table_name = spec.tbl;
    sel := format('select count(*)::text from public.%I where id = %L', spec.tbl, fid);

    perform monetiq_test.expect(spec.tbl, 'select/anon',       '0', monetiq_test.q(null,  sel));
    perform monetiq_test.expect(spec.tbl, 'select/owner',      '1', monetiq_test.q(u1,    sel));
    perform monetiq_test.expect(spec.tbl, 'select/other-user', '0', monetiq_test.q(u2,    sel));
    perform monetiq_test.expect(spec.tbl, 'select/admin', spec.exp_admin_sel, monetiq_test.q(admin, sel));

    perform monetiq_test.expect(spec.tbl, 'insert/anon',
      'ERROR:42501', monetiq_test.x(null, format(spec.ins, u1)));
    perform monetiq_test.expect(spec.tbl, 'insert/other-user-as-owner',
      'ERROR:42501', monetiq_test.x(u2, format(spec.ins, u1)));
    perform monetiq_test.expect(spec.tbl, 'insert/owner',
      spec.exp_owner_ins, monetiq_test.x(u1, format(spec.ins, u1)));

    perform monetiq_test.expect(spec.tbl, 'update/anon', 'OK:0',
      monetiq_test.x(null, format('update public.%I set %s where id = %L', spec.tbl, spec.upd, fid)));
    perform monetiq_test.expect(spec.tbl, 'update/other-user', 'OK:0',
      monetiq_test.x(u2, format('update public.%I set %s where id = %L', spec.tbl, spec.upd, fid)));
    perform monetiq_test.expect(spec.tbl, 'update/owner', spec.exp_owner_upd,
      monetiq_test.x(u1, format('update public.%I set %s where id = %L', spec.tbl, spec.upd, fid)));
  end loop;
end;
$$;

select suite, check_name, expected, actual
from monetiq_test.results where not passed order by id;
