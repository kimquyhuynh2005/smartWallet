# Backend requests (from apps/web)

`apps/api` was frozen for the whole frontend track, so everything the UI needed beyond the shipped contract is either **mocked** (MSW, `apps/web/src/mocks/extra-handlers.ts` and `more-handlers.ts`) or **worked around** in the UI. This file is the hand-over list for the backend owner. Last full review: 2026-11-24, after the real-API click-throughs and the Playwright runs against `VITE_USE_MOCKS=false`.

Start with [backend-handoff.md](backend-handoff.md) for the priority order (P1/P2/P3) and the contract points the UI relies on. Rows use the `BR-nn` ids; BR-34 (saving streak) was added last.

## How to pick an item up

1. Build the endpoint, run `npm run openapi -w @smartwallet/api` and commit `apps/api/openapi.json`.
2. In `apps/web`: delete the matching handler from `src/mocks/extra-handlers.ts` / `more-handlers.ts` (the web `coverage.test.ts` fails if an OpenAPI operation has no handler, so for a NEW operation keep a handler until the web calls the real one; for an endpoint that stays mock-only delete it when the API ships it and re-run `npm test -w @smartwallet/web`).
3. Un-skip the `test.fixme` / quiet-state assertions that name the item id (`BR-nn`) in `apps/web/e2e/` and run `npm run e2e:real -w @smartwallet/web` (needs the API on :3000).
4. Tick the row below (status `shipped`) and delete the workaround code named in the last column.

Every screen already degrades quietly (no retry storm, no error toast) while an endpoint answers 404, so items can ship in any order.

## Master list

Status: **mocked** = exists only in MSW; **workaround** = the UI does something client-side instead; **proposal** = nothing is built on either side; **ok** = no change needed (FYI).

### A. Endpoints the real API does not have (mocked in the web)

| ID | Endpoint (proposed) | Used by | Behaviour on the real API today | Old ref | Status |
|----|--------------------|---------|----------------------------------|---------|--------|
| BR-01 | `GET /subscriptions/me` -> `{plan, limits, usage:{wallets,budgets,goals}, currentPeriodEnd}` (or `planLimits` on `GET /me`) | plan dialog ("3/3 ví"), /plans usage, budgets header | 404: falls back to the profile plan and the static Free limits | #1, #15, B, C2 | mocked |
| BR-02 | `GET /goals/:id/contributions` (paginated) and `GET /goals/:id` | goal detail timeline | 404: "no contribution history yet" empty state; detail picks the goal from the list | #2, C | mocked |
| BR-03 | `POST /auth/resend-verification {email}` | check-email, login | button hidden in real mode; an expired 24 h link strands the user | #7 | mocked |
| BR-04 | `POST /me/password {currentPassword,newPassword}`; wrong current password = 400 `WRONG_PASSWORD`; revoke other refresh tokens | settings > security | 404: tab shows a quiet "not available" note | #8, S1 | mocked |
| BR-05 | `GET /me/sessions`, `DELETE /me/sessions/:id`, `POST /me/sessions/revoke-others` (device, place, last active, `current`) | settings > security | 404: quiet note | S2 | mocked |
| BR-06 | `POST /subscriptions/cancel` (Premium -> Free at period end, data kept) | /plans | 404 (mock checkout/cancel only) | S3 | mocked |
| BR-07 | `POST /me/avatar/upload-url` (pre-signed, like receipts) | settings > profile | not built; UI offers preset avatars as data URLs in `avatarUrl` | #9, S4 | workaround |
| BR-08 | `GET /reports/top-notes?period=&type=&limit=` -> `{period, items:[{note,count,total}]}` | reports | 404: card says it is not available | R1, C1 | mocked |
| BR-09 | `GET /reports/by-category?rollup=parent` and a `walletId` filter on `/reports/*` | reports donut, "how much with MoMo?" | not built; flat categories only | #10, #11, R2 | proposal |
| BR-10 | `PATCH /admin/users/:id {status?, plan?}` and `GET /admin/users?q&page&limit` | admin users (lock, unlock, change plan, search) | 404: users list (flat 100) works; lock/plan actions do nothing useful | #5, A1 | mocked |
| BR-11 | `GET /admin/stats/growth?months=` -> `{months, points:[{period,newUsers,totalUsers,premium}]}` | admin overview charts | 404: quiet panel | A2, C4 | mocked |
| BR-12 | `GET/POST/PATCH/DELETE /admin/categories` (default categories, `user_id` NULL) | admin > categories | 404: quiet panel | #6, A3 | mocked |
| BR-13 | `GET/POST/DELETE /admin/category-rules` (global keywords; the categorizer reads them) | admin > keywords | 404: quiet panel | A4 | mocked |
| BR-14 | `GET /admin/plans`, `PATCH /admin/plans/:code {limits}` (`plans.limits` JSONB, null = unlimited) | admin > plans | 404: quiet panel | A5 | mocked |
| BR-15 | `GET /notifications/unread-count` | none (the bell reads `meta.total` of `?unread=true&limit=1`) | optional, saves one small query | #3 | ok (unused mock) |
| BR-34 | `GET /reports/streak` -> `{current, best, lastDay}`: consecutive Vietnam days (ending today) whose total EXPENSE spending was <= the daily safe amount (total budget limit / days of the period; transfers and income ignored; days before the first expense do not count; best = longest run in the last 60 days; `lastDay` = last qualifying day or null) | dashboard saving-streak card | 404: the card computes the same rule client-side from `GET /transactions?type=EXPENSE&from=` (last 60 days, up to 5 pages) and the total budget of the dashboard; the 7-day dots are always client-side | new | mocked + workaround |

### B. Changes to endpoints or fields that exist

| ID | Change | Why | Workaround in the web (delete when shipped) | Old ref | Status |
|----|--------|-----|----------------------------------------------|---------|--------|
| BR-16 | Template **dry run**: `POST /budgets/apply-template {dryRun:true}` and on `POST /me/onboarding` | previews before committing; the real split uses 3 months of history, the preview is an even split | `src/lib/templates.ts` (port of `planTemplate`/`splitByRatio`), pinned by `templates.test.ts` | #4, #17 | workaround |
| BR-17 | Onboarding body accepts edited amounts / custom percentages (`budgets:[{categoryId,limitAmount}]`) | today only `50_30_20`, `6_JARS`, `NONE` | wallet with `NONE`, then `POST /budgets` row by row (not one DB transaction) | #18 | workaround |
| BR-18 | Pause/resume recurring: `isActive` on `recurring_rules` + `PATCH` | TXN-05 asks for pause | UI offers edit + delete only | tx #1 | workaround |
| BR-19 | Restore a soft-deleted transaction (`POST /transactions/:id/restore`) | UNDO toast | row hidden, real `DELETE` delayed 5 s (lost if the tab closes) | tx #2 | workaround |
| BR-20 | CSV confirm: per-row category override `rows:[{line,categoryId}]`; confirm that a signed amount without a `type` column reads as EXPENSE and document the headers | preview is read-only today; help text must match the parser | read-only preview, help text describes `date,amount,note` | tx #3, #6 | workaround / to confirm |
| BR-21 | `GET /categories/:id/impact` -> `{children,budgets,rules,transactions}` | delete-category dialog has no numbers | counts sub-categories from the list only | tx #4 | workaround |
| BR-22 | `includeChildren=true` (or family semantics) on `GET /transactions?categoryId=` | category detail needs the category and its sub-categories | one query per family member, merged client-side | budgets 4 | workaround |
| BR-23 | `previous:{income,expense,net}` on `GET /reports/dashboard` | "up/down X vs previous period" | derived from `trend[]`; hidden when the previous point is missing | dashboard | workaround |
| BR-24 | `q` on `GET /transactions` accent-insensitive (`unaccent`): "ca phe" finds "cà phê" | search | the mock filters client-side only | #16 | proposal |
| BR-25 | ADMIN accounts count as onboarded (`GET /me` `onboarded:true` for role ADMIN) | an admin has no wallet, so they were sent to the onboarding wizard after login | `RequireOnboarded` sends admins to `/admin` | C6 | fixed in UI, API suggestion |
| BR-26 | Notification text per language: the stored `message` is Vietnamese only ("Đã dùng 88% ngân sách Ăn uống"). Add `messageEn`, or a `messageKey` + params; keep `payload.percentUsed` and `payload.categoryId` (null = total budget) and `TriggeredAlert.id` equal to the later `notification:new` id | English UI showed a Vietnamese headline | the UI builds the title from `percentUsed` + category name (falls back to the stored message) | review 2026-11 | workaround |
| BR-27 | `GET /admin/users` always returns one shape (`{data:[...]}` or `{data:{items}}` depending on the build) | helper tolerates both | tolerant parsing | #21 | FYI |
| BR-28 | Premium price in `plans` (placeholder `PREMIUM_PRICE_VND = 49_000` in `pages/landing/Sections.tsx` and `features/plans/constants.ts`) | product owner decision | constant | #19 | placeholder |
| BR-29 | `GET /reports/export?format=pdf` (Premium, RPT-03) and `DELETE /transactions/:id/receipt` (also deletes the S3 object) | not built | none / PATCH `receiptKey:null` | #14, #12 | proposal |
| BR-30 | Google sign-in smoke test with real credentials (`/auth/google` answers 501 when unconfigured; callback `APP_URL/auth/callback`) | untested with Google | UI probes and shows a message | #20 | UI ready |

### C. Testing support

| ID | Request | Why |
|----|---------|-----|
| BR-31 | A way to read the email-verification / reset link in non-production (for example `MAIL_TRANSPORT=console` also writing to a `GET /dev/mail/:email` endpoint guarded by `NODE_ENV!=='production'`, or a seed switch `SEED_VERIFIED=true` for fresh test users) | login is blocked until the email is verified and the console transport only logs the link, so the register -> onboarding E2E cannot run against the real API (it is `test.fixme` there; it runs on mocks) |
| BR-32 | A seeded Premium user (`premium@smartwallet.local`) next to `demo` (Free) and `admin` | the Premium-only paths (12-month trend, CSV export, import) are only testable on mocks (`minh@smartwallet.demo`) |
| BR-33 | Idempotent test reset for the dev database (script or `POST /dev/reset`) | real-API E2E mutates the shared demo account; tests restore what they change, but a reset would make runs repeatable |

### D. Contract notes (no change requested)

- Money is a JSON integer (VND); the web never uses floats.
- `GET /wallets` hides archived wallets unless `includeArchived=true`; the web passes it on the wallet management screen.
- `POST /transactions` returns `triggeredAlerts`; the web shows them inline and also listens to `notification:new` (deduplicated by notification id).
- The refresh cookie path is `/api/v1/auth`, `SameSite=Strict`: SPA and API must be same-site in production. Locally the API only allows CORS from `APP_URL` (`http://localhost:5173`), so the web dev server proxies `/api` to `:3000` (`MSYS_NO_PATHCONV=1 VITE_USE_MOCKS=false VITE_API_URL=/api/v1 npx vite`).
- Socket.IO: namespace `/ws`, `auth:{token}`, events `notification:new`, `budget:updated`; the API must allow the web origin with credentials (`VITE_WS_URL`).
- Goal contributions do not move wallet money yet (CLAUDE.md known gap); the contribute dialog says it only records the amount in the goal.

---

# Details and history by area (original notes, kept for context)


| # | Need | Proposed endpoint / change | Why the UI needs it | Status |
|---|---|---|---|---|
| 1 | Current plan, limits and usage | `GET /subscriptions/me` → `{ plan: 'FREE'\|'PREMIUM', limits: { max_wallets, max_budgets, max_goals, history_months }, usage: { wallets, budgets, goals } , currentPeriodEnd }` | The upgrade dialog on `PLAN_LIMIT_REACHED` says *"3/3 wallets"*; plan badge in the header. `GET /me` only has `plan`. | mocked |
| 2 | Goal contribution history | `GET /goals/:id/contributions` (paginated) | Goal detail shows the savings timeline; today only the sum is available. | mocked |
| 3 | Unread notification count | none needed now: the UI reads `meta.total` of `GET /notifications?unread=true&limit=1`. A dedicated `unread-count` would only save one tiny query. | Bell badge. | covered by the existing API (an unused `unread-count` mock exists) |
| 4 | Template preview | `POST /budgets/apply-template` with `dryRun: true` (returns the plan without writing) | Onboarding and budget screens show "this is what you'll get" before committing. | not built |
| 5 | Admin user management | `PATCH /admin/users/:id` `{ status, plan }`, `GET /admin/users?page&limit&q` pagination + search | ADM-01 console: lock/unlock, change plan, find a user. Today only a flat list of 100. | not built |
| 6 | Admin default categories & keywords | `GET/POST/PATCH/DELETE /admin/categories`, `/admin/category-rules` | ADM-01 requires editing default categories and keywords. | not built |
| 7 | Resend verification email (mocked for the demo; in real mode the UI hides the button) | `POST /auth/resend-verification` | An expired 24 h link currently strands the user (only reset-password recovers). | not built |
| 8 | Change password (logged in) | `POST /me/password` `{ currentPassword, newPassword }` | Settings → Security; must revoke other sessions. | not built |
| 9 | Avatar upload | `POST /me/avatar/upload-url` (pre-signed, same pattern as receipts) | Profile (USER-01) has `avatarUrl` but no way to upload. | not built |
| 10 | Sub-category roll-up in reports | `GET /reports/by-category?rollup=parent` | Donut chart should show Food ↔ Coffee as one slice. | not built |
| 11 | Per-wallet report filter | `walletId` param on `/reports/*` | "How much did I spend with MoMo?" (Linh's main question). | not built |
| 12 | Receipt removal | `DELETE /transactions/:id/receipt` | Today receipt can only be replaced via PATCH `receiptKey: null`. Works, but a dedicated endpoint would also delete the S3 object. | not mocked |
| 13 | Socket.IO CORS/URL | Document `WS` origin: namespace `/ws`, `auth: { token }`, events `notification:new`, `budget:updated` | Web connects to `VITE_WS_URL`; must allow the web origin and credentials. | contract already implemented |
| 14 | PDF export | `GET /reports/export?format=pdf` (Premium) | RPT-03 mentions Premium PDF; only CSV exists. | not mocked |
| 15 | `GET /me` plan details | add `planLimits` to `GET /me` | Would replace #1 for most screens. | proposal |
| 16 | Transaction search diacritics | `q` on `GET /transactions` should be accent-insensitive (`unaccent`) | Typing "ca phe" must find "cà phê". Today the match is case-insensitive only. | client filters in mock |

## Contract observations (no change requested, FYI)
- Money is a JSON integer (VND). The web never uses floats for money.
- `GET /wallets` hides archived wallets unless `includeArchived=true`; the web passes it on the wallet management screen.
- `POST /transactions` returns `triggeredAlerts`; the web shows them inline and still listens to `notification:new` (the same alert is deduplicated by notification id).
- Refresh cookie path is `/api/v1/auth`, `SameSite=Strict`: the SPA and API must be same-site (same registrable domain) in production.


## Added with the landing / auth / onboarding work

| # | Need | Proposal | Status |
|---|---|---|---|
| 17 | Template **dry run** for the onboarding preview (#4 again, now in use) | `POST /budgets/apply-template {dryRun:true}` and the same on `POST /me/onboarding`. Until then the wizard previews with `apps/web/src/lib/templates.ts`, a port of `planTemplate` / `splitByRatio` (even split, whole thousands, Free-plan cut). **Delete the port when the API has dry run**; a unit test pins the numbers. | client-side port |
| 18 | Onboarding with edited amounts / custom percentages | `POST /me/onboarding` only accepts `50_30_20`, `6_JARS`, `NONE`. For an edited or custom plan the wizard creates the wallet with `NONE`, then `POST /budgets` row by row (not one DB transaction). Suggest an optional `budgets: [{categoryId, limitAmount}]` (or `groups`) in the onboarding body. | workaround in UI |
| 19 | Premium price | The pricing section shows `PREMIUM_PRICE_VND = 49_000` (`pages/landing/Sections.tsx`) as a placeholder. Product owner to decide; ideally `plans` exposes it. | placeholder |
| 20 | Google sign-in | `GET /auth/google` answers 501 when not configured: the UI probes it and shows a message instead of a JSON page. The callback redirects to `APP_URL/auth/callback` (the UI route exists). Needs real credentials to smoke test. | UI ready, untested with Google |
| 21 | `GET /admin/users` shape | Returned either `{data:[...]}` or `{data:{items}}` depending on the build; the E2E helper tolerates both. Please keep one. | FYI |

Local real-API runs: the API only allows CORS from `APP_URL` (`http://localhost:5173`). The web dev server therefore proxies `/api` to `localhost:3000` (`vite.config.ts`), run with `VITE_USE_MOCKS=false VITE_API_URL=/api/v1` (set `MSYS_NO_PATHCONV=1` in Git Bash or the path is rewritten).


## From the feature builds (dashboard, quick-add/notifications, transactions/wallets/categories, budgets/goals)

### budgets

#### Backend / mock notes from the budgets + goals screens

1. Template dry run (docs/backend-requests.md #4/#17): the template dialog previews with `apps/web/src/lib/templates.ts` (even split). The real `POST /budgets/apply-template` splits by the last 3 periods of spending, so applied amounts can differ from the preview; the dialog says so. A `dryRun: true` flag would remove the gap.
2. Mock `apply-template` splits evenly and does not use spending history; the real API does (see 1).
3. Rollover only carries budgets whose `rolloverMode` is `CARRY_FORWARD`. The UI exposes this as a per-budget switch (PATCH /budgets/:id `{ rolloverMode }`) and explains it in the rollover dialog.
4. `GET /transactions?categoryId=` : the category detail page needs the category AND its sub-categories. The mock filters by exact id only, so the page runs one query per family member (parent + children, limit 100 each) and merges them. A `includeChildren=true` param (or family semantics on `categoryId`) would need one call and real pagination.
5. Goal history (`GET /goals/:id/contributions`) is still the mocked endpoint (#2). There is also no `GET /goals/:id`: the goal detail reads the list and picks the goal.
6. Goal contributions do not move wallet money yet (CLAUDE.md known gap); the contribute dialog says it only records the amount in the goal.

### dashboard

| What | Why | Workaround used |
|------|-----|-----------------|
| `GET /reports/dashboard` has no previous-period comparison (income/expense/net of the period before) | Dashboard shows "up/down X vs previous period" | Derived from `trend[]` in the same response: the point just before the one whose `period` equals `period.label`. Needs the trend to include at least 2 periods; if the previous point is missing the delta is simply hidden. A `previous: { income, expense, net }` field would make it exact. |
| Dashboard `budgets[]` rows carry no `categoryId` links to category names for sub-categories beyond the categories list | Rows resolve names through `useCategories()` | No change needed; noted only. |

### quick-add

#### quick-add / notifications (frontend assumptions to confirm)

- Notification `payload` keys used for links: budget notifications `categoryId` (null/absent = total budget), goal notifications `goalId`. Please keep them in the real API and the mocks.
- `TriggeredAlert.id` is assumed to equal the later `notification:new` id (the socket de-duplication via `seenAlertIds` relies on it).
- Receipt upload: with mocks on the S3 POST is skipped (the mock upload URL does not exist); with the real API the file is posted directly to the pre-signed `url` with `fields` first and `file` last.

### transactions

#### Backend requests from the transactions / wallets / categories feature agent

| # | Need | Proposal | Why | Status |
|---|---|---|---|---|
| 1 | Pause / resume a recurring rule | `isActive` boolean on `recurring_rules` (`PATCH /recurring-rules/:id { isActive }`, generator skips inactive rules). | TXN-05 asks for pause; the contract only has create / edit / delete, so the UI offers edit + delete only. | not built |
| 2 | Restore a soft-deleted transaction | `POST /transactions/:id/restore` (or accept `DELETE` with an `Idempotency-Key` that can be cancelled). | The UNDO toast cannot call anything after the DELETE. The UI hides the row and delays the real `DELETE` by 5 s instead; if the tab closes inside those 5 s the delete is lost (the row simply stays). | workaround in UI |
| 3 | Per-row category override on CSV confirm | `POST /transactions/import/:id/confirm` body `rows: [{ line, categoryId }]`. | Preview rows carry a suggested `categoryId`; the user cannot change it before importing, so the preview shows it read-only. Also lets CAT-04 learn from import corrections. | not built |
| 4 | Impact of deleting a category | `GET /categories/:id/impact` -> `{ children, budgets, rules, transactions }`. | The delete dialog can only count sub-categories (from the list); it says budgets and rules are removed without numbers. | not built |
| 5 | Transaction count of a wallet | none needed: the UI reads `meta.total` of `GET /transactions?walletId=&limit=1` (includes transfers touching the wallet) for the "delete wallet" confirmation. | FYI | covered |
| 6 | CSV sample format | The UI describes `date,amount,note` with negative = spending (what the mock parses). The real parser (`apps/api/src/transactions/csv.ts`) maps headers date/amount/note/type/category by name (en + vi); please confirm that a signed amount is read as EXPENSE when there is no `type` column. | The help text on `/transactions/import` must match the API. | to confirm |


## Real-API click-through (VITE_USE_MOCKS=false, 2026-11-23)

Walked dashboard, quick add, transactions (+ filter, recurring, import), wallets (+ detail, create), categories, budgets (+ category detail, template, rollover), goals (+ detail), notifications as the seeded demo user against the local API (`MSYS_NO_PATHCONV=1 VITE_USE_MOCKS=false VITE_API_URL=/api/v1`, Vite proxy to :3000). No console errors, no schema (Zod) failures, no layout problems. Findings:

| # | Finding | Status |
|---|---------|--------|
| A | Quick add crossing a budget threshold works end to end on the real API: an expense that took Mua sắm from 93.2% to 100% (and one that took Di chuyển to 80%) returned `triggeredAlerts`, the UI showed ONE warning toast with the "Xem ngân sách" action, and the bell / `GET /notifications?unread=true` went 1 -> 2 -> 3. `TriggeredAlert.id` equals the later notification id, so no duplicate toast. | confirmed |
| B | `GET /subscriptions/me` -> 404 (request #1). The plan dialog and the budgets page ask for it; both degrade (the limit number comes from the 403 `details`). Noisy in the network log only. | needs backend (#1) |
| C | `GET /goals/:id/contributions` -> 404 (request #2). The goal detail now says "no contribution history yet, the saved total is correct" instead of a retry error. | needs backend (#2) |
| D | `POST /wallets` as a Free user with 3 wallets -> 403 `PLAN_LIMIT_REACHED` with `{ key: 'max_wallets', limit: 3 }` in `details`: the global dialog opens with the right copy. | confirmed |
| E | `POST /auth/refresh` -> 401 on first load without a cookie, `GET /favicon.ico` 404 (fixed: favicon added). | expected / fixed |
| F | Mock vs real: the mock suggests no category for the note "Shopee mua đồ" (confidence below 0.6) while the real categorizer's behaviour depends on its seeded keywords; the UI only pre-selects at >= 0.6 in both. | FYI |


## Settings, plans, reports, admin (mocked for the build of those screens)

These endpoints exist only in MSW (`apps/web/src/mocks/more-handlers.ts`); the real API has none of them yet. The UI must degrade gracefully when they answer 404 (the screens say so instead of showing a retry error).

| # | Endpoint (proposed) | Used by | Notes |
|---|---------------------|---------|-------|
| S1 | `POST /me/password {currentPassword,newPassword}` (= request #8) | settings > security | wrong current password: 400 `WRONG_PASSWORD`; should revoke the other refresh tokens |
| S2 | `GET /me/sessions`, `DELETE /me/sessions/:id`, `POST /me/sessions/revoke-others` | settings > sessions | list of refresh-token families: device, place, last active, `current` |
| S3 | `POST /subscriptions/cancel` | plans | Premium -> Free at period end, data kept |
| S4 | avatar: `POST /me/avatar/upload-url` (= request #9) | settings > profile | until then only preset avatars (data URLs in `avatarUrl`) |
| R1 | `GET /reports/top-notes?period=&type=&limit=` -> `{period, items:[{note,count,total}]}` | reports | notes grouped by normalised text |
| R2 | `GET /reports/by-category?rollup=parent` (= request #10) and `walletId` filter (= #11) | reports | sub-category roll-up, per-wallet |
| A1 | `PATCH /admin/users/:id {status?, plan?}` (= request #5), `GET /admin/users?q=&page=&limit=` | admin | lock/unlock, change plan; search is client-side until the API paginates |
| A2 | `GET /admin/stats/growth?months=` -> `{months, points:[{period,newUsers,totalUsers,premium}]}` | admin | users over time |
| A3 | `GET/POST/PATCH/DELETE /admin/categories` (= request #6) | admin | default categories (user_id NULL) |
| A4 | `GET/POST/DELETE /admin/category-rules` | admin | global keywords; the categorizer reads them |
| A5 | `GET /admin/plans`, `PATCH /admin/plans/:code {limits}` | admin | `plans.limits` JSONB, null = unlimited |


## Real-API click-through: reports, settings, plans, admin (VITE_USE_MOCKS=false, 2026-11-24)

Demo user (Free) and the seeded admin against the local API (Vite proxy to :3000). No schema failures, no uncaught errors, no layout overflow. Every screen that depends on a mocked-only endpoint showed its quiet "not available on this server" state: no retry buttons, no error toasts.

| # | Finding | Status |
|---|---------|--------|
| C1 | `GET /reports/top-notes` -> 404 (R1): the notes card says it is not available here. The rest of the reports page works on the real endpoints (by-category, trend, daily, export). | needs backend (R1) |
| C2 | `GET /subscriptions/me` -> 404 (#1): plans and the plan dialog fall back to the profile plan and the static Free limits. | needs backend (#1) |
| C3 | `GET /me/sessions` -> 404 (S2) and `POST /me/password` (S1, not exercised): security tab shows a quiet note. | needs backend (S1, S2) |
| C4 | `GET /admin/stats/growth`, `/admin/categories`, `/admin/category-rules`, `/admin/plans` -> 404 (A2-A5): the four panels are quiet; users and stats (real) work (5 users). | needs backend (A2-A5) |
| C5 | Free user: CSV export opens the upgrade dialog without calling the API; the 12-month trend is a locked card (no 403 fired); a category row links to `/transactions?categoryId=&from=&to=&type=EXPENSE` and the list is filtered. | confirmed |
| C6 | An admin has no wallet, so `me.onboarded` is false: after login they were sent to the onboarding wizard. Fixed in the shell (admins go to /admin). Suggest the API treat ADMIN accounts as onboarded. | fixed in UI |
