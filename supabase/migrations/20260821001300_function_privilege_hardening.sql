-- ---------------------------------------------------------------------------
-- 0013  Function privilege and search_path hardening.
--
-- Two problems the Supabase database linter surfaced after 0012:
--
-- 1. Postgres grants EXECUTE on every new function to PUBLIC. Revoking from
--    `anon` alone is useless while PUBLIC still holds the privilege, because
--    anon inherits it. Every REVOKE below therefore targets PUBLIC first and
--    then re-grants only to the roles that genuinely need the function.
--
-- 2. Trigger functions were reachable as PostgREST RPCs (/rest/v1/rpc/...).
--    A trigger function's EXECUTE privilege is checked when the trigger is
--    created, not when it fires, so revoking EXECUTE from every client role
--    leaves the triggers working while removing the RPC surface entirely.
-- ---------------------------------------------------------------------------

-- Pin search_path on the two functions that were missing it.
alter function public.set_updated_at() set search_path = public;
alter function public.ai_week_start(timestamptz) set search_path = public;

-- --------------------------------------------------- trigger functions -----
-- Called only by the trigger machinery. No client role needs EXECUTE.
revoke all on function public.set_updated_at()                    from public, anon, authenticated;
revoke all on function public.handle_new_user()                   from public, anon, authenticated;
revoke all on function public.guard_profile_privileged_columns()  from public, anon, authenticated;
revoke all on function public.write_admin_audit()                 from public, anon, authenticated;

-- ------------------------------------------------ authorization helpers -----
-- `authenticated` must keep EXECUTE: these are evaluated inside RLS policy
-- expressions on behalf of the querying role. `anon` never is — no policy
-- granted to anon references them.
revoke all on function public.is_super_admin(uuid)     from public, anon;
revoke all on function public.is_account_active(uuid)  from public, anon;
grant execute on function public.is_super_admin(uuid)     to authenticated, service_role;
grant execute on function public.is_account_active(uuid)  to authenticated, service_role;

-- --------------------------------------------------- user-facing helpers ----
revoke all on function public.ai_week_start(timestamptz) from public, anon;
revoke all on function public.ai_quota_status(uuid)      from public, anon;
revoke all on function public.budget_progress(date)      from public, anon;
grant execute on function public.ai_week_start(timestamptz) to authenticated, service_role;
grant execute on function public.ai_quota_status(uuid)      to authenticated, service_role;
grant execute on function public.budget_progress(date)      to authenticated, service_role;

-- ---------------------------------------------------- admin dashboards ------
-- These are SECURITY DEFINER and aggregate across all users. Each one checks
-- public.is_super_admin() as its first statement and raises 42501 otherwise,
-- so the role check is inside the function; revoking anon here removes the
-- unauthenticated RPC surface as well.
revoke all on function public.admin_analytics_overview(integer) from public, anon;
revoke all on function public.admin_ocr_dashboard(integer)      from public, anon;
revoke all on function public.admin_ai_dashboard(integer)       from public, anon;
grant execute on function public.admin_analytics_overview(integer) to authenticated, service_role;
grant execute on function public.admin_ocr_dashboard(integer)      to authenticated, service_role;
grant execute on function public.admin_ai_dashboard(integer)       to authenticated, service_role;
