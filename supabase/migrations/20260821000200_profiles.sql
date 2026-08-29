-- ---------------------------------------------------------------------------
-- 0002  profiles: the application mirror of auth.users.
--
-- Role model is deliberately FLAT (PRD section 3): 'user' | 'super_admin'.
-- Every super_admin can do everything every other super_admin can do. The
-- role_permissions table added later is display-only configuration and is not
-- consulted by any policy here.
-- ---------------------------------------------------------------------------

create table if not exists public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  email          text,
  full_name      text,
  avatar_url     text,
  phone          text,
  occupation     text,
  financial_goals text,
  role           text not null default 'user'
                   check (role in ('user', 'super_admin')),
  is_blocked     boolean not null default false,
  deleted_at     timestamptz,
  last_active_at timestamptz not null default now(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists profiles_role_idx on public.profiles (role)
  where deleted_at is null;
create index if not exists profiles_active_idx on public.profiles (last_active_at desc)
  where deleted_at is null;

-- Authorization helpers.
--
-- These are SECURITY DEFINER on purpose: RLS policies on public.profiles need
-- to ask "is the caller a super admin?", which means reading public.profiles.
-- A plain query there would re-enter the same policies and recurse. A definer
-- function owned by the migration role reads the table with RLS bypassed and
-- terminates the recursion. search_path is pinned so the body cannot be
-- hijacked by a caller-controlled search_path.
create or replace function public.is_super_admin(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and p.role = 'super_admin'
      and p.is_blocked = false
      and p.deleted_at is null
  );
$$;

-- A blocked or soft-deleted account keeps read access to its own data but is
-- barred from mutating anything. Used in the WITH CHECK / USING clauses of
-- write policies on user-owned tables.
create or replace function public.is_account_active(p_uid uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = p_uid
      and p.is_blocked = false
      and p.deleted_at is null
  );
$$;

revoke execute on function public.is_super_admin(uuid) from anon;
revoke execute on function public.is_account_active(uuid) from anon;

comment on function public.is_super_admin(uuid) is
  'True when the given (default: current) user is an active super_admin. SECURITY DEFINER to avoid RLS recursion on public.profiles.';
comment on function public.is_account_active(uuid) is
  'True when the given (default: current) user is neither blocked nor soft-deleted.';

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create a profile row for every new auth user, including Google OAuth
-- sign-ups (name/avatar arrive in raw_user_meta_data).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name'
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS cannot express column-level restrictions, and revoking the UPDATE
-- privilege on these columns would also lock out super admins (who are the
-- same Postgres role). A BEFORE UPDATE trigger is the mechanism that actually
-- stops a user escalating their own role or unblocking themselves.
create or replace function public.guard_profile_privileged_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(auth.role(), 'postgres');
begin
  -- Migrations / seeds / Edge Functions running with the service role are
  -- trusted; every PostgREST caller is not.
  if v_role in ('service_role', 'postgres', 'supabase_admin') then
    return new;
  end if;

  if (new.role       is distinct from old.role)
     or (new.is_blocked is distinct from old.is_blocked)
     or (new.deleted_at is distinct from old.deleted_at)
  then
    if not public.is_super_admin() then
      raise exception
        'Not authorized to modify role, is_blocked or deleted_at'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.guard_profile_privileged_columns();

-- NOTE: enable, not FORCE. The SECURITY DEFINER helpers above execute as the
-- table owner, and FORCE would subject the owner to these same policies,
-- reintroducing the recursion they exist to break. The anon and authenticated
-- roles are never the owner, so every real client is still constrained.
alter table public.profiles enable row level security;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (auth.uid() = id);

drop policy if exists profiles_select_admin on public.profiles;
create policy profiles_select_admin on public.profiles
  for select to authenticated
  using (public.is_super_admin());

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own on public.profiles
  for update to authenticated
  using (auth.uid() = id and deleted_at is null and is_blocked = false)
  with check (auth.uid() = id);

drop policy if exists profiles_update_admin on public.profiles;
create policy profiles_update_admin on public.profiles
  for update to authenticated
  using (public.is_super_admin())
  with check (public.is_super_admin());

-- No INSERT policy: profiles are created only by the auth.users trigger.
-- No DELETE policy: user removal is a soft delete (deleted_at), per the
-- Section 6.13 decision recorded in the Phase 1 report.

comment on column public.profiles.deleted_at is
  'Soft delete. Super Admin "Delete User" sets this; rows with a value are excluded from all standard queries. Chosen over a hard delete because financial records hang off this row.';
