-- ---------------------------------------------------------------------------
-- 0011  Super Admin analytics functions, audit triggers, and the Vault-backed
--       AI key accessors.
--
-- PRD 6.12's four metrics (Total Users / Active Users / OCR Usage / AI Usage)
-- are DERIVED from existing tables. There is no duplicate reporting table.
-- ---------------------------------------------------------------------------

-- PRD 6.12. SECURITY DEFINER because it aggregates across all users, with an
-- explicit role check as the first statement — the function is the boundary,
-- not RLS.
create or replace function public.admin_analytics_overview(p_days integer default 30)
returns table (
  total_users        bigint,
  active_users       bigint,
  blocked_users      bigint,
  ocr_usage          bigint,
  ai_usage           bigint,
  window_days        integer
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
  select
    (select count(*) from public.profiles where deleted_at is null),
    (select count(*) from public.profiles
      where deleted_at is null
        and last_active_at >= now() - make_interval(days => p_days)),
    (select count(*) from public.profiles where deleted_at is null and is_blocked),
    (select count(*) from public.ocr_scan_log
      where created_at >= now() - make_interval(days => p_days)),
    (select count(*) from public.ai_usage_log
      where status = 'success'
        and created_at >= now() - make_interval(days => p_days)),
    p_days;
end;
$$;

-- Prototype OCR Management dashboard, built on ocr_scan_log rather than a
-- second table.
create or replace function public.admin_ocr_dashboard(p_days integer default 30)
returns table (
  day               date,
  scans             bigint,
  successes         bigint,
  failures          bigint,
  success_rate_pct  numeric,
  avg_duration_ms   numeric
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
  select
    (l.created_at at time zone 'Asia/Kolkata')::date,
    count(*),
    count(*) filter (where l.status = 'success'),
    count(*) filter (where l.status = 'failed'),
    round(100.0 * count(*) filter (where l.status = 'success') / nullif(count(*), 0), 2),
    round(avg(l.duration_ms), 2)
  from public.ocr_scan_log l
  where l.created_at >= now() - make_interval(days => p_days)
  group by 1
  order by 1 desc;
end;
$$;

-- Prototype AI Management dashboard, built on ai_usage_log. Includes the
-- per-provider cost tracking required by PRD 6.15.
create or replace function public.admin_ai_dashboard(p_days integer default 30)
returns table (
  provider          text,
  requests          bigint,
  successes         bigint,
  failures          bigint,
  success_rate_pct  numeric,
  avg_duration_ms   numeric,
  total_cost_usd    numeric
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
  select
    coalesce(l.provider, 'unknown'),
    count(*),
    count(*) filter (where l.status = 'success'),
    count(*) filter (where l.status = 'failed'),
    round(100.0 * count(*) filter (where l.status = 'success') / nullif(count(*), 0), 2),
    round(avg(l.duration_ms), 2),
    round(coalesce(sum(l.cost_usd), 0), 6)
  from public.ai_usage_log l
  where l.created_at >= now() - make_interval(days => p_days)
  group by 1
  order by 2 desc;
end;
$$;

revoke execute on function public.admin_analytics_overview(integer) from anon;
revoke execute on function public.admin_ocr_dashboard(integer) from anon;
revoke execute on function public.admin_ai_dashboard(integer) from anon;

-- ---------------------------------------------------------- audit trail ----
-- SECURITY DEFINER so the insert bypasses admin_audit_log's read-only RLS.
-- This is the only write path into that table.
create or replace function public.write_admin_audit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text;
  v_target text := tg_table_name;
  v_target_id uuid;
  v_details jsonb := '{}'::jsonb;
begin
  if tg_table_name = 'profiles' then
    v_target_id := new.id;
    if new.is_blocked is distinct from old.is_blocked then
      v_action := case when new.is_blocked then 'user.block' else 'user.unblock' end;
    elsif new.deleted_at is distinct from old.deleted_at then
      v_action := case when new.deleted_at is null then 'user.restore' else 'user.delete' end;
    elsif new.role is distinct from old.role then
      v_action := case when new.role = 'super_admin' then 'admin.add' else 'admin.remove' end;
      v_details := jsonb_build_object('from', old.role, 'to', new.role);
    else
      return new;
    end if;

  elsif tg_table_name = 'ai_provider_config' then
    v_target_id := coalesce(new.id, old.id);
    v_action := 'ai_key.' || lower(tg_op);
    v_details := jsonb_build_object(
      'provider', coalesce(new.provider, old.provider),
      'model',    coalesce(new.model, old.model),
      'is_active', coalesce(new.is_active, old.is_active)
    );

  elsif tg_table_name = 'content_pages' then
    v_target_id := new.id;
    if new.status = 'published' and old.status is distinct from 'published' then
      v_action := 'content.publish';
    elsif new.version is distinct from old.version then
      v_action := 'content.update';
    else
      return new;
    end if;
    v_details := jsonb_build_object('slug', new.slug, 'version', new.version);

  elsif tg_table_name = 'help_desk_tickets' then
    v_target_id := new.id;
    if new.status = 'closed' and old.status is distinct from 'closed' then
      v_action := 'ticket.close';
    else
      return new;
    end if;

  else
    return coalesce(new, old);
  end if;

  insert into public.admin_audit_log (admin_id, action, target, target_id, status, details)
  values (auth.uid(), v_action, v_target, v_target_id, 'successful', v_details);

  return coalesce(new, old);
end;
$$;

drop trigger if exists profiles_audit on public.profiles;
create trigger profiles_audit
  after update on public.profiles
  for each row execute function public.write_admin_audit();

drop trigger if exists ai_provider_config_audit on public.ai_provider_config;
create trigger ai_provider_config_audit
  after insert or update or delete on public.ai_provider_config
  for each row execute function public.write_admin_audit();

drop trigger if exists content_pages_audit on public.content_pages;
create trigger content_pages_audit
  after update on public.content_pages
  for each row execute function public.write_admin_audit();

drop trigger if exists help_desk_tickets_audit on public.help_desk_tickets;
create trigger help_desk_tickets_audit
  after update on public.help_desk_tickets
  for each row execute function public.write_admin_audit();

-- ------------------------------------------------- AI key: Vault access ----
-- Approach chosen: Supabase Vault + service-role-only SECURITY DEFINER
-- wrappers, called from the manage-ai-key Edge Function.
--
-- Why wrappers rather than calling Vault straight from the Edge Function:
-- the vault schema is not exposed through PostgREST, so supabase-js cannot
-- reach vault.create_secret directly. These three functions are the entire
-- API surface, EXECUTE is revoked from PUBLIC/anon/authenticated, and only
-- service_role can call them. The raw key value never appears in any
-- client-readable column and is never returned to a browser.
create or replace function public.admin_set_ai_provider_key(p_config_id uuid, p_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
  v_name text := 'monetiq_ai_provider_key_' || p_config_id::text;
begin
  if p_key is null or length(btrim(p_key)) = 0 then
    raise exception 'Key must not be empty' using errcode = '22023';
  end if;

  select vault_secret_id into v_secret_id
  from public.ai_provider_config where id = p_config_id;

  if not found then
    raise exception 'Provider configuration not found' using errcode = 'P0002';
  end if;

  if v_secret_id is null then
    v_secret_id := vault.create_secret(p_key, v_name, 'Monetiq AI provider API key');
    update public.ai_provider_config
       set vault_secret_id = v_secret_id, has_key = true
     where id = p_config_id;
  else
    perform vault.update_secret(v_secret_id, p_key, v_name, 'Monetiq AI provider API key');
    update public.ai_provider_config set has_key = true where id = p_config_id;
  end if;
end;
$$;

create or replace function public.admin_get_ai_provider_key(p_config_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
  v_key text;
begin
  select vault_secret_id into v_secret_id
  from public.ai_provider_config where id = p_config_id;

  if v_secret_id is null then
    return null;
  end if;

  select decrypted_secret into v_key
  from vault.decrypted_secrets where id = v_secret_id;

  return v_key;
end;
$$;

create or replace function public.admin_delete_ai_provider_key(p_config_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
begin
  select vault_secret_id into v_secret_id
  from public.ai_provider_config where id = p_config_id;

  if v_secret_id is not null then
    delete from vault.secrets where id = v_secret_id;
  end if;

  update public.ai_provider_config
     set vault_secret_id = null, has_key = false
   where id = p_config_id;
end;
$$;

revoke all on function public.admin_set_ai_provider_key(uuid, text)    from public, anon, authenticated;
revoke all on function public.admin_get_ai_provider_key(uuid)          from public, anon, authenticated;
revoke all on function public.admin_delete_ai_provider_key(uuid)       from public, anon, authenticated;

grant execute on function public.admin_set_ai_provider_key(uuid, text) to service_role;
grant execute on function public.admin_get_ai_provider_key(uuid)       to service_role;
grant execute on function public.admin_delete_ai_provider_key(uuid)    to service_role;

comment on function public.admin_get_ai_provider_key(uuid) is
  'Service-role only. Reads the provider key from Supabase Vault for Edge Function use. EXECUTE is revoked from anon and authenticated.';
