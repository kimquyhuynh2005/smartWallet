# Backend hand-over (what the frontend needs from `apps/api`)

Audience: whoever owns `apps/api` after the frontend track (it was frozen the whole time). Read this first, then [backend-requests.md](backend-requests.md) (the numbered list, `BR-01`..`BR-34`) and [CLAUDE.md](../CLAUDE.md) (domain rules, still the source of truth for the API).

Status at 2026-11-24: the web app is feature-complete against the **shipped** contract and runs end to end on the real API (click-throughs and Playwright `real-*` projects). Everything it needed beyond the contract is **mocked** in MSW or **worked around** in the UI. Nothing in `apps/api` was changed.

## 1. How to see what the web does against your API

```bash
docker compose up --build            # Postgres + Redis + API :3000 (migrate deploy + idempotent seed)
curl localhost:3000/health           # {"status":"ok"}
npm run web:real                     # web on :5173, Vite proxies /api -> :3000 (no CORS setup needed)
```

Seed logins: `demo@smartwallet.local` / `Demo@12345` (Free), `admin@smartwallet.local` / `Admin@12345`. Mock-only logins (`linh`, `minh`, `admin@smartwallet.demo`) do **not** exist on the real API (BR-32 asks for a seeded Premium user).

- `npm run e2e:real -w @smartwallet/web` runs the Playwright suite against your API (about 20 minutes: logins are paced 30 s apart because auth routes allow 10 requests/min/IP).
- Docker note: the `web` container mounts only `src/`, so its `node_modules` is the one from the image. After a dependency change run `docker compose down -v && docker compose up --build`, or just use `npm run web:real` on the host.
- Env the web reads: `VITE_USE_MOCKS`, `VITE_API_URL` (`/api/v1` through the proxy), `VITE_WS_URL` (Socket.IO origin), `VITE_MOCK_LATENCY`.

## 2. The rules the frontend relies on (do not break these)

| Contract point | Used by |
|---|---|
| Success `{data, meta}`, error `{error:{code,message,details}}`; money is a JSON integer | the API client, every Zod schema from `packages/shared` |
| `POST /transactions` returns `triggeredAlerts`; `TriggeredAlert.id` equals the later `notification:new` id | alert toast, de-duplication of the socket event |
| Notification `payload.categoryId` (null = total budget), `payload.percentUsed`, `payload.goalId` | links and the English alert title (BR-26) |
| `403 PLAN_LIMIT_REACHED` with `details:{key,limit}` (`max_wallets`, `max_budgets`, `max_goals`) | the global plan dialog (copy and "3/3" counter) |
| `429 RATE_LIMITED` + `Retry-After` | login form message |
| Refresh cookie `httpOnly`, path `/api/v1/auth`, `SameSite=Strict`; access token kept in memory only | silent refresh on first load (a 401 there is normal) |
| Socket.IO `/ws`, `auth:{token}`, events `notification:new`, `budget:updated`, CORS allows the web origin with credentials | bell + live budgets |
| `GET /wallets` hides archived unless `includeArchived=true` | wallet management |
| Budget period addressed as `YYYY-MM` (month the period starts in), boundaries in Asia/Ho_Chi_Minh | the top-bar month switcher |

Mock handlers validate with the **same** shared Zod schemas, and `apps/web/src/mocks/coverage.test.ts` fails if an OpenAPI operation has no handler. So: change an endpoint -> `npm run build:shared`, `npm run openapi -w @smartwallet/api`, commit `openapi.json`, then run `npm test -w @smartwallet/web`.

## 3. Priority order for the backend (what to build first)

**P1: unblocks the real-API demo, tests and correctness**

| Item | Why first |
|---|---|
| BR-01 `GET /subscriptions/me` (plan, limits, usage) | the plan dialog, /plans and the budgets header all call it and 404 today |
| BR-31 / BR-32 / BR-33 (dev mail endpoint or `SEED_VERIFIED`, seeded Premium user, test reset) | the register -> onboarding E2E and every Premium-only path can only run on mocks (`test.fixme` in `e2e/part1-auth-onboarding.spec.ts`) |
| BR-25 admins count as onboarded | the shell works around it today |
| BR-26 notification text per language (`messageEn` or key + params) | English UI otherwise builds the title client-side |
| BR-03 resend verification, BR-04 change password | an expired 24 h link strands a user; security tab is empty |
| BR-10 `PATCH /admin/users/:id`, search/pagination | admin lock and plan change are mock-only (`test.fixme` in `e2e/part2-admin.spec.ts`) |

**P2: product features the UI is ready for**

BR-02 goal contributions history, BR-05 sessions, BR-06 cancel subscription, BR-08 top notes, BR-11 admin growth, BR-12/13/14 admin categories, keywords and plans, BR-34 saving streak, BR-16/17 template dry run and edited onboarding budgets (also removes `apps/web/src/lib/templates.ts`), BR-19 restore transaction (removes the 5 s delayed delete).

**P3: polish and proposals**

BR-07, 09, 18, 20, 21, 22, 23, 24, 29, 30. BR-15, 27 and 28 are FYI or a product decision (Premium price is a placeholder, `49_000` VND, in `pages/landing/Sections.tsx` and `features/plans/constants.ts`).

Known open question that changes the API: goal contributions do not move wallet money (CLAUDE.md known gap); the contribute dialog says it only records the amount in the goal.

## 4. How the web degrades while an endpoint is missing

A 404 from a mocked-only endpoint never shows an error toast or a retry loop: the screen shows a quiet "not available on this server" state or a client-side computation (the BR table lists each one in the column "Behaviour on the real API today"). Items can therefore ship in any order. To pick one up follow the four steps at the top of [backend-requests.md](backend-requests.md) (build + openapi, delete the MSW handler, un-skip the `BR-nn` E2E, delete the workaround).

## 5. Where things live in the web app

| Need | Place |
|---|---|
| Typed endpoint functions, query hooks, keys | `apps/web/src/lib/api/endpoints.ts`, `src/api/*`, `src/lib/queryKeys.ts` |
| MSW handlers: contract / extras / more | `src/mocks/handlers.ts`, `extra-handlers.ts`, `more-handlers.ts`; demo data in `src/mocks/seed.ts` |
| Client-side stand-ins for missing API parts | `src/lib/templates.ts` (template preview), `features/dashboard/streak.ts` (BR-34), delayed delete in `features/transactions` (BR-19) |
| UI rules, tokens, components | [frontend-guide.md](frontend-guide.md), `.claude/skills/smartwallet-brand/` |
| Requests from feature work to the shell | [shared-requests.md](shared-requests.md) |
| Demo walkthrough and accounts | [demo-script.md](demo-script.md), `apps/web/scripts/demo-walkthrough.mjs` |

## 6. Test status (be honest about it)

- Web unit tests: 259 passing (`npm test -w @smartwallet/web`).
- Playwright mock projects pass; real-API projects were run in parts (an earlier run failed with 429 because logins were not paced; pacing was added, the full paced rerun was not finished).
- Not produced yet: `docs/test-cases.md`, `docs/test-report.md`, a Lighthouse report.
