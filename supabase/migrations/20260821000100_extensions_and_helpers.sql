-- ---------------------------------------------------------------------------
-- 0001  Extensions and shared trigger functions.
--
-- Authorization helpers (is_super_admin / is_account_active) live in 0002
-- because their bodies reference public.profiles, which does not exist yet.
-- ---------------------------------------------------------------------------

create extension if not exists pgcrypto with schema extensions;

-- Keeps updated_at honest on every table that has one.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
