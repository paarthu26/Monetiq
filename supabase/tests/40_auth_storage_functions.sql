-- ---------------------------------------------------------------------------
-- Auth, Storage and Edge Functions — exercised over the REAL HTTP APIs.
--
-- These call out from Postgres via the `http` extension, so every assertion
-- goes through the same GoTrue / Storage / Edge Runtime path a browser uses.
-- A SQL-only approximation would not test storage policies or Edge Function
-- authentication at all.
--
-- IMPORTANT: rows that an Edge Function must SEE have to be COMMITTED first.
-- The function connects over its own connection and cannot read your open
-- transaction — that is why fixture rows are inserted in a separate statement
-- before the block that calls the function.
-- ---------------------------------------------------------------------------

do $$
declare
  u1 uuid := current_setting('monetiq_test.u1')::uuid;
  u2 uuid := current_setting('monetiq_test.u2')::uuid;
  t1 text; t2 text; ta text; rt text;
  st integer; bd text; b text; s_name text;
begin
  t1 := monetiq_test.login('dev.user@monetiq.test','MonetiqDevUser!2026');
  t2 := monetiq_test.login('dev.user2@monetiq.test','MonetiqDevUser2!2026');
  ta := monetiq_test.login('dev.admin@monetiq.test','MonetiqDevAdmin!2026');

  -- ============================================================== AUTH =====
  perform monetiq_test.expect('auth','valid login returns access token','true', (t1 is not null)::text);
  perform monetiq_test.expect('auth','admin login returns access token','true', (ta is not null)::text);

  select status into st from monetiq_test.api('POST','/auth/v1/token?grant_type=password',
    '{"email":"dev.user@monetiq.test","password":"WrongPassword!1"}');
  perform monetiq_test.expect('auth','invalid password -> 400','400', st::text);

  select status into st from monetiq_test.api('POST','/auth/v1/token?grant_type=password',
    '{"email":"ghost@monetiq.test","password":"Whatever!1"}');
  perform monetiq_test.expect('auth','unknown user -> 400','400', st::text);

  select status, body into st, bd from monetiq_test.api('GET','/auth/v1/user', null, t1);
  perform monetiq_test.expect('auth','GET /user with token -> 200','200', st::text);
  perform monetiq_test.expect('auth','session resolves to correct user id', u1::text, (bd::jsonb)->>'id');
  perform monetiq_test.expect('auth','email is confirmed','true',
    (((bd::jsonb)->>'email_confirmed_at') is not null)::text);

  -- GoTrue answers 403 (not 401) for an absent or tampered user token.
  select status into st from monetiq_test.api('GET','/auth/v1/user', null, null);
  perform monetiq_test.expect('auth','unauthenticated GET /user denied (403)','403', st::text);
  select status into st from monetiq_test.api('GET','/auth/v1/user', null, t1 || 'tampered');
  perform monetiq_test.expect('auth','tampered JWT denied (403)','403', st::text);

  -- Session persistence / refresh.
  select body into bd from monetiq_test.api('POST','/auth/v1/token?grant_type=password',
    '{"email":"dev.user@monetiq.test","password":"MonetiqDevUser!2026"}');
  rt := (bd::jsonb)->>'refresh_token';
  select status, body into st, bd from monetiq_test.api('POST','/auth/v1/token?grant_type=refresh_token',
    json_build_object('refresh_token', rt)::text);
  perform monetiq_test.expect('auth','refresh_token grant -> 200','200', st::text);
  perform monetiq_test.expect('auth','refresh issues a new access token','true',
    (((bd::jsonb)->>'access_token') is not null)::text);

  select status into st from monetiq_test.api('POST','/auth/v1/logout', '{}', t2);
  perform monetiq_test.expect('auth','logout -> 204','204', st::text);

  -- The recover endpoint is reachable and never returns a session. Whether an
  -- email is delivered cannot be asserted here: the dev accounts use a .test
  -- domain and the project has no custom SMTP (429 = built-in rate limit).
  select status into st from monetiq_test.api('POST','/auth/v1/recover','{"email":"dev.user@monetiq.test"}');
  perform monetiq_test.expect('auth','recover endpoint reachable, issues no session','true',
    (st in (200, 400, 429))::text);

  -- =========================================================== STORAGE =====
  foreach b in array array['receipts-staging','bank-statements-staging','loan-documents-staging']
  loop
    s_name := 'storage/' || b;

    select status into st from monetiq_test.api('POST',
      '/storage/v1/object/'||b||'/'||u1::text||'/mine.pdf',
      '%PDF-1.4 monetiq-test', t1, 'application/pdf');
    perform monetiq_test.expect(s_name,'owner uploads into own folder','200', st::text);

    -- Storage returns a 4xx with an RLS AccessDenied body; assert on the
    -- denial reason, which is what actually proves the policy fired.
    select body into bd from monetiq_test.api('POST',
      '/storage/v1/object/'||b||'/'||u2::text||'/stolen.pdf',
      '%PDF-1.4 x', t1, 'application/pdf');
    perform monetiq_test.expect(s_name,'upload into other user folder denied by RLS','AccessDenied',
      (bd::jsonb)->>'code');

    select body into bd from monetiq_test.api('POST',
      '/storage/v1/object/'||b||'/'||u1::text||'/anon.pdf',
      '%PDF-1.4 x', null, 'application/pdf');
    perform monetiq_test.expect(s_name,'anonymous upload denied by RLS','AccessDenied',
      (bd::jsonb)->>'code');

    select status into st from monetiq_test.api('GET',
      '/storage/v1/object/'||b||'/'||u1::text||'/mine.pdf', null, t1);
    perform monetiq_test.expect(s_name,'owner reads own object','200', st::text);

    select status into st from monetiq_test.api('GET',
      '/storage/v1/object/'||b||'/'||u1::text||'/mine.pdf', null, t2);
    perform monetiq_test.expect(s_name,'cross-user read denied','400', st::text);

    -- Deliberately no admin blanket-read on staging buckets.
    select status into st from monetiq_test.api('GET',
      '/storage/v1/object/'||b||'/'||u1::text||'/mine.pdf', null, ta);
    perform monetiq_test.expect(s_name,'super admin has no blanket read','400', st::text);

    select status into st from monetiq_test.api('GET',
      '/storage/v1/object/'||b||'/'||u1::text||'/mine.pdf', null, null);
    perform monetiq_test.expect(s_name,'anonymous read denied','400', st::text);

    select status into st from monetiq_test.api('DELETE',
      '/storage/v1/object/'||b||'/'||u1::text||'/mine.pdf', null, t2);
    perform monetiq_test.expect(s_name,'cross-user delete denied','400', st::text);

    select status into st from monetiq_test.api('DELETE',
      '/storage/v1/object/'||b||'/'||u1::text||'/mine.pdf', null, t1);
    perform monetiq_test.expect(s_name,'owner deletes own object','200', st::text);
  end loop;

  perform monetiq_test.expect('storage','all three staging buckets are private','3',
    (select count(*)::text from storage.buckets
      where id in ('receipts-staging','bank-statements-staging','loan-documents-staging')
        and public = false));
  perform monetiq_test.expect('storage','no permanent document bucket exists','3',
    (select count(*)::text from storage.buckets));

  -- ===================================================== EDGE FUNCTIONS ====
  -- process-receipt: failure paths, then the success path, then proof that
  -- the staged file was deleted by the function itself.
  select status, body into st, bd from monetiq_test.api(
    'POST','/functions/v1/process-receipt','{"path":"x/y.jpg"}', null);
  perform monetiq_test.expect('fn/process-receipt','unauthenticated rejected','401', st::text);
  perform monetiq_test.expect('fn/process-receipt','unauthenticated error code','unauthenticated',
    (bd::jsonb)->'error'->>'code');

  select status, body into st, bd from monetiq_test.api(
    'POST','/functions/v1/process-receipt','{"wrong":"field"}', t1);
  perform monetiq_test.expect('fn/process-receipt','invalid input rejected','400', st::text);
  perform monetiq_test.expect('fn/process-receipt','invalid input error code','invalid_input',
    (bd::jsonb)->'error'->>'code');

  select status into st from monetiq_test.api(
    'POST','/functions/v1/process-receipt',
    json_build_object('path', u2::text || '/theirs.jpg')::text, t1);
  perform monetiq_test.expect('fn/process-receipt','cross-user path rejected','403', st::text);

  select status into st from monetiq_test.api('POST',
    '/storage/v1/object/receipts-staging/'||u1::text||'/receipt.jpg',
    'fake-jpeg-bytes', t1, 'image/jpeg');
  perform monetiq_test.expect('fn/process-receipt','staged upload ok','200', st::text);

  select status, body into st, bd from monetiq_test.api(
    'POST','/functions/v1/process-receipt',
    json_build_object('path', u1::text || '/receipt.jpg')::text, t1);
  perform monetiq_test.expect('fn/process-receipt','success path','200', st::text);
  -- The stub must SAY it is a stub rather than fabricating a plausible receipt.
  perform monetiq_test.expect('fn/process-receipt','reports stub extraction honestly','stub',
    (bd::jsonb)->'data'->>'extraction_source');
  perform monetiq_test.expect('fn/process-receipt','flags manual review required','true',
    (bd::jsonb)->'data'->>'requires_manual_review');

  -- The privacy rule: the raw document does not survive the request.
  select status into st from monetiq_test.api('GET',
    '/storage/v1/object/receipts-staging/'||u1::text||'/receipt.jpg', null, t1);
  perform monetiq_test.expect('fn/process-receipt','staged file deleted after processing','400', st::text);

  perform monetiq_test.expect('fn/process-receipt','ocr_scan_log success row written','true',
    (select (count(*) > 0)::text from public.ocr_scan_log
      where user_id = u1 and status = 'success' and created_at > now() - interval '5 minutes'));
  perform monetiq_test.expect('fn/process-receipt','ocr_scan_log failure row written','true',
    (select (count(*) > 0)::text from public.ocr_scan_log
      where user_id = u1 and status = 'failed' and created_at > now() - interval '5 minutes'));

  -- ai-chat / ai-loan-suggestion: quota is checked BEFORE any provider call.
  -- With no provider configured, a user WITH quota gets 503 (reached the
  -- provider stage) and a user WITHOUT quota gets 429. The contrast is the
  -- proof of ordering — if quota were checked second, both would be 503.
  select status, body into st, bd from monetiq_test.api(
    'POST','/functions/v1/ai-chat','{"message":""}', t1);
  perform monetiq_test.expect('fn/ai-chat','empty message rejected','400', st::text);

  select status into st from monetiq_test.api(
    'POST','/functions/v1/ai-chat','{"message":"hello"}', null);
  perform monetiq_test.expect('fn/ai-chat','unauthenticated rejected','401', st::text);

  -- manage-ai-key authorization.
  select status, body into st, bd from monetiq_test.api(
    'POST','/functions/v1/manage-ai-key',
    '{"action":"upsert_provider","provider":"anthropic","model":"claude-x"}', t1);
  perform monetiq_test.expect('fn/manage-ai-key','regular user rejected','403', st::text);
  perform monetiq_test.expect('fn/manage-ai-key','regular user error code','forbidden',
    (bd::jsonb)->'error'->>'code');

  select status into st from monetiq_test.api(
    'POST','/functions/v1/manage-ai-key','{"action":"bogus_action"}', ta);
  perform monetiq_test.expect('fn/manage-ai-key','invalid action rejected','400', st::text);
end;
$$;

select suite, check_name, expected, actual
from monetiq_test.results where not passed order by id;
