# SmartWallet — rules for every Claude session

Read this file fully before changing anything. These rules override convenience.

## 1. Product summary and MVP scope

SmartWallet is a multi-tenant SaaS for personal finance and smart budgeting. Target users: Vietnamese students and young professionals who lose track of spending. It automates expense categorization, digitizes budget planning, warns in real time when spending nears a limit, and helps users reach savings goals.

**In scope:** auth (email/password + Google), profile and onboarding, wallets, transactions (income, expense, transfer, recurring, CSV import), categories with auto-categorization, monthly budgets with templates, real-time over-budget alerts, savings goals, dashboard and reports with CSV export, Free/Premium plans, admin console.

**Out of scope (do not build, do not scaffold):** bank API sync, native mobile apps, ML categorization, shared/family budgets, multi-currency conversion, investments.

## 2. Roles

| Role | Capabilities |
|---|---|
| Guest | Register, log in, reset password only |
| User Free | 3 wallets, 5 budgets, 2 active goals, 6 months of report history |
| User Premium | Unlimited; CSV import/export, advanced reports, custom alert thresholds |
| Admin | Manages users, plans, default categories and keywords, system stats. **Cannot see individual transactions** |

## 3. Domain rules

- Money is **BIGINT in VND** (integer, no decimals). Keep a `currency` column for the future.
- Wallet balance = `opening_balance + sum(transactions)`. **Never a mutable balance column.** Cache in Redis (`wallet:balance:{id}`), invalidate on every write.
- `transactions.amount` is always > 0 (DB CHECK). A transfer is ONE row: `wallet_id` (source) → `transfer_wallet_id` (destination). Balance(w) = opening + INCOME − EXPENSE − TRANSFER out + TRANSFER in.
- Budget "spent" is an aggregate query over the period, never stored.
- Budget period follows the user's `month_start_day` (1-28). Salary on the 5th → 5 Nov to 4 Dec. Use `budgetPeriod()` from `@smartwallet/shared`; never re-implement it.
- Transfers between wallets are not income or expense (exclude from reports and budgets).
- Every write that changes money (transactions, transfers, import, recurring generation, wallet delete, goal contributions) runs inside ONE `prisma.$transaction`, and only AFTER it commits the service invalidates the wallet-balance cache and publishes a domain event through `DomainEvents` (`transaction.changed`, `goal.contribution.changed`; payload in `common/events.ts`, `current` + `previous` snapshots). Listeners (budget alerts today; reports/notifications next) must never mutate money, and a failing listener never fails the write.
- Wallet delete soft-deletes the wallet AND its transactions (including transfers touching it) atomically; archived wallets (`is_archived`) are hidden from lists by default and refused by every entry form (409 `WALLET_ARCHIVED`).
- Recurring rules (TXN-05): a BullMQ job scheduler (`RecurringScheduler`, fixed scheduler id, every `RECURRING_INTERVAL_MS`) runs `RecurringService.generateDue()`. Each rule is locked `FOR UPDATE SKIP LOCKED` and `next_run_at` advances in the same DB transaction as the inserts, so an occurrence can never be generated twice. Known limitation: monthly rules clamped to a short month drift (31 Jan → 28 Feb → 28 Mar).
- CSV import (TXN-06, Premium): preview (Redis, 30 min, scoped by user id, nothing written) → confirm (single-use, one DB transaction). Duplicate = same wallet + type + amount + Vietnam day + normalised note. Free-text cells are formula-sanitised (`'` prefix).
- Receipts (TXN-01): the client gets a size-capped S3 pre-signed POST for `receipts/{userId}/{uuid}.ext`, uploads directly, then sends `receiptKey`; the key must start with the caller's own prefix. `transactions.receipt_url` stores the KEY; responses return a short-lived signed GET url, never the key.
- Goals (GOAL-02): `saved_amount` is changed only together with a `goal_contributions` row in one DB transaction; withdrawals carry their balance guard inside the UPDATE's WHERE (no read-then-write race). ACHIEVED is derived from saved vs target, never set by hand.
- Categories (CAT-02): max 2 levels, sub-category type = parent type, system defaults (`user_id` NULL) are immutable (403 `SYSTEM_CATEGORY_READONLY`); deleting a category also removes its children and their budgets/rules, but past transactions keep their category.
- Budgets are one row per (user, period, category); `period` = DATE of the first day of the period; `category_id NULL` = the single total budget (partial unique index). Period boundaries are computed in Asia/Ho_Chi_Minh via `currentBudgetPeriod()` / `periodBounds()`; the API addresses a period as `YYYY-MM` = the month the period STARTS in. A category budget covers the category AND its sub-categories; transfers/income never count as spending.
- Budget maths (`computeProgress`): `percentUsed = spent/limit*100`, `safeToSpendToday = max(0, limit-spent) / daysLeftInPeriod` (today counts; a finished period has 0 days left).
- Templates (BUD-02, `budgets/templates.ts`): 50/30/20 = needs 50% (housing, food, transport, bills) + wants 30% (shopping, entertainment) + savings 20% (goals, not a budget); 6 Jars = 55/10/10/10/10/5; CUSTOM percentages must total exactly 100. Inside a group the amount is split by the last 3 periods of spending (even for new users), in whole thousands, largest-remainder so parts sum exactly. The Free plan truncates to `max_budgets` (total first, then biggest).
- Rollover (BUD-03): `budgets.rollover_amount` = the part of `limit_amount` carried over, so base = limit - rollover_amount and carried money is never carried twice; re-running is idempotent and keeps manual edits of the base. Overspending carries 0.
- Alerts (ALR-01): the `BudgetEvaluator` (alerts/) listens to `transaction.changed`, recomputes spent for the affected category budget, its parent budget and the total budget, and inserts a notification for every threshold crossed UPWARD by that change (before < t <= now, exact integer maths). `notifications.dedupe_key = budget:{id}:{threshold}` is UNIQUE (budgets are per period, so once per period); thresholds default 80/100, Premium may set custom ones. Type: BUDGET_WARNING (<100) / BUDGET_EXCEEDED (>=100). Message = "{floor(pct)}% of {category nameEn} used" (vi: "Đã dùng {pct}% ngân sách {nameVi}"), `POST /transactions` returns the alerts it triggered as `triggeredAlerts`.
- Delivery (ALR-02): ALL notifications go through `NotificationsService.notify()` (stored first, then per channel): in-app = Socket.IO namespace `/ws` (JWT in handshake `auth.token`, room `user:{id}`, events `notification:new` and `budget:updated`), email = BullMQ queue `email` (retries, job id = dedupe key). Channel mutes live in `users.notification_settings` (`inApp, email, weeklySummary, goalReminders`); a muted in-app channel still stores the row (history + dedupe) but pushes nothing and returns no triggeredAlerts.
- Jobs (ALR-03, BullMQ job schedulers, Vietnam time): weekly summary Mon 09:00 (dedupe `weekly:{user}:{monday}`), daily goal check 08:00 (auto-mark ACHIEVED when saved >= target; reminder when a goal is more than 20% behind a straight-line schedule, at most weekly per goal, not in the first 10% of its time), recurring generator every minute. Scheduler ids are fixed, so N instances = one schedule. `WORKERS=off` disables workers on an instance. Note: Nest's `EventEmitterModule.forRoot()` builds one emitter per process, so integration tests that need two live apps must live in separate files.
- Auto-categorization (CAT-03/04): `POST /categories/suggest` -> top 3 with confidence via the `CategorizerStrategy` interface (`CATEGORIZER` token; swap the class in `CategoriesModule` for an ML model, API unchanged). Score = personal rules (weight x3) + global keywords (x1) + history boost (category most often chosen for the same token in the last 90 days) + a small amount nudge; `confidence = share x (1 - e^-score)`; the form pre-selects at >= 0.6 (`preselectCategory()` in shared). Notes are normalised (lower-case, diacritics stripped, tokenised). Learning happens server-side: when a transaction is saved with a category different from what we would have suggested (computed BEFORE the row exists), the note's informative tokens are upserted as personal rules (hits + 1, race-free partial unique index) and contradicting personal rules lose a hit (retired at 0). Never put Vietnamese words that collide with English stop words after diacritic stripping in the stop list ("ăn" -> "an").
- Reports (RPT): `GET /reports/dashboard` (one call, cached 60 s in Redis; keys carry a per-user version, `ReportCache.bump(userId)` after anything that changes numbers), `/by-category`, `/trend?months=` (Free max 6), `/daily` (zero-filled, Vietnam days), `/export?format=csv` (Premium, BOM, formula-safe). Free plans may only read the current period and the 5 before it (`plans.limits.history_months`).
- Plan limits are data, not code: `plans.limits` JSONB (`max_wallets, max_budgets, max_goals, history_months`; `null` = unlimited), resolved through `PlansService.forUser()` from the user's newest ACTIVE subscription (fallback FREE).
- Auth state: lockout counters live in Redis (`auth:fail:{id}`, `auth:lock:{id}` TTL 15 min), not in users. Email-verify / password-reset links are signed JWTs (`JWT_ACTION_SECRET`, purposes `verify-email` 24 h / `reset-password` 30 min); a reset link embeds a fingerprint of the old password hash, so it is single-use.
- Soft delete user data (`deleted_at`); account deletion purges after 30 days.
- Default locale `vi` (also `en`). Timezone `Asia/Ho_Chi_Minh`.

## 4. Requirement IDs

Use them in branch names, commit scopes and test case IDs (e.g. `describe('BUD-04 …')`).

- **AUTH-01** register + email verification (24 h link) · **AUTH-02** login, JWT access 15 min + rotating refresh 7 days in httpOnly cookie · **AUTH-03** Google OAuth · **AUTH-04** forgot/reset password (30 min link) · **AUTH-05** lock 15 min after 5 failed logins
- **USER-01** profile (name, avatar, currency, language, month_start_day) · **USER-02** onboarding wizard (income → first wallet → budget template) · **USER-03** delete account
- **WAL-01** wallet CRUD (CASH, BANK, EWALLET, CREDIT) · **WAL-02** derived balance, archived wallets hidden from entry forms
- **TXN-01** create income/expense + optional receipt · **TXN-02** transfer · **TXN-03** list with filters/pagination/sort · **TXN-04** edit/delete with recalculation · **TXN-05** recurring (daily/weekly/monthly) · **TXN-06** CSV import with preview + duplicate detection
- **CAT-01** default categories vi/en · **CAT-02** custom categories, max 2 levels · **CAT-03** auto-suggest from note · **CAT-04** learn from user overrides
- **BUD-01** monthly budget per category + one total · **BUD-02** templates 50/30/20, 6 Jars, custom % · **BUD-03** rollover · **BUD-04** progress: spent, remaining, % used, safe-to-spend per day
- **ALR-01** alerts at 80% / 100% · **ALR-02** in-app (WebSocket) + email, mute per channel · **ALR-03** weekly summary + goal reminders
- **GOAL-01** create goal · **GOAL-02** contributions, progress, required monthly saving
- **RPT-01** dashboard · **RPT-02** charts (category donut, 6-12 month trend, daily spending) · **RPT-03** CSV export (Premium PDF)
- **SUB-01** Free/Premium plans, limits enforced by API middleware, mock checkout · **ADM-01** admin console

**Priority — Must:** AUTH-01/02/04, USER-01/02, WAL-\*, TXN-01..04, CAT-01..03, BUD-01/02/04, ALR-01/02, GOAL-\*, RPT-01/02. Everything else is Should/Could.

## 5. Architecture

Modular monolith. One NestJS module per domain under `apps/api/src`: `auth, users, wallets, transactions, categories, budgets, goals, notifications, reports, subscriptions, admin`, plus `common` and `prisma`.

- **Controller → service → repository.** Controllers only validate (Zod pipe) and map DTOs. All business rules live in services. Repositories own Prisma access.
- Shared Zod schemas, enums, `PLAN_LIMITS`, `budgetPeriod` live in `packages/shared` and are the single source of truth for api and web.
- Frontend: `apps/web/src/features/<domain>/` each with pages, components, API hooks, Zod schemas; shared `ui/` (shadcn); routes guarded by auth and role. Server state in TanStack Query, client state in Zustand, forms in React Hook Form + Zod, i18n in i18next (no hard-coded user-facing strings).
- Access token is kept in memory only (never localStorage).
- Guards (apps/api/src/common): `JwtAuthGuard` (Passport JWT; role/status are re-read from the DB on every request, so deleted/locked/demoted users lose access immediately), `RolesGuard` + `@Roles()`, `OwnershipGuard` + `@Owned('wallet'|'transaction'|'budget'|'goal'|'recurringRule')` → 404 for foreign or malformed ids, `RateLimitGuard` (Redis fixed window; `@RateLimit(10,'auth')` on auth routes, default 100/min/user).
- Mail goes through the `MailService` interface only (`MAIL_TRANSPORT=console|ses`). Never call SES/SMTP directly.

## 6. API conventions

- Base `/api/v1`; Swagger at `/api/docs`; health at `/health` (unprefixed).
- Success `{ data, meta: { page, limit, total } }` (meta on lists). Error `{ error: { code, message, details } }` with the correct HTTP status.
- Plan limit → **403 `PLAN_LIMIT_REACHED`** via `assertWithinPlan`.
- Pagination `page`/`limit` (max 100)/`sort`. ISO 8601 dates. Query strings are validated strictly like bodies: unknown params are 400.
- Declare request validation with `@ZBody(Schema)` / `@ZQuery(Schema)` (common/swagger.ts): the SAME Zod schema validates the request and generates the OpenAPI schema. Document responses with `@ApiData(OutSchema)` / `@ApiNoContent()` / `@ApiErrors(...)`; the `*Out` schemas live in `packages/shared/src/api.ts` and integration tests assert real responses against them (`expectShape`), so docs cannot drift from behaviour.
- After adding or changing ANY endpoint run `npm run openapi -w @smartwallet/api` (needs Postgres + Redis env) and commit `apps/api/openapi.json`; `test/openapi.int-spec.ts` fails if a served route is undocumented or the file is stale.
- Plan limits and premium features are enforced by `PlanLimitGuard` (`@PlanLimit('max_wallets'|'max_budgets'|'max_goals')`, `@PremiumOnly('feature')`) reading `plans.limits`; services never hard-code limits.
- Rate limit 100 req/min per user; 10 req/min per IP on auth routes (`@RateLimit`, Redis-backed; 429 `RATE_LIMITED` + `Retry-After`).

## 7. Security rules

- Every query filters by `user_id` taken from the **JWT**, never from the body/query.
- Other users' resources return **404**, not 403 (ownership check, e.g. `WalletsService.getOwned`).
- bcrypt cost 12. Refresh tokens stored hashed (sha256), rotated on use, revoked on logout and password change.
- Cookie `httpOnly; Secure; SameSite=Strict` (`COOKIE_SECURE=false` only for local HTTP dev). Helmet on. CORS limited to `APP_URL`. HTTPS only in production.
- Validate every DTO with Zod in strict (whitelist) mode via `ZodPipe`.
- Sanitize CSV import against formula injection (prefix cells starting with `= + - @` with `'`).
- Uploads: images ≤ 5 MB, private S3 bucket, pre-signed URLs only.
- Audit log for logins, password changes and admin actions (`AuditService`; currently structured logs because the 14-table schema has no audit table — see Known gaps).
- Never commit secrets; only `.env.example` is tracked.

## 8. Non-functional targets

p95 < 300 ms CRUD and < 800 ms reports at 200 concurrent users · dashboard LCP < 2.5 s on 4G · alert visible in-app < 2 s after save · add a transaction in ≤ 3 taps from any screen · responsive from 360 px · WCAG 2.1 AA · service test coverage ≥ 70%.

## 9. Workflow

- Trunk-based; short branches `feature/TXN-01-create-transaction`.
- Conventional Commits with the requirement ID as scope: `feat(TXN-01): create transaction`.
- PRs need green CI (lint, type-check, unit, integration, build).
- Commands: `npm install`; `npm run build:shared` (required after editing `packages/shared`); `npm run typecheck|lint|test|test:integration|build`; `docker compose up --build` (api :3000, web :5173).
- Database: 14 tables, UUID PKs, `created_at/updated_at` everywhere, `deleted_at` on all user-owned tables. Schema changes = edit `schema.prisma` then create a migration (`npx prisma migrate dev --name <req-id>-<what>` against a dev DB); CHECK constraints and partial indexes are hand-written in the migration SQL because Prisma cannot express them. Never use `db push`. `docker compose up` runs `migrate deploy` + idempotent seed (plans, categories, rules, admin, demo user).
- Seeded dev logins: `admin@smartwallet.local` / `Admin@12345`, `demo@smartwallet.local` / `Demo@12345` (override with SEED_* env; in production SEED_ADMIN_PASSWORD is required and the demo user is skipped).
- Unit tests (`src/**/*.spec.ts`) use mocks (`src/testing/mocks.ts`) and transpile-only ts-jest; types are checked by `npm run typecheck`.
- Integration tests: `apps/api/test/*.int-spec.ts`, real Postgres + Redis, helpers in `test/helpers.ts`. Locally: create DB `smartwallet_test`, then `DATABASE_URL=postgresql://smartwallet:change-me@localhost:5432/smartwallet_test?schema=public REDIS_URL=redis://localhost:6379/1 npm run test:integration -w @smartwallet/api`. Every Must requirement needs both a unit and an integration test (happy + error path).

## 10. Never do

- Never store money as float.
- Never trust `user_id` from the request.
- Never put business logic in controllers.
- Never show admins individual transactions (no admin endpoint may return transaction rows).
- Never send the same threshold alert twice in a period.
- Never skip tests for a Must requirement.

## 11. Frontend track (apps/web)

- Current phase: **only `apps/web` is changed; `apps/api` is frozen.** If the UI needs something the API lacks, mock it in `apps/web/src/mocks/extra-handlers.ts` and add a row to `docs/backend-requests.md`.
- Read `docs/frontend-guide.md` before touching UI: tokens live in `src/styles/tokens.css` (CSS variables, light + `.dark`), components in `src/ui`, no raw hex colours or hard-coded user-facing strings (i18next, `vi` default).
- Run with mocks: `npm run dev:mock -w @smartwallet/web` (`VITE_USE_MOCKS=true`, MSW serves every contract endpoint with realistic VND data; demo logins on the login page). Design-system showcase: `/dev/ui` (dev/mock builds only; the production build has neither it nor the MSW worker, see `vite.config.ts` `dropMockWorker` and `router.tsx` `DEV_TOOLS`). `?theme=dark|light` and `?lang=vi|en` override without persisting.
- Mock handlers validate with the SAME shared Zod schemas as the API; keep them in step with `apps/api/openapi.json`.
- Money in the UI: `AmountText` / `formatMoney` only (tabular digits, real minus sign, never colour-only status). Status = icon + text. Budget bar: calm < 80, warning >= 80, over >= 100.
- Check layouts at 360 / 768 / 1440 px in both themes before calling UI work done (no horizontal scroll at 360).
- Routes: `/` landing (signed-in users go to `/dashboard`), `/login /register /check-email /verify-email /forgot-password /reset-password /auth/callback` public, `/onboarding` (USER-02, required before any app route), `/about` and the other public pages, `/dashboard /transactions /budgets /goals /reports /notifications /settings` app (plus wallets, categories, plans), `/admin`, `/dev/ui` (dev/mock only).
- Real API from the web dev server: `MSYS_NO_PATHCONV=1 VITE_USE_MOCKS=false VITE_API_URL=/api/v1 npx vite` (Vite proxies `/api` to :3000; avoids CORS).
- **Parallel build structure (lead = shell, agents = features).** Subagents live in `.claude/agents/` (`screen-builder`, `ui-reviewer`, `test-writer`). A feature agent edits ONLY `apps/web/src/features/<feature>/` and `apps/web/src/locales/{vi,en}/<feature>.json`; everything else is shared and changes through `docs/shared-requests.md`:
  - shell: `src/app` (router, `layouts/AppLayout`, `shell/*` sidebar, top bar with month switcher + bell slot + avatar menu, mobile nav, QuickAdd slot, `PlanLimitDialog`), `src/ui`, `src/api` (typed hooks per endpoint) + `src/lib/api`, `src/lib/queryKeys.ts`, `src/mocks` (MSW; `coverage.test.ts` fails if an API operation has no handler), `src/stores`, `src/i18n`, `src/features/common`.
  - a feature folder holds `page.tsx` (default export, lazy-loaded by the router) and `index.ts` (what the shell may import: `quick-add` exports `QuickAdd`, `notifications` exports `NotificationBell`, `plans` exports `PlanLimitDialogContent`). Features: dashboard, transactions, wallets, categories, budgets, goals, reports, settings, plans, admin, quick-add, notifications.
  - strings: the default namespace is shell-owned; each feature has its own i18next namespace = file name (`useTranslation('budgets')`).
  - the top-bar month is `usePeriod()` (`apiPeriod` goes straight into the hooks); a 403 PLAN_LIMIT_REACHED from any hook opens the global plan dialog (copy in the `plans` namespace); `N` opens quick-add.
  - UI review without a browser tool: `node apps/web/scripts/browser-probe.mjs --base <url> --paths /budgets --as linh --out .cache/review` (screenshots at 360/768/1440, light/dark, plus overflow, raw i18n keys and console errors).
- Root shortcuts: `npm run web:mock` (demo, no backend), `npm run web:real` (Vite proxy to the API on :3000), `npm run build -w @smartwallet/web` (production), `npm run build:mock` + `preview:mock -w @smartwallet/web` (production-like mock build on :4173). Setup, demo accounts and e2e commands: README.md "Run the frontend"; presentation: docs/demo-script.md.
- **Backend hand-over:** the frontend track is done and `apps/api` was never touched. Backend owners start at `docs/backend-handoff.md` (priorities, contract points the UI relies on, how to run the web against the API), then `docs/backend-requests.md` (`BR-01`..`BR-34`: every endpoint the UI mocked or worked around). When an item ships: build it, `npm run openapi -w @smartwallet/api`, delete its MSW handler and the UI workaround, un-skip its `BR-nn` e2e, mark the row `shipped`.
- Branding/UI work in `apps/web` follows the project skill `.claude/skills/smartwallet-brand/SKILL.md`.
- Tests: `npm test -w @smartwallet/web` (vitest: format helpers, API client refresh/error mapping, thresholds).

## Known gaps (update as they close)

Implemented + tested (unit + Supertest): AUTH-01..05, USER-01..03, WAL-01/02, TXN-01..06, CAT-01..04 (auto-categorization with learning), BUD-01..04 (periods, templates, rollover), ALR-01..03 (alert engine, Socket.IO, email queue, weekly summary, goal checks), GOAL-01/02, RPT-01..03 (dashboard, by-category, trend, daily, CSV export), SUB-01, admin stats/users. Web (done, mock + real API): landing, About, auth, onboarding, dashboard (incl. saving-streak card), quick add with alerts, transactions (filters, recurring, CSV import), wallets, categories, budgets (templates, rollover), goals, notifications + Socket.IO bell, reports, settings, plans/mock checkout, admin console. Parts that need new endpoints are mocked or worked around: see docs/backend-requests.md.

Not yet built: reports PDF export (CSV only), per-wallet reports, sub-category roll-up in by-category, learning from CSV-import overrides, admin editing of default categories/keywords (ADM-01), a delete-all-personal-rules / rule management UI, resend-verification and change-password endpoints, real SES / Google / S3 smoke tests with credentials, a Redis-backed Socket.IO adapter test with two instances, push notifications (mobile web), goal contributions moving wallet money.

Open questions for the product owner: (1) `audit_logs` is not among the 14 tables, so audit events are logged, not stored. (2) Schema additions beyond the 14-table spec: `recurring_rules.type`, `budgets.rollover_amount` (BUD-03 idempotency), `users.notification_settings` (ALR-02 mutes), plus the partial unique index on personal `category_rules`. (3) Login is blocked until the email is verified. (4) TXN-02 is ONE row (`wallet_id` -> `transfer_wallet_id`), not two linked rows: the specified schema cannot encode direction on two rows. (5) Wallet delete cascades to its transactions. (6) Alerts say "82% of {category name} used": with the seeded category that reads "82% of Food & Drinks used". (7) "20% behind schedule" is implemented as: saved is more than 20% below the straight-line target for today.
