# Monetiq

AI-powered personal finance for India. Currency is INR only, formatted with
lakh grouping (`₹1,24,560`).

**Phase 1 — the Supabase backend and data layer — is complete.** There is no
production UI yet; that is Phase 2. What exists here is the schema, Row Level
Security, storage policies, Edge Functions, validation, and the tests that
prove them.

## Stack

Next.js + React + TypeScript, Supabase (Auth, Postgres, RLS, Storage, Edge
Functions), Zod for validation, Vitest for logic tests. No Express, no Prisma,
no separate API server.

## Layout

```
src/lib/supabase/     three distinct clients — browser, server, middleware
src/lib/validation/   Zod schemas for every mutating input path
src/lib/finance.ts    pure logic: INR formatting, EMI, AI quota, budgets
src/middleware.ts     session refresh + protected-route contract
supabase/migrations/  ordered, reproducible schema
supabase/functions/   six Edge Functions + shared library
supabase/tests/       SQL suite for RLS, storage, auth, Edge Functions
tests/                Vitest suite for business logic and schemas
```

## Getting started

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and anon key
npm run dev
```

```bash
npm test           # Vitest — 65 logic and validation tests
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

The backend test suite runs against a live project; see
`supabase/tests/README.md`.

## Design rules that constrain the schema

These are product invariants, not preferences. Changing them changes the
product.

**The Expense Ledger is the single source of truth for spending.** It has
exactly two write paths, `source = 'ocr' | 'manual'`, enforced by a CHECK
constraint. Budget Planner, Analytics and Expense Alerts read `expense_ledger`
and nothing else.

**Bank Statement Analysis is a separate, read-only feature.** Its tables are
never joined into ledger queries and nothing in the codebase writes statement
data into `expense_ledger`. There is a test that asserts this after a real
statement import.

**Raw uploaded documents are deleted immediately after extraction.** The three
storage buckets are transient staging areas, not a document store. Each Edge
Function deletes its staged file in a `finally` block, inside its own
execution — not via a cleanup job that might not run. There is deliberately no
"view original document" capability anywhere in the product.

**The AI quota is one shared counter.** Two successful generations per user per
week, across the chatbot, bank statement reports and loan closure suggestions
combined — not two of each. It is computed from `ai_usage_log` and enforced
server-side before any provider is called.

**AI provider keys live in Supabase Vault.** No client-readable column holds a
key. `EXECUTE` on the Vault accessors is granted to `service_role` only, so a
super admin cannot read a key either — only an Edge Function can.

**The role model is flat.** `user` and `super_admin`. Every super admin can do
everything every other super admin can. The `role_permissions` table stores UI
toggle state and is not consulted by any policy.

## Phase 1 report

`docs/PHASE_1_REPORT.md` — what was built, what was verified with real
results, the security review, and every open question that needs product
sign-off before Phase 3.
