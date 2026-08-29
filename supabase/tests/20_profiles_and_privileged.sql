-- ---------------------------------------------------------------------------
-- profiles privileged columns, admin-only tables, and the AI key.
--
-- The first block is the single most important test in this repo: privilege
-- escalation through a self-UPDATE on profiles is the classic failure mode for
-- this schema shape, and RLS alone cannot prevent it (RLS is row-level, not
-- column-level). The guard is a BEFORE UPDATE trigger.
-- ---------------------------------------------------------------------------

do $$
declare
  u1    uuid := current_setting('monetiq_test.u1')::uuid;
  u2    uuid := current_setting('monetiq_test.u2')::uuid;
  admin uuid := current_setting('monetiq_test.admin')::uuid;
  cfg   uuid;
  spec  record;
begin
  -- ------------------------------------------------ profiles: escalation ---
  perform monetiq_test.expect('profiles','update/self-name-allowed','OK:1',
    monetiq_test.x(u1, format('update public.profiles set full_name=''Renamed'' where id=%L',u1)));
  perform monetiq_test.expect('profiles','update/self-role-escalation','ERROR:42501',
    monetiq_test.x(u1, format('update public.profiles set role=''super_admin'' where id=%L',u1)));
  perform monetiq_test.expect('profiles','update/self-unblock','ERROR:42501',
    monetiq_test.x(u1, format('update public.profiles set is_blocked=true where id=%L',u1)));
  perform monetiq_test.expect('profiles','update/self-deleted-at','ERROR:42501',
    monetiq_test.x(u1, format('update public.profiles set deleted_at=now() where id=%L',u1)));
  perform monetiq_test.expect('profiles','update/other-user-denied','OK:0',
    monetiq_test.x(u1, format('update public.profiles set full_name=''Hacked'' where id=%L',u2)));
  perform monetiq_test.expect('profiles','insert/denied','ERROR:42501',
    monetiq_test.x(u1, 'insert into public.profiles (id, full_name) values (gen_random_uuid(), ''Ghost'')'));
  perform monetiq_test.expect('profiles','delete/own-denied','OK:0',
    monetiq_test.x(u1, format('delete from public.profiles where id=%L',u1)));
  perform monetiq_test.expect('profiles','delete/admin-denied','OK:0',
    monetiq_test.x(admin, format('delete from public.profiles where id=%L',u2)));

  -- Admins CAN block / soft-delete. Each is reverted immediately.
  perform monetiq_test.expect('profiles','update/admin-blocks-user','OK:1',
    monetiq_test.x(admin, format('update public.profiles set is_blocked=true where id=%L',u2)));
  perform monetiq_test.expect('profiles','update/admin-unblocks-user','OK:1',
    monetiq_test.x(admin, format('update public.profiles set is_blocked=false where id=%L',u2)));
  perform monetiq_test.expect('profiles','update/admin-soft-deletes','OK:1',
    monetiq_test.x(admin, format('update public.profiles set deleted_at=now() where id=%L',u2)));
  perform monetiq_test.expect('profiles','update/admin-restores','OK:1',
    monetiq_test.x(admin, format('update public.profiles set deleted_at=null where id=%L',u2)));

  -- ---------------------------------------------------- admin-only tables --
  for spec in
    select * from (values
      ('role_permissions',      'insert into public.role_permissions (permission_key,label) values (''rogue'',''Rogue'')'),
      ('system_service_status', 'insert into public.system_service_status (service_name) values (''Rogue Service'')'),
      ('system_alerts',         'insert into public.system_alerts (severity,title) values (''info'',''Rogue'')'),
      ('ai_provider_config',    'insert into public.ai_provider_config (provider,model) values (''rogue'',''rogue-1'')')
    ) as t(tbl, ins)
  loop
    perform monetiq_test.expect(spec.tbl,'select/regular-user','0',
      monetiq_test.q(u1, format('select count(*)::text from public.%I', spec.tbl)));
    perform monetiq_test.expect(spec.tbl,'select/anon','0',
      monetiq_test.q(null, format('select count(*)::text from public.%I', spec.tbl)));
    perform monetiq_test.expect(spec.tbl,'insert/regular-user-denied','ERROR:42501',
      monetiq_test.x(u1, spec.ins));
    perform monetiq_test.expect(spec.tbl,'delete/regular-user-denied','OK:0',
      monetiq_test.x(u1, format('delete from public.%I', spec.tbl)));
  end loop;

  -- admin_audit_log is append-only: admins READ it, nobody writes via the API.
  perform monetiq_test.expect('admin_audit_log','select/regular-user','0',
    monetiq_test.q(u1,'select count(*)::text from public.admin_audit_log'));
  perform monetiq_test.expect('admin_audit_log','select/admin-nonzero','true',
    monetiq_test.q(admin,'select (count(*) > 0)::text from public.admin_audit_log'));
  perform monetiq_test.expect('admin_audit_log','insert/admin-denied','ERROR:42501',
    monetiq_test.x(admin,'insert into public.admin_audit_log (action,target) values (''forged'',''x'')'));
  perform monetiq_test.expect('admin_audit_log','update/admin-denied','OK:0',
    monetiq_test.x(admin,'update public.admin_audit_log set action=''tampered'''));
  perform monetiq_test.expect('admin_audit_log','delete/admin-denied','OK:0',
    monetiq_test.x(admin,'delete from public.admin_audit_log'));

  -- ------------------------------------------------------ AI key secrecy ---
  -- Even a super_admin must not be able to read a stored provider key. Only
  -- the service role (i.e. an Edge Function) can.
  select id into cfg from public.ai_provider_config limit 1;
  if cfg is not null then
    perform monetiq_test.expect('ai_key_secrecy','user cannot call admin_get_ai_provider_key','ERROR:42501',
      monetiq_test.q(u1, format('select public.admin_get_ai_provider_key(%L)', cfg)));
    perform monetiq_test.expect('ai_key_secrecy','ADMIN cannot call admin_get_ai_provider_key','ERROR:42501',
      monetiq_test.q(admin, format('select public.admin_get_ai_provider_key(%L)', cfg)));
    perform monetiq_test.expect('ai_key_secrecy','user cannot call admin_set_ai_provider_key','ERROR:42501',
      monetiq_test.q(u1, format('select public.admin_set_ai_provider_key(%L, ''sk-evil'')::text', cfg)));
  end if;
  perform monetiq_test.expect('ai_key_secrecy','user cannot read vault.secrets','ERROR:42501',
    monetiq_test.q(u1, 'select count(*)::text from vault.secrets'));
  perform monetiq_test.expect('ai_key_secrecy','user cannot read vault.decrypted_secrets','ERROR:42501',
    monetiq_test.q(u1, 'select count(*)::text from vault.decrypted_secrets'));
  perform monetiq_test.expect('ai_key_secrecy','admin cannot read vault.decrypted_secrets','ERROR:42501',
    monetiq_test.q(admin, 'select count(*)::text from vault.decrypted_secrets'));

  -- --------------------------------------------------- admin RPC guards ----
  perform monetiq_test.expect('admin_rpc','analytics/regular-user-denied','ERROR:42501',
    monetiq_test.q(u1,'select total_users::text from public.admin_analytics_overview(30)'));
  perform monetiq_test.expect('admin_rpc','ocr-dashboard/regular-user-denied','ERROR:42501',
    monetiq_test.q(u1,'select scans::text from public.admin_ocr_dashboard(30)'));
  perform monetiq_test.expect('admin_rpc','ai-dashboard/regular-user-denied','ERROR:42501',
    monetiq_test.q(u1,'select requests::text from public.admin_ai_dashboard(30)'));

  -- --------------------------------------------------------- categories ----
  perform monetiq_test.expect('categories','select/predefined-anon','0',
    monetiq_test.q(null,'select count(*)::text from public.categories where user_id is null'));
  perform monetiq_test.expect('categories','insert/predefined-denied','ERROR:42501',
    monetiq_test.x(u1, 'insert into public.categories (user_id,name) values (null,''Rogue Global'')'));
  perform monetiq_test.expect('categories','update/predefined-denied','OK:0',
    monetiq_test.x(u1, 'update public.categories set name=''Hijacked'' where user_id is null and name=''Groceries'''));
  perform monetiq_test.expect('categories','delete/predefined-denied','OK:0',
    monetiq_test.x(u1, 'delete from public.categories where user_id is null and name=''Groceries'''));

  -- ------------------------------------------------------- content_pages ---
  perform monetiq_test.expect('content_pages','select/published-user','1',
    monetiq_test.q(u1, 'select count(*)::text from public.content_pages where slug=''terms'''));
  perform monetiq_test.expect('content_pages','select/draft-user','0',
    monetiq_test.q(u1, 'select count(*)::text from public.content_pages where slug=''help'''));
  perform monetiq_test.expect('content_pages','select/draft-admin','1',
    monetiq_test.q(admin, 'select count(*)::text from public.content_pages where slug=''help'''));
  perform monetiq_test.expect('content_pages','select/anon','0',
    monetiq_test.q(null, 'select count(*)::text from public.content_pages'));
  perform monetiq_test.expect('content_pages','insert/user-denied','ERROR:42501',
    monetiq_test.x(u1, 'insert into public.content_pages (slug,title,body) values (''about'',''Rogue'',''x'')'));
  perform monetiq_test.expect('content_pages','update/user-denied','OK:0',
    monetiq_test.x(u1, 'update public.content_pages set body=''tampered'' where slug=''terms'''));
  perform monetiq_test.expect('content_pages','update/admin-allowed','OK:1',
    monetiq_test.x(admin, 'update public.content_pages set body=''Updated by admin'' where slug=''terms'''));
end;
$$;

select suite, check_name, expected, actual
from monetiq_test.results where not passed order by id;
