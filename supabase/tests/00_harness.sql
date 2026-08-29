-- ---------------------------------------------------------------------------
-- Monetiq test harness.
--
-- Run this first, then the numbered suites. Everything here lives in the
-- monetiq_test schema so it can be dropped in one statement (see 99_teardown).
--
-- Two problems this harness solves:
--
-- 1. RLS must be exercised as the REAL PostgREST roles, not as the migration
--    superuser. assume() switches role and installs a request.jwt.claims
--    payload so auth.uid() resolves exactly as it does for an API caller.
--
-- 2. RLS denies reads and writes differently. A denied INSERT raises 42501,
--    but a denied UPDATE/DELETE is silently filtered to zero rows. q() and x()
--    keep those distinguishable — a test that only looked for an exception
--    would score "0 rows updated" as a pass by accident.
--
-- api() and login() drive the real HTTP APIs (Auth, Storage, Edge Functions)
-- from inside Postgres via the `http` extension. That is deliberate: it tests
-- the same path a browser takes, including storage policies and Edge Function
-- auth, rather than a SQL approximation of them.
-- ---------------------------------------------------------------------------

create schema if not exists monetiq_test;
create extension if not exists http with schema extensions;

-- Edge Functions can take a few seconds; the default curl timeout is too low.
select extensions.http_set_curlopt('CURLOPT_TIMEOUT', '45');

-- --------------------------------------------------------- role switching --
create or replace function monetiq_test.assume(p_uid uuid)
returns void
language plpgsql
as $$
begin
  if p_uid is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('role', 'anon', true);
  else
    perform set_config(
      'request.jwt.claims',
      json_build_object('sub', p_uid::text, 'role', 'authenticated')::text,
      true
    );
    perform set_config('role', 'authenticated', true);
  end if;
end;
$$;

/** Scalar SELECT as the given user (null = anonymous). */
create or replace function monetiq_test.q(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare v_result text;
begin
  perform monetiq_test.assume(p_uid);
  execute p_sql into v_result;
  perform set_config('role', 'none', true);
  return coalesce(v_result, 'NULL');
exception when others then
  return 'ERROR:' || sqlstate;
end;
$$;

/** Mutating statement as the given user. Reports the affected row count so a
    policy-filtered no-op is distinguishable from a real write. */
create or replace function monetiq_test.x(p_uid uuid, p_sql text)
returns text
language plpgsql
as $$
declare v_rows bigint;
begin
  perform monetiq_test.assume(p_uid);
  execute p_sql;
  get diagnostics v_rows = row_count;
  perform set_config('role', 'none', true);
  return 'OK:' || v_rows;
exception when others then
  return 'ERROR:' || sqlstate;
end;
$$;

-- ------------------------------------------------------------ HTTP client --
-- NOTE: the anon key below is a PUBLIC key — it is safe in source control and
-- is useless without RLS being satisfied. Replace the base URL and key when
-- pointing these tests at a different project.
create or replace function monetiq_test.api(
  p_method text, p_path text, p_body text default null,
  p_token text default null, p_content_type text default 'application/json'
)
returns table (status integer, body text)
language plpgsql
as $$
declare
  v_anon text := current_setting('monetiq_test.anon_key', true);
  v_base text := current_setting('monetiq_test.base_url', true);
  v_resp extensions.http_response;
begin
  if v_anon is null or v_base is null then
    raise exception 'Set monetiq_test.base_url and monetiq_test.anon_key first (see README).';
  end if;

  select * into v_resp from extensions.http((
    p_method,
    v_base || p_path,
    array[
      extensions.http_header('apikey', v_anon),
      extensions.http_header('Authorization', 'Bearer ' || coalesce(p_token, v_anon))
    ],
    p_content_type,
    p_body
  )::extensions.http_request);

  return query select v_resp.status, v_resp.content::text;
end;
$$;

/** Real email/password sign-in. Returns an access token, or null. */
create or replace function monetiq_test.login(p_email text, p_password text)
returns text
language plpgsql
as $$
declare v_body text;
begin
  select body into v_body from monetiq_test.api(
    'POST', '/auth/v1/token?grant_type=password',
    json_build_object('email', p_email, 'password', p_password)::text
  );
  return (v_body::jsonb) ->> 'access_token';
end;
$$;

-- ------------------------------------------------------------- assertions --
create table if not exists monetiq_test.results (
  id         bigserial primary key,
  suite      text not null,
  check_name text not null,
  expected   text not null,
  actual     text not null,
  passed     boolean generated always as (expected = actual) stored
);

create or replace function monetiq_test.expect(
  p_suite text, p_name text, p_expected text, p_actual text
)
returns void
language sql
as $$
  insert into monetiq_test.results (suite, check_name, expected, actual)
  values (p_suite, p_name, p_expected, coalesce(p_actual, 'NULL'));
$$;

/** Known fixture row ids, so suites can address specific rows. */
create table if not exists monetiq_test.fixtures (
  table_name text primary key,
  row_id     uuid not null
);
