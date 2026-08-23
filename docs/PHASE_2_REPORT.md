# Monetiq — Phase 2 Completion Report

**Scope.** The complete front end for both the User and Super Admin
experiences, built on the real Supabase auth/session stack and a mock data
layer that mirrors the Phase 1 contracts. Phase 1's schema, RLS policies and
Edge Function contracts were **not** modified.

**Branch:** `claude/github-supabase-checklist-0j0uu8`

---

## 1. Completed

### Foundation
- **Design tokens** (`tailwind.config.ts`) ported from Section 1: page cream
  `#FAF7F5`, surface white, sunken `#F4F4F5`, hairline `#E4E4E7`, text primary
  `#27272A` / secondary `#314363`, brand navy-indigo `#1E1B4B`, action violet
  `#4F46E5` (hover `#4338CA`, press `#332BA8`, soft `#F5EEFF`), the four status
  ramps, five category tints, seven chart series colours, sidebar rail gradient
  `#0B1033 → #141A44`. Radii 10/14/20px. Indigo-tinted shadows. Motion
  140/220/340/520ms on `cubic-bezier(.2,.6,.25,1)`.
  Two deviations, both measured and justified — see §4.
- **Typography** Poppins; the H1–Caption scale exactly as specified;
  `.tabular` (`font-variant-numeric: tabular-nums`) on every amount.
- **Providers** (`src/app/providers.tsx`) — one TanStack Query client per
  session, `staleTime` 30s, no refetch-on-focus, and a retry predicate that
  refuses to retry permanent errors (`forbidden`, `invalid_input`,
  `quota_exhausted`, `pdf_not_supported`, …) so the user sees the real state
  instead of a delayed one.

### Auth — real, not mocked
`login`, `register`, `forgot-password`, `reset-password`, `verify-email` and
`/auth/callback` all drive the actual `@supabase/ssr` browser client. The
middleware from Phase 1 is unchanged and still calls `getUser()` (not
`getSession()`) on every request. `TermsGate` renders **in place** rather than
redirecting, so no URL can skip it.

### Mock data layer (`src/lib/mock/`)
- `fixtures.ts` — typed against the generated `Tables<'…'>` types. Three
  scenarios: `empty`, `typical`, `heavy` (520 ledger rows, a 100-character
  merchant name, 40-message chat, 30-reply ticket thread, exhausted AI quota).
- `api.ts` — 80+ functions mirroring the Phase 1 contracts: the same shapes,
  the same Edge Function envelopes, the same error codes. Mutations write to an
  in-memory store mirrored to `sessionStorage`, so CRUD round trips and page
  refreshes behave like a real backend.
- `config.ts` — URL-driven controls (`?mock=empty|typical|heavy`,
  `?mockFail=`, `?mockDelay=`, `?mockBlocked=1`, `?mockRole=super_admin`,
  `?mockOffline=1`), also exposed on `window.__monetiqMock` for Playwright.
- `errors.ts` — the 16 Phase 1 error codes, an `ApiError` class, and
  `friendlyMessage()` so no raw code ever reaches a user.

### Query layer (`src/lib/queries/`)
A key factory plus **67 hooks**. Every screen reads and writes through these;
**no component imports fixtures or the mock API directly** (verified by grep,
§5). `useInvalidatingMutation` makes each mutation declare the keys it affects.

### Components (`src/components/`)
See the inventory in §8.

### Screens
**40 routes** — see the inventory in §7.

---

## 2. Verified — what was actually run

Every number below is from a real run in this session, not an estimate.

| Check | Command | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | **clean** (0 errors) |
| Lint | `npx next lint --max-warnings=0` | **clean** (0 warnings, 0 errors) |
| Production build | `npx next build` | **succeeds**, 40 routes emitted |
| Unit + component + screen tests | `npx vitest run` | **149 passed / 149** |
| End-to-end + a11y | `npx playwright test` | **21 passed / 21** |
| Client-bundle secret canary | `scripts/check-bundle-secrets.sh` | **PASS — 0 matches** |

### Real failures found and fixed during verification

Six defects were found by these tests. All are fixed; none were "fixed" by
weakening an assertion.

1. **Modal stole focus on every keystroke.** `Modal`'s focus-trap effect
   depended on `onClose`, which is an inline arrow and therefore a new function
   on every parent render. The effect tore down and re-ran on each keystroke,
   re-running "focus the first field" and pulling focus out of whatever the user
   was typing in. Every modal form in the app recorded **only the first
   character**. Fixed by holding `onClose` in a ref and keying the effect on
   `open` alone. Regression test: `CT-05 › keeps focus in the field being typed
   into across re-renders`.
2. **Fixture ids were not UUIDs.** The Phase 1 Zod schemas validate identifiers
   with `z.string().uuid()`. Fixture ids were readable slugs (`cat-04`), so
   choosing a category on the Add Expense screen produced a payload the real API
   would reject — exactly the drift this phase exists to prevent. Fixed with a
   deterministic slug→UUID minter (`fixtureId()`); newly created rows now get a
   real `crypto.randomUUID()`. Guarded by `tests/mock-contract.test.ts`.
3. **"Publish new version" was a no-op on an already-published page.**
   `adminUpdateContentPage` only bumped the version when the page was *not*
   already published, so re-publishing the Terms silently failed to force
   re-acceptance. Fixed so every publish is a new version. Caught by E2E-12.
4. **An unverified account was told its password was wrong.** The login screen
   collapsed every auth error into one generic message, sending a user who had
   simply not clicked the verification link off to reset a password that was
   fine. Now the unconfirmed case gets its own actionable message; every other
   failure stays deliberately generic so "no such user" and "wrong password"
   remain indistinguishable. Caught by E2E-01.
5. **Four accessibility defects** — see §4.
6. **Two script bugs of my own** in the canary checker (a `pipefail` abort on
   grep's "no matches" exit code, and a `sk-` pattern loose enough to match
   `task-${id}` in minified code). Both fixed; the check now reports honestly.

---

## 3. Security review

### The bundle check (the important one)
`scripts/check-bundle-secrets.sh` places a unique canary in
`SUPABASE_SERVICE_ROLE_KEY`, runs a clean production build, and searches every
emitted file:

```
canary: MONETIQ_CANARY_1787486497_do_not_ship_this_value
.next:         0 file(s) containing the canary
.next/static:  0 file(s) containing the canary
.next/static:  0 file(s) containing 'SUPABASE_SERVICE_ROLE_KEY'
.next/static:  0 file(s) containing 'service_role'
.next/static:  0 file(s) containing 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9'   (JWT header)
.next/static:  0 file(s) matching /sk-[A-Za-z0-9_-]{20,}/
.next/static:  0 file(s) matching /sk-ant-[A-Za-z0-9_-]{10,}/
.next/static:  0 file(s) matching /AIza[A-Za-z0-9_-]{30,}/
PASS: 0 matches in .next and .next/static.
```

**Required result achieved: 0 matches.**

### Other checks run

| Check | Result |
|---|---|
| `dangerouslySetInnerHTML` anywhere in `src/` | none (only a comment saying why) |
| `localStorage` / `sessionStorage` outside the mock layer | none |
| Any component importing fixtures or the mock API directly | none |
| `toLocaleString` used for money | none — all amounts go through `formatINR()`; the remaining calls are dates and one integer request count |
| AI provider key readable by the client | no — `adminSetProviderKey` returns only `{ has_key: true }`, and the key field is write-only, `type="password"`, never pre-filled (ST-28) |
| Admin role check treated as a security boundary | no — `src/app/(admin)/layout.tsx` carries an explicit comment that it is UX only and RLS is the real barrier; asserted by ST-32 |
| Ticket `sender_id` supplied by the client | no longer — derived from the session, mirroring `auth.uid()` |
| Statement data reaching the ledger | no path exists; proven by ST-12 and E2E-04 against the live store |

### Deliberate design decisions worth recording
- **The mock layer writes to `sessionStorage`.** Fixture data only — no
  credentials, no tokens, no real personal data — scoped to the tab, so a page
  refresh does not silently undo the user's work in the prototype. The whole
  mechanism is deleted in Phase 3 with the rest of `src/lib/mock/`.
- **`src/app/error.tsx` deliberately does not print `error.message`.** An
  unexpected throw can carry internals; only the digest is shown so a report can
  be matched to a server log.

---

## 4. Accessibility

`@axe-core/playwright`, tags `wcag2a wcag2aa wcag21a wcag21aa`, run against
**every one of the 33 reachable routes** (7 public, 14 user, 12 admin).

**Result: 0 violations.** The suite fails on any violation and prints the exact
node, so this is a real gate rather than a claim.

Four genuine defects were found and fixed:

1. **`link-in-text-block` on `/register`.** The Terms and Privacy links inside
   the consent sentence were distinguished by colour alone. Now underlined.
2. **`color-contrast` — `text-muted`.** zinc-500 `#71717A` measures **4.19:1**
   on cream-200 (`#F3EEEA`, the hovered-row background) at 11px, and only
   4.53:1 on the page. Darkened to **`#5F5F68`** — 6.32 on white, 6.02 on page,
   5.58 on cream-200. `muted` is a token I introduced, not a Section 1 colour.
3. **`color-contrast` — `success.text`.** This *is* a Section 1 colour.
   `#008C51` measures **3.75:1** on its own tint, 4.00 on the soft surface and
   4.31 on white — below AA everywhere it is used, and success badges are 11px.
   Darkened to **`#046A3E`** (5.82 / 6.21 / 6.70). The other status text colours
   were measured too and all pass (`warning #B45309` = 4.53 on tint,
   `error #B91C2C` = 5.30), so only this one moved.
   **This is a deviation from Section 1 and needs design sign-off.**
4. **`aria-hidden-focus` on every chart, and `list` on `/chat`.** Recharts'
   accessibility layer puts `tabindex="0"` inside the `aria-hidden` chart
   subtree, so a keyboard user could land on something no screen reader
   announces; `ChartFrame` now removes the visual chart from the focus order at
   runtime (React 18 does not emit the `inert` attribute). The chat transcript
   `<ul>` had a bare `<div>` scroll anchor as a direct child.
   Separately, `opacity-70` on resolved admin alert rows dragged every
   foreground colour inside them below AA; the state is now carried by the badge
   and a sunken background instead.

Beyond axe: focus trapping, Escape-to-close and focus restoration are asserted
in CT-05; a complete keyboard-only journey (sign in → add expense → open and
close a modal) is asserted in E2E-18.

**Responsive** verified at 360 (E2E-17, a dedicated Playwright project on Pixel
5, including an assertion that the document never scrolls horizontally), and at
768 / 1024 / 1440 through the desktop project's 1280px viewport plus the
Tailwind breakpoint structure. Tables become stacked cards below `md`; modals
become bottom sheets below `sm`.

---

## 5. Test results

### Component tests — CT-01 … CT-12 (`tests/components/ui.test.tsx`)
**31 assertions, 31 passed, 0 failed.**

| ID | What it proves | Result |
|---|---|---|
| CT-01 | Every Button variant and size renders its documented classes; `disabled` and `loading` both block `onClick` | pass (4 cases) |
| CT-02 | Input links its error via `aria-describedby`, marks itself `aria-invalid`, and swaps hint→error so stale hint text is never announced | pass (2 cases) |
| CT-03 | `124560` renders `₹1,24,560` with the tabular class | pass |
| CT-04 | `0`, negative, `1,00,00,000`, and explicit credit/debit signing | pass (4 cases) |
| CT-05 | Modal traps focus, Esc closes, focus returns to the trigger — **and** focus survives typing | pass (2 cases) |
| CT-06 | Upload rejects wrong type and oversize with distinct, specific messages naming the file and the limit | pass (3 cases) |
| CT-07 | Empty rows render the empty state, not a header-only shell or a skeleton | pass |
| CT-08 | Skeleton matches loaded shape (one block per row) and is replaced by real rows | pass (2 cases) |
| CT-09 | Toast lands in a `role="status" aria-live="polite"` region that exists *before* the message | pass |
| CT-10 | Quota at 0 shows exhausted styling and the exact reset day | pass (2 cases) |
| CT-11 | The disclosure renders its text, and every AI surface in the app includes it | pass (2 cases) |
| CT-12 | Every category tint maps correctly, including the fallback | pass (7 cases) |

### Screen tests — ST-01 … ST-32 (`tests/screens/`)
**48 assertions, 48 passed, 0 failed.**

| ID | Result | Note |
|---|---|---|
| ST-01 Dashboard empty | pass | three first-action CTAs |
| ST-02 Dashboard error | pass | retry present; no raw code shown |
| ST-03 Ledger 520 rows | pass | 25 rows + header in the DOM, not 520 |
| ST-04 Combined filters | pass | search + category + date narrows to the exact row |
| ST-05 No results | pass | distinct from "nothing recorded yet" |
| ST-06 Invalid amounts | pass | `0`, `-250`, `10.999` all blocked with field errors |
| ST-07 Valid submit | pass | toast + redirect to `/ledger` |
| ST-08 OCR stub | pass | all fields blank; no confidence score, no "we detected" |
| ST-09 OCR failure | pass | retry **and** add-manually offered |
| ST-10 PDF upload | pass | specific message telling the user to export CSV |
| ST-11 CSV success | pass | totals + breakdown + AI disclosure |
| ST-12 Statement isolation | pass | no ledger merchant, no ledger link, and the live ledger is unchanged |
| ST-13 Excel download | pass | disclaimer present in **both** sheets |
| ST-14 Loan types | pass | exactly `personal_loan`, `credit_card`, and it says why |
| ST-15 EMI | pass | preview equals `calculateEmi(500000, 10.5, 60)` = ₹10,746.95 |
| ST-16 Over budget | pass | exactly the one over-budget row is flagged |
| ST-17 Live progress | pass | adding an expense changes the computed figure |
| ST-18 Custom range | pass | applied; inverted range rejected |
| ST-19 Analytics source | pass | no statement description appears anywhere, including sr-only tables |
| ST-20 Quota exhausted | pass | composer disabled, reason stated, nothing sent |
| ST-21 Provider outage | pass | plain-English message, code never shown |
| ST-22 Health score | pass | Coming Soon only; no progressbar, no score |
| ST-23 Alerts | pass | disabling a type greys its threshold |
| ST-24 Ticket creation | pass | category required; **no file input exists anywhere on the form** |
| ST-25 Blocked account | pass | writes disabled on ledger and budget; no RLS error text |
| ST-26 Income sources | pass | several sources, monthly and one-time, and adding another works |
| ST-27 Soft delete | pass | copy says deactivated, "Nothing is erased", restorable |
| ST-28 AI keys | pass | write-only, masked, empty, and absent from the DOM after saving |
| ST-29 Roles | pass | toggles render **and** say they enforce nothing |
| ST-30 Audit log | pass | zero create/edit/delete controls |
| ST-31 System monitoring | pass | renders, and says the data is manually maintained |
| ST-32 Non-admin | pass | permission-denied state, a way out, no admin data behind it |

Plus `tests/finance.test.ts` (28), `tests/validation.test.ts` (37) and
`tests/mock-contract.test.ts` (5) — **149 Vitest assertions in total.**

### End-to-end — E2E-01 … E2E-18 (`e2e/`)
**21 Playwright tests, 21 passed, 0 failed** (18 journeys + 3 a11y sweeps).

| ID | Result | What it actually proved |
|---|---|---|
| E2E-01 | pass | Register → verification-sent → unverified sign-in refused → verified sign-in → T&C gate, which `/ledger` and `/settings` cannot skip → dashboard |
| E2E-02 | pass | Create → appears in ledger → open → edit → amount changes → delete behind a confirm dialog → gone |
| E2E-03 | pass | Upload → stub notice → empty form → filled by hand → saved and shown as **Scanned** |
| E2E-04 | pass | CSV → results → real `.xlsx` download event → **ledger row count unchanged and no statement description present** |
| E2E-05 | pass | Budget that was under goes over after a large expense in that category |
| E2E-06 | pass | Chat consumes quota, **a loan suggestion consumes the same counter**, then the composer is disabled |
| E2E-07 | pass | Debt added, live EMI = ₹10,746.95, AI suggestion carries its disclosure |
| E2E-08 | pass | Ticket raised → replied → closed → thread becomes read-only |
| E2E-09 | pass | Four protected URLs redirect to `/login?redirectedFrom=<path>` with the path preserved |
| E2E-10 | pass | A signed-in normal user is denied `/admin`, `/admin/users`, `/admin/ai`, `/admin/audit` with no admin data rendered |
| E2E-11 | pass | Admin blocks a user; the audit log shows `user.block` |
| E2E-12 | pass | Publishing Terms bumps to v3; the user meets the gate again, accepts, and it stays accepted across a reload |
| E2E-13 | pass | Sessions invalidated at the auth service mid-visit → graceful redirect, no error boundary |
| E2E-14 | pass | Ten major screens refreshed; H1 restores each time and **no hydration error** is logged |
| E2E-15 | pass | Back through five screens then forward through five, correct screen each time |
| E2E-16 | pass | Induced failure → retry button → restore → retry succeeds |
| E2E-17 | pass | Full journey at 360px: tab bar, drawer, stacked cards, bottom-sheet modal, a write, and no horizontal scroll at any point |
| E2E-18 | pass | Keyboard only: sign in, clear the T&C gate, add an expense, open a modal, Esc, focus returns to the trigger |
| a11y × 3 | pass | 33 routes, 0 violations |

### How E2E runs without reaching Supabase
This sandbox has no outbound network, so `*.supabase.co` is unreachable. Rather
than mock auth inside the app — which the brief forbids — `e2e/auth-stub.mjs`
implements the GoTrue endpoints supabase-js actually calls, and
`NEXT_PUBLIC_SUPABASE_URL` points at it. **Nothing in `src/` knows it exists.**
The app runs its real production build, with the real browser/server/middleware
clients, real cookies and the real middleware. Point the same variable at a live
project and the suite runs unchanged.

---

## 6. Open issues

### Carried forward from Phase 1 — all twelve, none resolved by Phase 2

| # | Item | Phase 2 status |
|---|---|---|
| 1 | **Admin permission model conflict** — PRD flat vs prototype granular | **Still open. Needs a product decision before Phase 3.** The screen was built with the toggles the prototype shows *and* an unmissable notice (`roles-inert-notice`) stating that changing one grants and removes nothing. ST-29 asserts the notice. |
| 2 | **"Delete Users" is a soft delete** — confirm intended | **Still needs confirmation.** The dialog now says so in as many words: marked deactivated, "Nothing is erased", restorable, "not a permanent deletion". ST-27 asserts it. |
| 3 | Google Sign-In configured but not enabled | **Still open.** The button exists; `provider is not enabled` is handled calmly with a message telling the user to use email for now. |
| 4 | Email verification / reset delivery untested (no SMTP) | **Still untested.** The register screen says so on the confirmation panel ("Email delivery is still being configured for this environment, so the message may not arrive at all yet"). |
| 5 | OCR / loan-document extraction are stubs | **Still stubs.** The review screen fabricates nothing and says why. ST-08 asserts every field is blank and that no confidence score is shown. |
| 6 | PDF bank statements unsupported | **Still unsupported.** Dedicated `pdf_not_supported` state telling the user to export CSV. ST-10. |
| 7 | Leaked-password protection disabled | **Still disabled** — a Supabase dashboard setting, out of Phase 2's reach. |
| 8 | Excel report missing from Phase 1 — confirm client-side is right | **Built client-side** (`src/lib/report/excel.ts`, SheetJS, loaded on demand). **Confirm this is the right home:** the workbook is assembled in the browser, so it is only as trustworthy as the session that made it. An Edge Function would be the alternative. |
| 9 | **Nothing fires `alert_notifications`; no web push** | **Still no engine.** The full UI exists over fixtures, and `alerts-engine-gap` states plainly that nothing is delivered yet. Needs a Phase 3 decision: trigger, cron, or Edge Function. |
| 10 | Dev accounts inserted straight into `auth.users` | **Unchanged.** Likely missing `auth.identities` rows; recreate via the Auth Admin API. |
| 11 | **"Active Users" has no data source** | **Still none.** The admin dashboard shows the metric from `last_active_at` in fixtures; no schema column feeds it. |
| 12 | **Privacy requests are admin-only** | **Still admin-only.** The admin queue is built; `privacy-user-gap` states that users have no way to raise their own request, which is likely wrong for a privacy feature. |

### New issues raised by Phase 2

13. **`success.text` was darkened from the Section 1 value** (`#008C51` →
    `#046A3E`) because the specified colour fails WCAG AA on its own tint.
    Needs design sign-off (§4).
14. **Poppins is loaded via a render-blocking `@import` from
    fonts.googleapis.com.** That is a third party in the critical path and a
    privacy consideration. It should become a self-hosted `next/font/google`
    import in Phase 3, where the build machine has network access.
15. **The mock layer persists to `sessionStorage`.** Intentional and harmless
    (fixture data, tab-scoped), but it is state that does not exist in the real
    product; it disappears with `src/lib/mock/`.
16. **The Phase 1 Zod schemas have no schema for a ticket reply or a chat
    message body.** Both are validated ad hoc in the UI. Worth adding for
    Phase 3 so length limits are enforced in one place.
17. **`budgetSchema` has no `month` field**, so the UI picks the month itself.
    Confirm the real API derives it server-side.

---

## 7. Screen inventory

Legend: **D** default · **L** loading · **E** empty · **X** error ·
**S** success · **V** validation · **P** permission-denied · **N** not-found

### Public / auth (7)
| Route | States |
|---|---|
| `/login` | D L X V S · plus a calm "Google not enabled" state and the unverified-address state |
| `/register` | D X V S (verification-sent) · live password-rule feedback |
| `/forgot-password` | D X V S (reset-sent) |
| `/reset-password` | D X V S · expired-link state |
| `/verify-email` | success / already-verified / expired / invalid |
| `/terms`, `/privacy` | D L X |

### User (16)
| Route | States |
|---|---|
| `/dashboard` | D L E X — empty state carries three first-action CTAs |
| `/ledger` | D L E X — "no results" is a **separate** state from "no data yet" |
| `/expenses/new` | D X V S |
| `/expenses/scan` | D L X S V · stub-extraction state · upload-rejected states |
| `/expenses/[id]` | D L X N S V (edit + delete confirm) |
| `/statements` | D L E X S · `pdf_not_supported` · `unparsable_statement` · separation notice |
| `/budget` | D L E X S V · over-budget state |
| `/debt` | D L E X S V · quota-exhausted and provider-outage states |
| `/analytics` | D L E X V (invalid range) · source note |
| `/categories/[id]` | D L E X N |
| `/chat` | D L E X · quota-exhausted · provider-not-configured |
| `/alerts` | D L E X S V · push granted/denied/unsupported · engine-gap notice |
| `/health-score` | Coming Soon **only** |
| `/help-desk`, `/help-desk/[id]` | D L E X N S V · closed-ticket read-only |
| `/settings` | D L X S V · multi-source income |
| `/more` | D |

### Super Admin (12)
| Route | States |
|---|---|
| `/admin` | D L E X |
| `/admin/users` | D L E X · no-results distinct from empty |
| `/admin/users/[id]` | D L X N S · block / unblock / soft-delete confirmations |
| `/admin/ai` | D L E X S V · write-only key notice |
| `/admin/ocr` | D L E X |
| `/admin/system` | D L E X · manually-maintained notice |
| `/admin/roles` | D L X · not-enforced notice |
| `/admin/audit` | D L E X · read-only notice, no mutating controls |
| `/admin/content` | D L X S V · publish-version confirmation |
| `/admin/privacy` | D L E X S · user-side-gap notice |
| `/admin/tickets`, `/admin/tickets/[id]` | D L E X N S V |
| `/admin/alerts` | D L E X S |
| `/admin/more` | D |

Plus `/` (redirect), `not-found.tsx` and `error.tsx`.
Every admin route also has a **permission-denied** state via `(admin)/layout.tsx`.

---

## 8. Component inventory

| Module | Components |
|---|---|
| `ui/primitives.tsx` | Button (5 variants × 2 sizes × loading/disabled), IconButton (accessible name required), Input, Textarea, Select, Checkbox, RadioGroup, Toggle (`role="switch"`), Badge (7 tones), Avatar, Card, CardHeader, Skeleton, SkeletonText, ProgressBar, Tooltip |
| `ui/data.tsx` | Amount, CategoryTile, `categoryTintClass`, Table (desktop table ⇄ mobile cards, loading, empty), Pagination, SearchInput, FilterChip, EmptyState, ErrorState, AiDisclosure, QuotaIndicator, InfoBanner, ProgressBarRow, StatCard |
| `ui/overlay.tsx` | Modal (focus trap, Esc, focus restore, bottom sheet <sm), ConfirmDialog, ToastProvider + `useToast`, Tabs |
| `ui/upload.tsx` | FileUpload (drag-drop + picker, per-reason rejection messages, progress capped until the response lands) |
| `ui/charts.tsx` | ChartFrame (every chart carries an sr-only data table and is out of the focus order), CategoryDonut, CategoryDonutSection, IncomeExpenseBars, TrendLine, CountBars |
| `shell/` | AppShell (rail / drawer / bottom tabs), PageHeader, nav-config, BlockedProvider + `useWriteDisabledReason` |
| `auth/` | AuthLayout, TermsGate |
| `expenses/`, `profile/` | ExpenseForm, IncomeSources |

---

## 9. Files and architecture

```
src/
  app/
    (auth)/      login · register · forgot-password · reset-password · verify-email
    (public)/    terms · privacy
    (app)/       user shell → TermsGate → AppShell → BlockedProvider
    (admin)/     admin shell → role check (UX only) → AppShell
    auth/callback/route.ts
    providers.tsx · layout.tsx · error.tsx · not-found.tsx · globals.css
  components/    ui/ · shell/ · auth/ · expenses/ · profile/
  lib/
    constants.ts        AI copy that outlives the mock layer
    cn.ts · finance.ts · validation/schemas.ts        (Phase 1, unchanged)
    supabase/           client · server · middleware · types  (Phase 1, unchanged)
    mock/               fixtures · api · config · errors      ← deleted in Phase 3
    queries/            keys · hooks                          ← bodies swap in Phase 3
    report/excel.ts
  middleware.ts                                                (Phase 1, unchanged)
e2e/            auth-stub.mjs · base.ts · helpers.ts · 5 spec files
tests/          finance · validation · mock-contract · components/ · screens/
scripts/        check-bundle-secrets.sh
```

**The seam.** Screens depend only on `src/lib/queries/hooks.ts`. Those hooks
call `src/lib/mock/api.ts`. Phase 3 replaces the *bodies* in `api.ts` with
Supabase calls; the signatures, return shapes and thrown `ApiError` codes stay
exactly as they are, so **no screen and no test needs to change**.

---

## 10. Phase 3 handoff

Everything below is self-contained — a fresh session needs nothing from this
conversation.

### The swap
1. Create `.env.local` from `.env.example` with the real project URL, anon key
   and service-role key. Auth starts working immediately; nothing in the auth
   screens changes.
2. Rewrite the bodies in `src/lib/mock/api.ts` one function at a time against
   Supabase. Keep every signature and every `apiError(code)` identical. The
   contract each one must satisfy is the function's own JSDoc plus the Phase 1
   report.
3. Delete `src/lib/mock/{fixtures,config}.ts` and the `?mock=` handling in
   `providers.tsx`. `src/lib/constants.ts` stays.
4. Run `npx vitest run` and `npx playwright test`. The screen tests exercise
   the hooks, so a contract mismatch shows up as a failing test rather than as
   a broken screen.

### Function-to-backend mapping
| Mock function | Real source |
|---|---|
| `getProfile`, `updateProfile` | `profiles` (RLS: own row) |
| `listCategories` | `categories` (predefined + own) |
| `listIncomeSources` + CRUD | `income_sources` |
| `listLedger`, `getExpense`, `create/update/deleteExpense` | `expense_ledger` |
| `listBudgets`, `upsertBudget`, `budgetProgress` | `budgets` + computed live from `expense_ledger` — **never persist progress** |
| `listDebts`, `getDebt`, `create/update/deleteDebt` | `debts` |
| `listAlertSettings`, `upsertAlertSetting` | `alert_settings` |
| `listNotifications`, `markRead`, `dismiss` | `alert_notifications` — **nothing writes these yet (open issue 9)** |
| `quotaStatus`, `sendChatMessage`, `loanSuggestion` | Edge Functions `ai-chat`, `loan-suggestion` — **quota is checked before the provider call; preserve that order** |
| `processReceipt` | Edge Function `process-receipt` (stub provider) |
| `processStatement`, `listStatements`, `getStatementResult` | Edge Function `process-statement` + `bank_statement_*` tables |
| `listTickets`, `getTicket`, `createTicket`, `replyToTicket`, `closeTicket` | `help_desk_tickets` / `help_desk_messages` — `sender_id` comes from `auth.uid()` |
| `listContentPages`, `getContentPage`, `acceptTerms` | `content_pages`, `user_terms_acceptance` |
| `admin*` | admin tables + `admin_audit_log`; `adminSetProviderKey` → Edge Function `manage-ai-key`, which must keep returning `{ has_key: true }` and nothing else |

### Invariants Phase 3 must not break
- **Bank statement analysis and the expense ledger never mix.** No import path,
  no shared query, no cross-link. ST-12, ST-19 and E2E-04 fail loudly if this
  regresses.
- **AI quota is shared across every AI feature and checked before the provider
  call.** E2E-06 proves chat and loan suggestions draw on one counter.
- **AI provider keys are write-only.** Even a super admin cannot read one back.
- **Budget progress is computed on read, never stored.**
- **The admin role check in the UI is UX only.** RLS is the boundary.
- **Blocked accounts can read everything and write nothing**, with the reason
  shown on every disabled control.
- **The T&C gate renders in place**, so no URL skips it.
- **Every identifier is a UUID.** The Zod schemas enforce it.

### Running the suites
```bash
npm run typecheck                 # tsc --noEmit
npm run lint
npm test                          # vitest, 149 assertions
npm run test:e2e:build            # production build with E2E env
npm run test:e2e                  # playwright, 21 tests (starts both servers)
bash scripts/check-bundle-secrets.sh   # canary; must print PASS
```
Against a live project, replace the two `NEXT_PUBLIC_SUPABASE_*` values in
`playwright.config.ts` and drop the `auth-stub` entry from `webServer`.

### Test accounts used by the E2E suite
`user@monetiq.test`, `admin@monetiq.test`, `unverified@monetiq.test`, all with
`Password123!`. These match the Phase 1 dev seed. **They are development
credentials for a throwaway environment and must not exist in production.**
