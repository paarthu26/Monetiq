# Monetiq backend test suite

SQL-driven tests that exercise Row Level Security, database constraints, the
Auth API, Storage policies, and every Edge Function **against a real Supabase
project**. They are not unit tests with mocks: each assertion goes through the
same path a browser takes.

Pure business logic (INR formatting, EMI maths, the quota-week calculation,
budget aggregation, and all Zod schemas) is covered separately by Vitest —
`npm test` from the repository root.

## Why SQL rather than a JS integration suite

RLS is only meaningful when evaluated as the `anon` and `authenticated`
PostgREST roles. The harness switches role and installs a `request.jwt.claims`
payload so `auth.uid()` resolves exactly as it does for an API caller. Running
the same queries as the migration superuser would pass regardless of whether
any policy existed.

The HTTP helpers (`monetiq_test.api`, `monetiq_test.login`) call out from
Postgres through the `http` extension, which lets the suite hit Auth, Storage
and the Edge Functions directly.

## Running

Order matters — `00_harness.sql` first, `99_teardown.sql` last.

```sql
-- 1. Harness (creates the monetiq_test schema and enables the http extension)
\i 00_harness.sql

-- 2. Point the harness at the project and the dev accounts.
--    The anon key is a PUBLIC key; it is useless unless RLS is satisfied.
select set_config('monetiq_test.base_url', 'https://<project-ref>.supabase.co', false);
select set_config('monetiq_test.anon_key', '<anon key>', false);
select set_config('monetiq_test.u1',    '<dev.user  profile uuid>', false);
select set_config('monetiq_test.u2',    '<dev.user2 profile uuid>', false);
select set_config('monetiq_test.admin', '<dev.admin profile uuid>', false);

-- 3. Seed fixture rows owned by user 1 (see the fixtures block in this README).
-- 4. Suites
\i 10_rls_matrix.sql
\i 20_profiles_and_privileged.sql
\i 30_constraints_and_quota.sql
\i 40_auth_storage_functions.sql

-- 5. Results
select suite,
       count(*) filter (where passed)     as passed,
       count(*) filter (where not passed) as failed
from monetiq_test.results group by suite order by suite;

-- 6. Teardown — removes the schema AND the http extension
\i 99_teardown.sql
```

## Two traps worth knowing

**A denied UPDATE or DELETE does not raise.** RLS filters it to zero rows.
`monetiq_test.x()` therefore returns `OK:<rowcount>`, so `OK:0` (denied) is
distinguishable from `OK:1` (allowed). A test that only checked for an
exception would score a denial as a pass by accident.

**Edge Functions cannot see your open transaction.** They connect separately.
Any row a function must read has to be committed in an earlier statement —
inserting a fixture inside the same `DO` block that calls the function will
fail with "not found".

## What the suite covers

| Area | Assertions |
| --- | --- |
| RLS matrix over 12 user-owned tables | SELECT/INSERT/UPDATE × anon, owner, non-owner, admin |
| Child tables (chat messages, statement rows, ticket messages) | ownership resolved through the parent row |
| `profiles` privileged columns | self-escalation of `role`, `is_blocked`, `deleted_at` all rejected |
| Admin-only tables | regular users denied on every verb; `admin_audit_log` append-only even for admins |
| AI key | not readable by a user, **not readable by a super admin**, readable only by the service role |
| Constraints | amount > 0, enum CHECKs, FKs, unique (incl. `NULLS NOT DISTINCT`) |
| Shared AI quota | one counter across all three AI features; failed calls and prior weeks excluded |
| Auth | login, bad password, unknown user, session identity, refresh, logout, tampered JWT |
| Storage | per-user folder isolation across all three buckets; no admin blanket read |
| Edge Functions | success + failure path each; staged file deleted by the function itself |

## Known gaps

- **Email delivery is not asserted.** The dev accounts use a `.test` domain,
  which Supabase's address validator rejects for outbound mail, and the project
  has no custom SMTP (the built-in sender is rate limited). The suite asserts
  the recover endpoint is reachable and never returns a session; it cannot
  assert that a message arrives.
- **Google OAuth is not asserted end-to-end.** The provider was not enabled on
  the project at the time of writing (`/authorize?provider=google` returns
  `validation_failed: provider is not enabled`). Enabling it is a dashboard
  action.
- **OCR and loan-document extraction are stubs.** No provider credential
  exists. The functions report `extraction_source: "stub"` and
  `requires_manual_review: true` rather than inventing values, and the tests
  assert exactly that.
