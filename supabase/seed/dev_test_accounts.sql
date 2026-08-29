-- ---------------------------------------------------------------------------
-- DEVELOPMENT-ONLY test accounts.
--
-- These credentials are intentionally committed so Phase 2 can pick the work
-- up without this conversation's history. They are development-only and MUST
-- be rotated or deleted before any real deployment.
--
--   dev.user@monetiq.test    / MonetiqDevUser!2026     role: user
--   dev.user2@monetiq.test   / MonetiqDevUser2!2026    role: user  (2nd user,
--                                                       used to prove
--                                                       non-owner denial)
--   dev.admin@monetiq.test   / MonetiqDevAdmin!2026    role: super_admin
--   dev.unverified@monetiq.test / MonetiqDevUnverified!2026  UNVERIFIED, for E2E-01
--
-- Rows are written straight into auth.users because this environment has no
-- Auth Admin API credential available. Passwords are bcrypt-hashed with
-- pgcrypto, exactly as GoTrue would store them, so normal email/password
-- sign-in works against these accounts. public.profiles rows are created
-- automatically by the on_auth_user_created trigger.
-- ---------------------------------------------------------------------------

do $$
declare
  v_user_id  uuid;
  v_user2_id uuid;
  v_admin_id uuid;
begin
  -- --------------------------------------------------------- test user 1 ---
  select id into v_user_id from auth.users where email = 'dev.user@monetiq.test';
  if v_user_id is null then
    v_user_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user_id, 'authenticated',
      'authenticated', 'dev.user@monetiq.test',
      extensions.crypt('MonetiqDevUser!2026', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Dev User"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  end if;

  -- --------------------------------------------------------- test user 2 ---
  select id into v_user2_id from auth.users where email = 'dev.user2@monetiq.test';
  if v_user2_id is null then
    v_user2_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_user2_id, 'authenticated',
      'authenticated', 'dev.user2@monetiq.test',
      extensions.crypt('MonetiqDevUser2!2026', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Dev User Two"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  end if;

  -- -------------------------------------------------------- super admin ----
  select id into v_admin_id from auth.users where email = 'dev.admin@monetiq.test';
  if v_admin_id is null then
    v_admin_id := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token,
      email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', v_admin_id, 'authenticated',
      'authenticated', 'dev.admin@monetiq.test',
      extensions.crypt('MonetiqDevAdmin!2026', extensions.gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"full_name":"Dev Super Admin"}'::jsonb,
      now(), now(), '', '', '', ''
    );
  end if;

  -- Identities let GoTrue resolve the email/password login.
  insert into auth.identities (
    provider_id, user_id, identity_data, provider, last_sign_in_at,
    created_at, updated_at
  )
  select u.id::text, u.id,
         jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
         'email', now(), now(), now()
  from auth.users u
  where u.email in ('dev.user@monetiq.test', 'dev.user2@monetiq.test', 'dev.admin@monetiq.test')
    and not exists (
      select 1 from auth.identities i
      where i.user_id = u.id and i.provider = 'email'
    );

  -- Promote the admin account. Runs as the migration role, so the
  -- guard_profile_privileged_columns trigger permits the role change.
  update public.profiles
     set role = 'super_admin'
   where id = (select id from auth.users where email = 'dev.admin@monetiq.test');

  ---------------------------------------------------------------------------
  -- A deliberately UNVERIFIED account.
  --
  -- E2E-01 asserts that signing in with an unconfirmed address is refused with
  -- its own actionable message rather than the generic "credentials not
  -- recognised". That needs an account with email_confirmed_at null, and there
  -- was none — the assertion could never have passed.
  --
  -- It cannot be created through /auth/v1/signup either: GoTrue rejects the
  -- .test TLD outright as email_address_invalid, and real domains hit the
  -- built-in mailer's rate limit because no custom SMTP is configured. So it is
  -- built here the same way the others are.
  --
  -- Every writable column is copied from an existing row on purpose. Omitting
  -- any of them leaves NULLs that GoTrue scans into non-pointer Go types, which
  -- surfaces on sign-in as a 500 "Database error querying schema" rather than
  -- anything that names the real problem.
  ---------------------------------------------------------------------------
  if not exists (select 1 from auth.users where email = 'dev.unverified@monetiq.test') then
    declare
      v_unverified_id uuid := gen_random_uuid();
      v_cols text;
      v_vals text;
    begin
      select string_agg(quote_ident(column_name), ', ' order by ordinal_position),
             string_agg(
               case column_name
                 when 'id'                 then quote_literal(v_unverified_id)||'::uuid'
                 when 'email'              then quote_literal('dev.unverified@monetiq.test')
                 when 'encrypted_password' then 'extensions.crypt('
                                                ||quote_literal('MonetiqDevUnverified!2026')
                                                ||', extensions.gen_salt(''bf''))'
                 when 'email_confirmed_at' then 'null::timestamptz'
                 when 'last_sign_in_at'    then 'null::timestamptz'
                 when 'raw_user_meta_data' then quote_literal('{"full_name":"Dev Unverified"}')||'::jsonb'
                 when 'created_at'         then 'now()'
                 when 'updated_at'         then 'now()'
                 else quote_ident(column_name)
               end, ', ' order by ordinal_position)
        into v_cols, v_vals
      from information_schema.columns
      where table_schema = 'auth' and table_name = 'users'
        and is_generated = 'NEVER' and identity_generation is null;

      execute format(
        'insert into auth.users (%s) select %s from auth.users where email = %L',
        v_cols, v_vals, 'dev.user@monetiq.test'
      );

      insert into auth.identities (
        provider_id, user_id, identity_data, provider, last_sign_in_at,
        created_at, updated_at
      ) values (
        v_unverified_id::text, v_unverified_id,
        jsonb_build_object('sub', v_unverified_id::text,
                           'email', 'dev.unverified@monetiq.test',
                           'email_verified', false, 'phone_verified', false),
        'email', null, now(), now()
      );
    end;
  end if;
end;
$$;
