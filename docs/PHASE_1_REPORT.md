# Phase 1 completion report — Monetiq Supabase backend

Supabase project `qljpfonukbzhefuqvpuo` (region ap-northeast-2, Postgres 17.6).
Branch `claude/github-supabase-checklist-0j0uu8`.

## 0. Repository inspection (done first)

The repository contained **only** a one-line `README.md` — no prior Next.js
scaffold, no `package.json`, no `supabase/` directory, no tests. The Supabase
project was **empty**: zero tables in `public`, zero migrations, zero Edge
Functions, zero storage buckets.

No "Montieq" or "Moniteq" spelling existed anywhere, so there was nothing to
rename. Everything below was built from scratch; nothing was destroyed.

---

## 1. Completed

**Repo skeleton** — Next.js 14 + React 18 + TypeScript, npm, Zod, Vitest.
No Express, Prisma, GraphQL, or separate API server.

**Schema** — 27 tables across 13 ordered migrations, all applied to the live
project and reproducible from empty by running them in order. Every table has
a primary key, explicit types, defaults, foreign keys, CHECK constraints on
every enum-like column, unique constraints where the domain requires them, and
indexes on the real query paths.

**RLS** — enabled on all 27 tables plus `storage.objects`. Policies are
written per verb (SELECT/INSERT/UPDATE/DELETE separately), never as a blanket
`FOR ALL` on user data.

**Storage** — three private staging buckets with per-user folder isolation and
MIME/size limits. No permanent document bucket exists.

**Edge Functions** — six deployed, all with `verify_jwt = true`, Zod-validated
input, caller authentication, role checks where relevant, and error responses
that never leak internals.

**Auth** — email/password verified working end to end. Three SSR client
configurations (browser / server / middleware) plus a middleware
protected-route contract for Phase 2 to build on.

**Validation** — Zod schemas for every mutating path, backed by database
constraints rather than trusting the client.

---

## 2. Verified — with actual results

Two suites were executed against the live project.

### Backend suite: 374 assertions across 45 suites, 374 passed, 0 failed

RLS was exercised as the real `anon` and `authenticated` PostgREST roles with a
`request.jwt.claims` payload, not as the migration superuser. Auth, Storage and
Edge Functions were driven over their real HTTP APIs.

| Area | Result |
| --- | --- |
| RLS matrix, 12 user-owned tables | 120/120 — SELECT/INSERT/UPDATE × anon, owner, non-owner, admin |
| Child tables (chat messages, statement rows, ticket messages) | pass — ownership resolved through the parent row |
| `profiles` privileged columns | pass — see below |
| Admin-only tables | pass — regular users denied on every verb |
| `admin_audit_log` append-only | pass — even a super admin gets 42501 on INSERT, 0 rows on UPDATE/DELETE |
| Constraints | 13/13 |
| Shared AI quota | 10/10 |
| Auth | 14/14 |
| Storage (3 buckets) | 27/27 + 3 bucket-config checks |
| Edge Functions | 52/52 |

**Privilege escalation, tested specifically.** A user updating their own
`profiles` row: `full_name` succeeds (`OK:1`); `role`, `is_blocked` and
`deleted_at` each raise `42501`. Also verified over the real PostgREST API with
a genuine user JWT — `PATCH /rest/v1/profiles?id=eq.<self>` with
`{"role":"super_admin"}` returns error code `42501`. RLS cannot express
column-level rules, so a `BEFORE UPDATE` trigger is what actually enforces this.

**AI key secrecy, 15/15.** A canary key was stored through the
`manage-ai-key` Edge Function, then:
- a regular user calling `admin_get_ai_provider_key` → `42501`
- **a super admin calling it → `42501`** (only `service_role` may)
- user and admin reading `vault.secrets` / `vault.decrypted_secrets` → `42501`
- the admin-visible `ai_provider_config` row contains no plaintext key
- the Vault row genuinely held the canary (confirmed as superuser)
- `ai-chat` then reached the provider using that key and failed upstream with a
  generic `provider_error` — the response contained neither the key nor a stack
  trace
- the canary was deleted afterwards; `vault.secrets` count for it is 0

**Shared AI quota, the rule most easily got wrong.** Seeded user 2 with two
successes from **two different features** (`chatbot` + `loan_closure_suggestion`).
A third AI action from a **third** code path (`ai-loan-suggestion`) returned
`429 quota_exhausted`. Meanwhile user 1, with quota remaining and no provider
configured, returned `503 provider_not_configured`. That contrast is the proof
that the quota is checked **before** any provider call — if the order were
reversed both would have returned 503. Failed calls and previous-week successes
do not consume quota.

**Privacy rule, verified end to end.** For each of `process-receipt`,
`process-loan-document` and `process-bank-statement`: a file was uploaded to
staging, the function was invoked, and a subsequent GET of that object returned
`400`. The staged file is deleted inside the function's own `finally` block.

**Bank statement isolation, verified with real data.** A 6-row HDFC-format CSV
was parsed (quoted-comma field and `DD/MM/YYYY` dates handled correctly):
income ₹85,000, expense ₹17,178.50, transactions and analysis persisted, upload
marked `completed`. A follow-up query confirmed **0 rows** matching any of those
merchants in `expense_ledger`. A PDF upload was refused with
`422 pdf_not_supported` and the upload marked `failed` — not silently faked.

**Storage isolation.** Cross-user upload and anonymous upload both returned
`AccessDenied — new row violates row-level security policy`, and
`storage.objects` count was 0 afterwards, so nothing was written. A super admin
reading another user's staged file was denied (no blanket-read policy by design).

### Vitest suite: 65 tests, 65 passed

INR lakh grouping (`formatINR(124560) === '₹1,24,560'`), EMI maths against the
closed-form formula, amortisation converging to a zero balance, the IST week
boundary, shared-quota logic including an explicit per-feature regression
guard, live budget aggregation, and every Zod schema.

**Two genuine failures were found and fixed, not adjusted away:**

1. `positiveAmount` used `Number.isInteger(Math.round(n * 100))` to reject more
   than two decimal places. `Math.round` always returns an integer, so the
   refinement could never fail — `10.999` was being accepted. Fixed to compare
   the scaled value against its own rounding with an epsilon.
2. My EMI expectation was arithmetically wrong (`10746.51`); the implementation
   was correct at `₹10,746.95`. The test was corrected, not the code.

`npx tsc --noEmit` passes clean. `npx next build` succeeds.

---

## 3. Security review (Section 15)

| Check | Result |
| --- | --- |
| Hardcoded secrets in the repo | None. Regex scan over tracked files for JWTs, `sk-*` keys, private-key headers and AWS ids found nothing. |
| `.env` ignored | Yes — `.env.*` ignored with `!.env.example` re-included. `.env.example` holds empty placeholders only. |
| Service-role key in the client bundle | **Not present.** Built with a canary value in `SUPABASE_SERVICE_ROLE_KEY`; 0 matches anywhere under `.next`, including `.next/static`. No client chunk references the variable. |
| AI provider keys reachable from a client | No — Vault only, `service_role`-only EXECUTE, verified by test including against a super admin. |
| Every RLS policy reviewed against Section 6 intent | Yes — see the deviations in §4. |
| Storage policies reviewed against Section 9 | Yes — private buckets, per-user prefix, no admin blanket read. |
| Edge Functions authenticate and authorize | Yes — all six call `requireUser`; `manage-ai-key` additionally calls `requireSuperAdmin`; the three file processors re-check path ownership because the service role bypasses RLS. |
| `profiles.role` / `is_blocked` self-update | Blocked, tested at both the SQL and PostgREST layers. |
| Errors leak internals | No — `errorResponse()` maps unknown throwables to a generic message; upstream provider bodies are logged server-side only. |
| Supabase security advisors | No ERROR-level findings. Remaining WARNs are explained below. |

**Caveat on the bundle check.** The service-role canary result is meaningful —
nothing client-reachable imports it. But the anon key also produced 0 matches,
because Phase 1's placeholder page imports no Supabase client code at all.
**Phase 2 must re-run this check** once real screens exist.

**Remaining advisor warnings, and why they stand:**

- `is_super_admin` / `is_account_active` executable by `authenticated` —
  required: RLS policy expressions are evaluated as the querying role.
- `admin_analytics_overview` / `admin_ocr_dashboard` / `admin_ai_dashboard`
  executable by `authenticated` — intentional. Each is `SECURITY DEFINER` and
  raises `42501` unless `is_super_admin()`; the function is the boundary. All
  three were tested denied for a regular user.
- **Leaked-password protection is disabled.** Real and actionable, but it is an
  Auth dashboard setting with no MCP surface. Recommend enabling
  (HaveIBeenPwned check) before launch.

**Hardening applied during the build.** The first advisor run showed trigger
functions callable as PostgREST RPCs and `revoke ... from anon` having no
effect. The cause: Postgres grants EXECUTE to `PUBLIC` on every new function,
and `anon` inherits it, so revoking from `anon` alone does nothing. Migration
0013 revokes from `PUBLIC` first, then re-grants only to the roles that need
each function.

---

## 4. Open issues and flags

### Requires product decision

**1. Admin permission model conflict (Section 3).** The PRD states a flat
two-role model; the prototype ships a granular "Roles & permissions" screen.
**The backend enforces the flat model only.** Any `super_admin` can do anything
any other `super_admin` can. `role_permissions` stores the five toggles the
prototype shows, seeded and readable, but **no policy or authorization check
reads it** — flipping a toggle changes nothing. This needs resolution before
Phase 3. If granular permissions are real, the RLS layer must be redesigned;
it is not a UI-only change.

**2. "Delete Users" is a soft delete (Section 6.13).** The PRD does not say
which was meant. Implemented as `deleted_at`, excluded from standard queries,
because hard-deleting a user with financial records has data-integrity and
compliance consequences that cannot be undone. `is_blocked` handles
block/unblock separately and unambiguously. **Confirm this is what "Delete"
should mean.**

**3. Google Sign-In is NOT enabled.** `/auth/v1/authorize?provider=google`
returns `validation_failed: provider is not enabled`. The client config is
written in `supabase/config.toml`, but enabling the provider requires a
dashboard action with a Google OAuth client id and secret. **This is a real
gap in PRD 6.1 that I could not close from here.**

**4. Email verification and password reset are not verified end to end.** The
endpoints work and reject correctly. Delivery could not be tested: the dev
accounts use a `.test` domain that Supabase's address validator rejects for
outbound mail, and the project has no custom SMTP (the built-in sender returned
`over_email_send_rate_limit`). **Configure custom SMTP and re-test before
launch.**

### PROTOTYPE-ONLY — built, but absent from PRD text

All of these need explicit product sign-off. PRD 6.12 lists only Total Users /
Active Users / OCR Usage / AI Usage for Super Admin analytics and is silent on
the rest.

- **Roles & permissions** (`role_permissions`) — inert, see above.
- **Audit logs** (`admin_audit_log`) — append-only, written by triggers on
  block/unblock, role change, content publish, ticket close, and AI key changes.
- **AI Management dashboard** — built on `ai_usage_log` via
  `admin_ai_dashboard()`, including per-provider cost tracking.
- **OCR Management dashboard** — built on `ocr_scan_log` via
  `admin_ocr_dashboard()`.
- **System Monitoring** (`system_service_status`) — **data shape only.** No
  monitoring integration exists because none is specified anywhere. There is no
  polling job and no cron. Rows are edited by hand. Populating this with real
  data is an unscoped, unconfirmed requirement.
- **Data & Privacy request queue** (`data_privacy_requests`) — table and RLS
  only. No requirement describes what "export" or "delete" actually produces,
  so nothing is wired behind the status field. Per Section 6 this is
  admin-only, which means **users currently have no way to raise their own
  request** — likely wrong for a privacy feature, and worth confirming.
- **System Alerts** (`system_alerts`) — separate table from
  `alert_notifications`, deliberately not conflated.

### Deliberate deviations from the letter of the spec

Section 6 says owners get full CRUD on user-owned tables. Four cases narrow
that, because following it literally would break an invariant:

- **`ai_usage_log`** — owner SELECT only. If a user could delete their own log
  rows they could reset their own weekly AI quota. Writes are service-role only.
- **`ocr_scan_log`** — same reasoning; it is also the sole record of failed
  scans for the admin dashboard.
- **`alert_notifications`** — owner may read, mark read and dismiss, but not
  INSERT. A fired alert is a system statement about the user's data.
- **`bank_statement_transactions` / `_analysis_results`** — owner SELECT and
  DELETE; writes are service-role only. This is extracted data, never typed in.
  `bank_statement_uploads.status` is likewise not client-updatable, so a user
  cannot mark a failed analysis "completed".

Two more judgement calls:

- **Blocked accounts are barred from writes, not reads.** `is_account_active()`
  appears in INSERT/UPDATE/DELETE policies on user data, not SELECT. Reads stay
  ownership-only. Session revocation is an auth-layer concern.
- **`user_terms_acceptance.accepted_version`** was added. `content_pages.slug`
  is unique (as specified), so a page is edited in place and its version bumped
  — without capturing the version at acceptance time, "which text did this user
  agree to" becomes unanswerable after the next edit.
- **`feature_flags`** carries the only `USING (true)` policy in the schema,
  for authenticated users. A flag is non-sensitive UI configuration every
  signed-in client must read. Documented in a policy comment.

### Extraction providers are stubs

No OCR or document-extraction credential exists. `process-receipt` and
`process-loan-document` return `extraction_source: "stub"`,
`requires_manual_review: true`, and null fields, with a notice telling the user
to enter details manually. **They do not fabricate plausible-looking values.**
A non-stub `OCR_PROVIDER` raises `503 ocr_provider_not_implemented` rather than
silently falling back.

`process-bank-statement` parses CSV **for real**. PDF returns
`422 pdf_not_supported` with a clear message.

---

## 5. Migrations

| File | What it does |
| --- | --- |
| `20260821000100_extensions_and_helpers.sql` | pgcrypto; `set_updated_at()` trigger function |
| `20260821000200_profiles.sql` | `profiles`; `is_super_admin()` / `is_account_active()`; `handle_new_user()` trigger on `auth.users`; privileged-column guard trigger; RLS |
| `20260821000300_core_user_data.sql` | `income_sources`, `categories` (+20 seeded), `expense_ledger`, `budgets`; `budget_progress()`; RLS |
| `20260821000400_bank_statements.sql` | `bank_statement_uploads` / `_transactions` / `_analysis_results`; RLS. No raw-file column |
| `20260821000500_debts.sql` | `debts` with the v1 `loan_type` CHECK; RLS |
| `20260821000600_alerts_and_push.sql` | `alert_settings`, `alert_notifications`, `push_subscriptions`; RLS |
| `20260821000700_ai.sql` | `ai_usage_log`, `ai_week_start()`, `ai_quota_status()`, chat tables, `ai_provider_config`; RLS |
| `20260821000800_ocr_and_help_desk.sql` | `ocr_scan_log`, `help_desk_tickets`, `help_desk_messages`; RLS |
| `20260821000900_content_and_flags.sql` | `content_pages` (5 seeded), `user_terms_acceptance`, `feature_flags`; RLS |
| `20260821001000_admin_tables.sql` | `role_permissions` (5 seeded), `admin_audit_log`, `system_service_status` (6 seeded), `data_privacy_requests`, `system_alerts`; RLS |
| `20260821001100_admin_functions_and_audit.sql` | Admin analytics functions; audit triggers; Vault key accessors |
| `20260821001200_storage_buckets.sql` | Three private staging buckets + per-user policies |
| `20260821001300_function_privilege_hardening.sql` | `search_path` pinning; REVOKE from `PUBLIC`, re-grant narrowly |

---

## 6. Supabase summary

**Tables (27).** `profiles` is the hub — nearly every user-owned table has
`user_id → profiles(id) ON DELETE CASCADE`. `expense_ledger` and `budgets`
reference `categories`. The three bank-statement tables chain from
`bank_statement_uploads` and connect to the rest of the schema **only** through
`user_id` on that parent — there is no path from statement data into the ledger.

**RLS at a glance.**

| Group | Policy shape |
| --- | --- |
| User-owned (`income_sources`, `expense_ledger`, `budgets`, `debts`, `alert_settings`, `push_subscriptions`, `ai_chat_conversations`) | owner full CRUD; writes also require `is_account_active()`; no admin access |
| Integrity-restricted (`ai_usage_log`, `ocr_scan_log`) | owner SELECT; admin SELECT; writes service-role only |
| Derived (`bank_statement_*`, `ai_chat_messages`) | owner SELECT/DELETE via parent; writes service-role only |
| `profiles` | own SELECT/UPDATE + admin SELECT/UPDATE; no INSERT (trigger) or DELETE (soft delete); trigger guards `role`/`is_blocked`/`deleted_at` |
| `categories` | everyone reads predefined + own; users write only their own custom rows |
| `help_desk_tickets` / `_messages` | owner + admin; message INSERT requires `sender_id = auth.uid()` |
| `content_pages` | published readable by any authenticated user; drafts and all writes admin-only |
| Admin-only (`role_permissions`, `system_service_status`, `data_privacy_requests`, `system_alerts`, `ai_provider_config`) | `is_super_admin()` for all verbs; no user policy at all |
| `admin_audit_log` | admin SELECT only; no write policy exists for any client role |
| `feature_flags` | readable by authenticated; writes admin-only |

**Storage.** `receipts-staging` (10 MB; jpeg/png/webp/heic/pdf),
`bank-statements-staging` (20 MB; pdf/csv/xls), `loan-documents-staging`
(20 MB; images/pdf). All private. Object key must be `<auth.uid()>/<filename>`.
No admin blanket read.

**Edge Functions.**

| Function | Contract |
| --- | --- |
| `process-receipt` | `{path}` → extracted fields for review. Deletes staged file; logs to `ocr_scan_log`. Never writes the ledger. |
| `process-bank-statement` | `{upload_id, path}` → totals + category breakdown. Writes transactions/results, updates status, deletes staged file. |
| `process-loan-document` | `{path}` → debt fields for review. Deletes staged file. |
| `ai-chat` | `{message, conversation_id?}` → `{answer, ai_disclosure, quota_remaining}`. Quota checked first. |
| `ai-loan-suggestion` | `{debt_id?, question?}` → `{suggestion, ai_disclosure, quota_remaining}`. Same quota. |
| `manage-ai-key` | super-admin only; `upsert_provider` / `set_key` / `delete_key` / `set_active` / `set_limits`. Never returns key material. |

Errors are always `{error: {code, message}}`. Codes in use: `unauthenticated`,
`forbidden`, `account_blocked`, `invalid_input`, `not_found`, `file_not_found`,
`quota_exhausted`, `provider_not_configured`, `provider_error`,
`provider_unavailable`, `pdf_not_supported`, `unparsable_statement`, `no_debts`,
`no_key`, `persist_failed`, `internal_error`.

**Auth providers.** Email/password enabled and verified. Google configured in
`config.toml` but **not enabled on the project** — see §4.

---

## 7. Test accounts — DEVELOPMENT ONLY

Rotate or delete before any real deployment.

| Email | Password | Role |
| --- | --- | --- |
| `dev.user@monetiq.test` | `MonetiqDevUser!2026` | `user` |
| `dev.user2@monetiq.test` | `MonetiqDevUser2!2026` | `user` (second user, proves non-owner denial) |
| `dev.admin@monetiq.test` | `MonetiqDevAdmin!2026` | `super_admin` |

Created by `supabase/seed/dev_test_accounts.sql`. Written directly into
`auth.users` with pgcrypto bcrypt hashes because no Auth Admin API credential
was available here; sign-in works normally and was verified.

---

## 8. Environment variables

Names only — see `.env.example`.

`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY` (server-only), `NEXT_PUBLIC_SITE_URL`.

AI provider keys are deliberately **not** environment variables — they live in
Supabase Vault, managed through `manage-ai-key`.

---

## 9. Completion checklist

- [x] Repository inspected before writing anything; findings reported
- [x] Brand spelling checked (no "Montieq"/"Moniteq" existed)
- [x] Existing Supabase config, migrations, tables, policies, buckets, functions inspected
- [x] Next.js + React + TypeScript + Supabase, npm, Zod — no Express/Prisma/GraphQL
- [x] Expense Ledger as single source of truth, two write paths only
- [x] Bank Statement Analysis structurally separate and read-only — verified with real data
- [x] Budget/Analytics/Alerts read the ledger only, excluded at query level
- [x] Raw documents deleted immediately after extraction — verified for all three buckets
- [x] AI quota is one shared counter across all features — verified
- [x] Flat role model enforced in RLS; `role_permissions` built but inert
- [x] All Section 5 tables modelled with PK, types, defaults, FKs, uniques, indexes, timestamps
- [x] Schema reproducible from empty via ordered migrations
- [x] RLS enabled and per-verb on every table
- [x] RLS tested: unauthenticated / owner / non-owner / admin / wrong-role, per verb
- [x] `profiles.role` and `is_blocked` not self-updatable — tested at SQL and API layers
- [x] Storage buckets private with per-user folder policies; cross-user access denied
- [x] No admin blanket-read on staging buckets — tested
- [x] Six Edge Functions, Zod-validated, authenticated, authorized, safe errors
- [x] Each Edge Function has a passing success case and failure case
- [x] AI quota enforced before any provider call — proven by 429-vs-503 contrast
- [x] Zod on every mutating path; invariants also enforced by DB constraints
- [x] Constraint tests: amount > 0, loan_type scope, uniques, FKs, enums
- [x] Email/password auth, session persistence, refresh, logout — verified
- [x] Three SSR client configurations + middleware protected-route contract
- [x] `.env.example` created; `.gitignore` covers env/build/deps
- [x] No secrets in tracked files; service-role key absent from the client bundle
- [x] Vitest suite written **and executed** — 65/65, two real bugs found and fixed
- [x] Supabase security advisors run; no ERROR-level findings
- [x] Dev test accounts created and documented
- [ ] **Google Sign-In enabled** — configured but NOT enabled on the project
- [ ] **Email verification / password reset delivery** — endpoints verified, delivery not testable (no SMTP, `.test` domain)
- [ ] **Real OCR extraction** — stub only, no provider credential
- [ ] **Real loan-document extraction** — stub only
- [ ] **PDF bank statements** — refused with a clear error; needs a PDF text provider
- [ ] **Leaked-password protection** — recommend enabling in the Auth dashboard

The unchecked items are unchecked because they could not be verified or
completed in this environment, not because they were skipped.

---

## 10. Phase 2 handoff

You need this document, `supabase/tests/README.md`, and the migrations. You do
not need the conversation that produced them.

**Where things are.** Schema in `supabase/migrations/` (apply in filename
order). Generated types in `src/lib/supabase/types.ts` — regenerate with
`npx supabase gen types typescript --project-id qljpfonukbzhefuqvpuo`.

**Use the right client.** `src/lib/supabase/client.ts` in Client Components,
`server.ts` in Server Components / Route Handlers / Server Actions,
`middleware.ts` for session refresh. They are not interchangeable. Both use the
anon key, so every query is subject to RLS on the user's behalf.

**Routing contract already in place.** `src/middleware.ts` redirects
unauthenticated requests to `/login?redirectedFrom=…` and authenticated
requests on auth routes to `/dashboard`. `PUBLIC_ROUTES` and `isAuthRoute()`
are exported from `src/lib/supabase/middleware.ts` — extend those rather than
duplicating the logic.

**Ordinary CRUD goes through the Supabase client directly**, protected by RLS.
Do not add API routes for it. Only the six Edge Functions need invoking, and
only for the operations listed in §6.

**Things that will bite you if you assume otherwise:**

- `budget_progress(p_month)` computes spend live. Do not cache or persist it.
- Reading the AI quota: `ai_quota_status()` returns `used / weekly_limit /
  remaining / week_start`. The week starts Monday 00:00 **IST**.
- `ai_chat_messages` has no client INSERT policy. Send the message to `ai-chat`;
  it persists both turns.
- `bank_statement_uploads.status` is not client-updatable. Insert the row with
  `status = 'processing'`, then call the function.
- Staged uploads must be keyed `<user_id>/<filename>` or both the storage policy
  and the Edge Function will reject them.
- Every AI response carries `ai_disclosure`; the bank statement report carries
  `ai_disclaimer`. Both must be shown.
- `feature_flags.financial_health_score` is `false`. PRD 6.10 is deferred —
  render "Coming Soon" and build no scoring UI.
- Voice: calm, competent advisor. Not a coach, not a cheerleader.
- Currency is INR with lakh grouping — use `formatINR()` from
  `src/lib/finance.ts`, never `toLocaleString()` with a default locale.

**Before Phase 2 ships:** resolve the two product decisions in §4, enable
Google Sign-In, configure SMTP, and re-run the client-bundle secret check once
real screens import the Supabase client.
