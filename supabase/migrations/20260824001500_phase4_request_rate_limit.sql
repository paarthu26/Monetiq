-- ---------------------------------------------------------------------------
-- Phase 4 — per-user request rate limiting for the document-processing
-- Edge Functions.
--
-- WHY THIS EXISTS
-- The weekly AI quota (ai_usage_log, 2/user/week) governs *generation*
-- features: chatbot, bank statement report, loan closure suggestion. It does
-- not govern the document intake functions at all — process-receipt,
-- process-bank-statement and process-loan-document never called
-- assertQuotaAvailable(), and 'bank_statement_report' was declared in the
-- ai_usage_log feature CHECK but consumed by no code path. Phase 4 confirmed
-- this by execution: process-receipt returned 200 for a user whose weekly
-- quota was fully exhausted. A user could therefore drive OCR, storage
-- downloads and CSV parsing as fast as they could upload.
--
-- These are two different controls and are deliberately kept separate:
--   quota      counts SUCCESSES, resets weekly, is a product allowance
--   rate limit counts REQUESTS,   slides continuously, is an abuse control
--
-- Counting requests rather than successes is the point: if only successes
-- counted, hammering a path that fails would cost the attacker nothing.
--
-- The counter lives in Postgres rather than in Edge Function memory because
-- functions are horizontally scaled and cold-start frequently — in-process
-- counters would reset constantly and disagree between instances.
-- ---------------------------------------------------------------------------

create table if not exists public.request_rate_log (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  action     text not null check (action in (
               'process_receipt',
               'process_bank_statement',
               'process_loan_document'
             )),
  created_at timestamptz not null default now()
);

comment on table public.request_rate_log is
  'Per-user request counter for the document-processing Edge Functions. '
  'Written by the service role only; never readable or writable by a client. '
  'Distinct from ai_usage_log, which meters the weekly AI generation quota.';

-- The only query shape this table serves: "rows for this user and action
-- since T". Descending created_at keeps the window scan at the index head.
create index if not exists request_rate_log_user_action_time_idx
  on public.request_rate_log (user_id, action, created_at desc);

alter table public.request_rate_log enable row level security;

-- No policies, deliberately. RLS with zero policies denies every client role
-- outright. The Edge Functions reach this table with the service role, which
-- bypasses RLS, so a user can neither read their own counter nor forge or
-- delete entries to reset it. Anything a client legitimately needs to know
-- arrives as the 429 response itself.
revoke all on public.request_rate_log from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Retention. Nothing reads rows older than the widest window (24h), so they
-- are pure growth. This is invoked opportunistically by the Edge Functions
-- rather than scheduled, so the table needs no pg_cron dependency.
-- ---------------------------------------------------------------------------
create or replace function public.prune_request_rate_log()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.request_rate_log
   where created_at < now() - interval '2 days';
$$;

revoke execute on function public.prune_request_rate_log() from public, anon, authenticated;
