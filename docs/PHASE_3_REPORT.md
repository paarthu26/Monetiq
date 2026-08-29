# Monetiq — Phase 3 Completion Report

**Scope.** Replace the Phase 2 mock data layer with live Supabase, end to end,
and prove the system works against the real project.

**Project:** `qljpfonukbzhefuqvpuo` (Monetiq, ap-northeast-2, `ACTIVE_HEALTHY`)
**Branch:** `claude/github-supabase-checklist-0j0uu8`

---

## 0. The environment constraint — read this first

This session ran in a sandbox whose network policy **denies outbound HTTPS to
the Supabase project**:

```
connect_rejected  api.supabase.com:443
connect_rejected  qljpfonukbzhefuqvpuo.supabase.co:443
connect_rejected  db.qljpfonukbzhefuqvpuo.supabase.co:443
```

Database access was available only through the Supabase MCP connection. That
splits Phase 3's verification cleanly in two, and this report is explicit about
which side every result sits on:

| | Status |
|---|---|
| Integration code, migrations, schema, RLS, SQL-level behaviour | **Executed live against the real project** |
| Anything requiring an HTTPS client or a browser — the app itself, Playwright, the JS-client INT suite | **Written, not executed.** Marked ✗ below, never inferred |

Phase 2's E2E suite ran against a local GoTrue stub. **That stub is deleted**
and `playwright.config.ts` now points at the real project — but the suite could
not be run here. Nothing in this report claims otherwise.

---

## 1. Section 0 — the four discrepancies

**1. Edge Function names — Phase 1's names are authoritative, confirmed live.**
`npx supabase functions list` was unavailable, so the deployment was read
directly. Six ACTIVE functions:

`process-receipt` · `process-loan-document` · `ai-chat` · **`ai-loan-suggestion`**
· `manage-ai-key` · **`process-bank-statement`**

The Phase 2 handoff table said `loan-suggestion` and `process-statement`. Both
were wrong; the mapping is corrected in `src/lib/api/index.ts` and nothing was
renamed.

**2. Route/a11y count — the gap was larger than the prompt guessed.** The sweep
covered 33 routes; there are 40 `page.tsx` files. Seven were never scanned: all
five dynamic `[id]` routes, plus `/profile`, plus `/` (a redirect). Phase 2's
report said "all 33 reachable routes", which was true of what ran and wrong to
imply completeness. `e2e/a11y.spec.ts` now includes `/profile` and resolves each
dynamic route by following a link from its list screen, so the scan sees a real
populated record. When no record exists it records `NOT SCANNED` rather than
reporting a clean pass.

**3. `last_active_at` — the premise was incorrect, and the real gap was worse.**
The column already existed (`20260821000200_profiles.sql:22`), with an index
(line 29), already read by `admin_analytics_overview`. No new column was needed.

What *was* wrong: nothing wrote it, **and it was absent from
`guard_profile_privileged_columns`**, so any user could `PATCH` their own row and
forge the number the "Active Users" metric is built from. Migration 0014 guards
it and adds a definer `touch_last_active()` as the only way to move it.
Verified live:

| Check | Result |
|---|---|
| Forging `last_active_at` as your own user | **denied** — `last_active_at is maintained by touch_last_active()` |
| `touch_last_active()` moves it | **yes** — `2026-08-21 15:55:28 → 2026-08-23 16:31:04` |
| It writes `now()`, not an attacker value | **yes** |

**4. Pagination was already page-shaped.** The mock returned only the requested
page plus a server-side `total`; neither `Table` nor `Pagination` sliced. So
`.range()` + `{count:'exact'}` mapped straight on with no component change.

---

## 2. Completed

### Data layer — `src/lib/mock/` → `src/lib/api/`
| File | Role |
|---|---|
| `errors.ts` | The Phase 2 contract verbatim, plus live mapping (`mapPostgrestError`, `mapEdgeFunctionError`, `mapStorageError`, `toApiError`) |
| `session.ts` | Cached user id, role and `is_blocked` — the last of which is the only thing that can tell `account_blocked` from `forbidden` |
| `core.ts` | `read`/`write` funnels so no path can forget to map; Edge Function invoke that preserves the `{error:{code,message}}` envelope |
| `index.ts` | The full surface, ~1,285 lines, every signature unchanged |

**Server-side querying.** The ledger filters (`ilike`/`eq`/`gte`/`lte`), orders
and paginates (`range` + `count: 'exact'`) in PostgREST, with `id` as a
tiebreaker so rows sharing a date cannot reshuffle between pages. Admin user and
audit lists do the same. Analytics moved off the client entirely onto two new
RPCs.

**Error mapping** implements the Section 2.3 table. The `account_blocked` /
`forbidden` split is the interesting one: Postgres reports both as `42501`,
so the session's own `is_blocked` is read first and used to disambiguate.

**Storage** keys every object `<auth.uid()>/<timestamp>-<filename>`. The staged
file is left for the Edge Function's own `finally` block — no client-side
cleanup that could race it.

**Sequencing rules (2.5)** are all respected: statement rows insert as
`processing` and only the function advances them; the client never inserts into
`ai_chat_messages`; nothing writes `ai_usage_log`, `ocr_scan_log` or
`admin_audit_log`; quota is checked before any provider call; soft-deleted users
are excluded unless explicitly requested.

### Migration 0014 — `20260823001400_phase3_activity_and_analytics.sql`
- `last_active_at` guarded; `touch_last_active()` added.
- `analytics_category_rollup` and `analytics_monthly_rollup`, both
  `SECURITY INVOKER` so RLS scopes them.
- `pg_trgm` plus trigram indexes on `expense_ledger.merchant` and the profiles
  search expression — justified by the two real ILIKE query paths, not added
  speculatively.

### The mock layer is gone
`src/lib/mock/` no longer exists. Its contents moved to `tests/` as an explicit
test double (`tests/fake-api.ts`, `tests/fixtures.ts`, `tests/mock-controls.ts`)
so Phase 2's 48 screen assertions still exercise real screens with no network.
The `sessionStorage` persistence and the `?mock=` URL control plane were deleted
outright — shipping a backdoor that lets the client fake its own role or force
failures would be a liability, and the E2E suite now breaks the backend at the
network layer instead, which is closer to the real failure anyway.

---

## 3. Verified — what actually ran

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **clean** |
| Lint | `npx next lint --max-warnings=0` | **clean** |
| Build | `npx next build` | **succeeds**, 40 routes |
| Unit / component / screen | `npx vitest run` | **149 passed / 149** |
| RLS matrix, live | `supabase/tests/50_rls_client_matrix.sql` | **34 checks, 34 passed** |
| INT subset, live | `supabase/tests/60_int_data_layer.sql` | **15 checks, 15 passed** |
| Bundle canary | `scripts/check-bundle-secrets.sh` | **PASS — 0 matches** |
| Supabase security advisors | live | 1 new finding, **found and fixed**; 7 pre-existing, all accounted for |
| INT suite over HTTPS | `npm run test:int` | ✗ **could not run** — 23 tests fail with `auth health check returned 403` |
| Playwright (E2E-01…23, a11y) | `npx playwright test` | ✗ **could not run** — no network |

**Phase 2's 149 assertions pass unchanged.** One test was rewritten, and that is
a finding, not a formality — see §4.

### RLS — 34 checks, executed as real PostgREST callers
Run by setting `request.jwt.claims` and `role` exactly as PostgREST does, so
these are the same policies the browser hits.

| ID | Check | Result |
|---|---|---|
| RLS-01 | B reads A's ledger | 0 rows |
| RLS-02 | B writes to A's ledger | `42501` |
| RLS-03a–e | B reads A's debts / tickets / budgets / statements / chat | 0 rows each |
| RLS-04a–e | User reads five admin-only tables | 0 rows each |
| RLS-05a–b | User calls `admin_analytics_overview`, `admin_get_ai_provider_key` | `42501` |
| RLS-06 | User promotes self to `super_admin` | `42501` |
| RLS-07a–c | User edits own `is_blocked` / `deleted_at` / `last_active_at` | `42501` |
| RLS-08a–c | **Blocked** user reads own ledger, profile, statements | succeeds |
| RLS-09a–c | Blocked user inserts expense / raises ticket / edits expense | `42501`, `42501`, 0 changed |
| RLS-10 | User deletes own `ai_usage_log` to reset quota | 1 row before, 1 after |
| RLS-11 | User inserts own `alert_notifications` | `42501` |
| RLS-12 | User sets own statement `status` to `completed` | stays `processing` |
| RLS-13a–c | Super admin reads another user's ledger / statements; reads profiles | 0, 0, 3 |
| RLS-14a–e | Anon reads four tables; calls `is_super_admin` | 0 rows each; `42501` |

**Two of these initially passed vacuously and were re-run.** RLS-10 and RLS-12
first reported success against zero matching rows — an `UPDATE` or `DELETE` that
matches nothing raises nothing and changes nothing, which is indistinguishable
from a policy denial. Both were re-run after seeding real rows. The committed
SQL file seeds them for exactly this reason, and says so.

RLS-12 also surfaced *why* it holds: `bank_statement_uploads` has **no UPDATE
policy at all**. The write is inert by absence, which is the intended design.

**RLS-15 (inspect network responses on an admin route as a non-admin)** could
not run — it needs a browser. RLS-04, RLS-05 and RLS-13 establish the same
property one layer down: there is no admin data for a response to contain.

### INT — 15 checks, executed live
| ID | Check | Evidence |
|---|---|---|
| INT-06 | `budget_progress` matches the ledger | `rpc=500.00 ledger=500.00` |
| INT-07 | Progress is never persisted | 0 snapshot columns on `budgets` |
| INT-08 | Analytics rollup equals the caller's ledger | `rollup=510.00 ledger=510.00` |
| INT-10 | No statement description exists as an expense | 0 collisions |
| INT-11 | **Statements contribute nothing to analytics** | rollup `510.00` = ledger `510.00`, while statements hold **`103378.50`** |
| INT-16 | Quota is internally consistent | `used + remaining = weekly_limit` |
| INT-20 | Client cannot insert `ai_chat_messages` | `42501` |
| INT-21 | Ticket reply cannot claim another sender | `42501` |
| INT-25 / 25b | Neither user **nor admin** may write `admin_audit_log` | `42501` both |
| INT-26a/b | No key column; even an admin cannot read a key | 0 columns; `42501` |
| INT-27 | Soft-deleted users excluded | 0 deleted / 3 active |
| INT-29a/b | Every ledger and category id is a UUID | 0 malformed |

INT-11 is the strongest single result in this report: the statement tables hold
₹1,03,378.50 and the analytics rollup returns ₹510 — exactly the ledger, to the
paisa. The separation is a property of the query, not of the fixtures.

**Not executed (need an HTTPS client):** INT-01…05, INT-12…15, INT-17…19,
INT-22…24, INT-28. All are written in
`tests/integration/data-layer.int.test.ts` and fail loudly with the real reason
rather than skipping quietly.

---

## 4. Real defects found and fixed

Six, none discovered by reading — all by something failing.

1. **`last_active_at` was forgeable by its own owner.** Latent since Phase 1;
   the metric it feeds was untrustworthy. Guarded, and the guard is tested.

2. **All typed inserts and updates were silently broken.**
   `src/lib/supabase/types.ts` was hand-written in Phase 1 with
   `Views`/`Enums`/`CompositeTypes` as `Record<string, never>` instead of
   `{ [_ in never]: never }`. That collapses every table's relation to `never`,
   so `insert()` resolved to `never[]`. Reads happened to work, and Phase 2
   never issued a typed write — so nothing caught it for two phases. Replaced
   with generator output from the live schema.

3. **`@supabase/ssr@0.5.2` predates the generic mechanism `supabase-js@2.112`
   uses**, so schema inference failed regardless of the types file. Upgraded to
   `0.12.4`. Both this and (2) had to be fixed before a single typed query
   would compile.

4. **My own integration drifted from the contract twice, and the screens were
   right both times.** `processReceipt` returns `{ data, notice }` — which is
   what the Edge Function actually returns and what the review screen was built
   against; I had written `{ extraction, notice }`. And every Edge Function
   wraps its payload in `{ data: … }`, with `ai-chat` naming the reply `answer`,
   not `reply`. Both fixed in the integration, per the brief's rule.

5. **`touch_last_active` and both analytics RPCs were callable by `anon`.**
   Caught by the database linter. `revoke ... from public` does not remove
   Supabase's default privileges, which grant EXECUTE **directly** to `anon`.
   Phase 1's migration 0013 knew this; my 0014 did not. Fixed with an explicit
   `revoke ... from public, anon`, and the migration now explains the trap.

6. **ST-28's key-material guard was a proxy that no longer held.** It banned the
   string `api_key:` outright, which the mock satisfied only because it never
   sent a key anywhere. Against the live layer that flags the *send* path — the
   opposite of a leak. Rewritten to assert what actually has to hold: the Vault
   accessor is never named, `set_key` is the only key-bearing call, and no
   returned object carries key material. This is the one Phase 2 test that
   changed, and it is stricter than before.

---

## 5. Security review

**Bundle canary — PASS.**
```
canary: MONETIQ_CANARY_1787509094_do_not_ship_this_value
.next: 0    .next/static: 0
SUPABASE_SERVICE_ROLE_KEY: 0    service_role: 0    JWT header: 0
/sk-[A-Za-z0-9_-]{20,}/: 0    /sk-ant-…/: 0    /AIza…/: 0
PASS
```

**No fixture data in the bundle.** Probed for eight distinct fixture strings
(`Swiggy`, `BigBasket`, `Landlord — Powai flat`, `dev.user@monetiq.test`,
`Rohan Desai`, `Cricket Club`, `buildDataset`, `fixtureId`) plus `lib/mock`,
`resetMockStore`, `setMockControls`, `__monetiqMock` — **0 files each**.

**Service-role key.** `.env.local` leaves it blank, because no code path in
`src/` reads it: ordinary CRUD goes through the anon key under RLS, and Edge
Functions receive the service role from Supabase directly. The canary proves it
is absent from the client either way.

**Advisors — 8 findings, 1 new.**
- **New, fixed:** the `anon` EXECUTE grant above.
- **6 × `authenticated_security_definer_function_executable`** — by design, and
  each is authorization-checked internally. `is_super_admin` and
  `is_account_active` must be callable by `authenticated` or the RLS policies
  that call them cannot work. The three `admin_*` functions check
  `is_super_admin()` in their own bodies — RLS-05 proves a normal user calling
  them gets `42501`. `touch_last_active` only ever writes `now()` to the
  caller's own row.
- **1 × `auth_leaked_password_protection`** — still disabled. Carried-forward
  Phase 1 issue 7; a dashboard setting, not code.

**Other checks:** no `dangerouslySetInnerHTML` on user content; no
`localStorage`/`sessionStorage` use anywhere in `src/` after the mock layer's
removal; no component imports fixtures or the API directly; every amount goes
through `formatINR()`.

**Rate limiting — documented gap.** Beyond the weekly AI quota (2 per user,
checked before any provider call), **nothing throttles anything.** A user can
call `process-receipt` or `process-bank-statement` as fast as they can upload,
bounded only by bucket size limits. Supabase's platform-level limits are the
only backstop. This wants a decision in Phase 4.

---

## 6. Open issues

### Carried forward — none resolved silently

| # | Item | Status after Phase 3 |
|---|---|---|
| 1 | **Admin permission model** — PRD flat vs prototype granular | **Still open. Product decision.** `role_permissions` remains display-only; nothing reads it, and §4.9's instruction not to wire it into RLS was followed |
| 2 | **"Delete Users" is a soft delete** | **Still needs confirmation.** Implemented as `deleted_at`; verified excluded from listings (INT-27) |
| 3 | Google Sign-In not enabled | **Unverified.** Needs a browser |
| 4 | Email verification / reset delivery untested | **Still untested.** No SMTP; `.test` domain |
| 5 | OCR and loan-document extraction are stubs | **Still stubs.** No provider credential; the review screen fabricates nothing |
| 6 | PDF bank statements unsupported | **Still unsupported** |
| 7 | Leaked-password protection disabled | **Still disabled** — confirmed by advisors this session |
| 8 | Excel report generated client-side | **Still client-side.** See decision below |
| 9 | **No alerts engine** | **Still none.** See decision below |
| 10 | Dev accounts written straight into `auth.users` | **Not recreated.** Needs the Auth Admin API over HTTPS |
| 11 | "Active Users" has no data source | **Resolved.** The column existed; it is now guarded and written by `touch_last_active()`, called once per page load |
| 12 | Privacy requests are admin-only | **Still admin-only.** See decision below |
| 13 | `success.text` darkened for WCAG AA | **Still awaiting design sign-off.** Accessible value kept, per §4.8 |
| 14 | Poppins via render-blocking `@import` | **Resolved.** `next/font/google`; 15 self-hosted `woff2` files, no external request in the rendered head |
| 15 | Mock layer used `sessionStorage` | **Resolved.** Deleted with the mock layer |
| 16 | Missing Zod schemas for ticket reply / chat body | **Resolved.** `chatMessageSchema` added mirroring the function's own 2000-char bound; `ticketReplySchema` existed but **was never wired in** — both are now enforced in the composer and the reply form |
| 17 | `budgetSchema` has no `month` | **Resolved — it was correct.** `budgets` has no month column; a budget is a standing cap and the month is a parameter of `budget_progress(p_month)`. Documented in the schema |

### Decisions recorded this phase

- **Alerts engine — deferred, with the reason.** Overspending and budget-limit
  alerts are implementable as a trigger on `expense_ledger`; EMI reminders need
  a scheduled job. **"Unusual transaction" has no defined rule anywhere in the
  requirements**, and inventing a heuristic for a financial alert is not a call
  to make quietly. Web push additionally needs VAPID keys that do not exist.
  Deferred as a set; the UI keeps saying nothing is delivered yet.
- **Excel report stays client-side** for now. It needs no new backend surface
  and the disclaimer is embedded in both sheets. The caveat stands: the workbook
  is only as trustworthy as the session that made it. Moving it to an Edge
  Function is a Phase 4 call.
- **Privacy requests stay admin-only.** A user-side path needs a table policy
  change and a screen — real scope, and a product decision about what a user may
  request. Recorded, not silently skipped.

### New in Phase 3
18. **No rate limiting beyond the AI quota** (§5).
19. **`tests/fake-api.ts` must stay in step with `src/lib/api/index.ts` by
    hand.** Types catch shape drift; they do not catch behavioural drift. The
    screen suite is only as honest as that file.
20. **Dev credentials are in `e2e/helpers.ts`.** Development accounts for a
    throwaway project, and they must never exist in production.

---

## 7. Files and architecture

```
src/lib/
  api/            ← NEW. errors · session · core · index
  constants.ts    unchanged (AI copy that outlives any data layer)
  supabase/       types.ts REGENERATED from live; clients unchanged
  validation/     + chatMessageSchema, TICKET_BODY_MAX, budget month note
  mock/           ← DELETED
tests/
  fake-api.ts · fixtures.ts · mock-controls.ts   ← moved from src/lib/mock/
  integration/    ← NEW. harness.ts · data-layer.int.test.ts
supabase/
  migrations/20260823001400_phase3_activity_and_analytics.sql   ← NEW
  tests/50_rls_client_matrix.sql · 60_int_data_layer.sql        ← NEW
e2e/
  auth-stub.mjs   ← DELETED
  helpers.ts      rewritten for live auth + network-level fault injection
  e2e-19-23-live.spec.ts   ← NEW
```

**The seam held.** Screens depend on `src/lib/queries/hooks.ts`, which calls
`src/lib/api`. Only the bodies changed. No screen was edited to accommodate the
integration.

---

## 8. Performance notes

- **Ledger:** one page per request (25 rows) with `count: 'exact'`. Backed by
  `expense_ledger_user_date_idx`; the merchant search now uses a GIN trigram
  index rather than a sequential scan.
- **Analytics:** was `pageSize: 1000` of raw rows aggregated in the browser; now
  two RPCs returning one row per category and per month. On a 5,000-row ledger
  that is roughly three orders of magnitude less transferred.
- **Statement detail:** three queries (upload, result, transactions), the last
  two issued in parallel. No N+1 anywhere — checked every list path.
- **Bundle:** heaviest route `/statements` at 319 kB first load, dominated by
  Recharts; SheetJS is loaded on demand at download time. Shared JS 87.6 kB.
- **Not measured:** real latency, payload sizes over the wire, and cold Edge
  Function start. All need the network.

---

## 9. Phase 4 handoff

### Run everything
```bash
npm run typecheck && npm run lint && npm run build
npm test                      # 149 offline assertions
npm run test:int              # INT suite — needs live Supabase
npx playwright test           # E2E-01..23 + 3 a11y sweeps — needs live Supabase
bash scripts/check-bundle-secrets.sh    # must print PASS
psql "$DATABASE_URL" -f supabase/tests/50_rls_client_matrix.sql
psql "$DATABASE_URL" -f supabase/tests/60_int_data_layer.sql
```

`.env.local` needs `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY`. `SUPABASE_SERVICE_ROLE_KEY` may stay blank —
nothing in `src/` reads it.

### The first thing Phase 4 should do
**Run the two suites that could not run here**, in an environment with network
access to `*.supabase.co`. They are written and committed. Everything in §3
marked ✗ is unverified, not assumed-passing — several of those tests have never
executed even once, and first runs find things.

### Invariants that must not regress
- Statement analysis and the expense ledger never mix (INT-10, INT-11, ST-12,
  ST-19, E2E-04).
- AI quota is one shared counter checked **before** the provider call.
- AI provider keys are write-only; even a super admin cannot read one back.
- Budget progress is computed on read, never stored.
- The admin role check in the UI is UX only; RLS is the boundary.
- Blocked accounts read everything and write nothing, with the reason shown.
- The T&C gate renders in place, so no URL skips it.
- Every identifier is a UUID.
- `last_active_at` moves only through `touch_last_active()`.

### Still unresolved at the end of Phase 3
These are product decisions, not engineering work, and Phase 4 cannot close them
alone: **the admin permission model**, **"Delete Users" semantics**, **the
alerts engine** (including the undefined "unusual transaction" rule), **OCR and
PDF providers**, **the Excel report's home**, **leaked-password protection**,
**the user-side privacy request path**, and **design sign-off on
`success.text`**.
