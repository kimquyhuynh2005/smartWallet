# SmartWallet

Personal finance and smart budgeting for Vietnamese students and young professionals (NestJS API in `apps/api`, React web app in `apps/web`, shared Zod schemas in `packages/shared`). Rules and domain model: [CLAUDE.md](CLAUDE.md). UI rules: [docs/frontend-guide.md](docs/frontend-guide.md). Presentation: [docs/demo-script.md](docs/demo-script.md). **Backend owners start at [docs/backend-handoff.md](docs/backend-handoff.md)**; agents read [AGENTS.md](AGENTS.md).

## Repository map

| Path | What |
|---|---|
| `apps/api` | NestJS + Prisma + Postgres + Redis API (frozen during the frontend track) |
| `apps/web` | React 18 + Vite web app, MSW mock mode |
| `packages/shared` | Zod schemas, enums, plan limits, `budgetPeriod` (single source of truth for api and web) |
| `docs/` | [backend-handoff](docs/backend-handoff.md), [backend-requests](docs/backend-requests.md) (BR-01..34), [shared-requests](docs/shared-requests.md), [frontend-guide](docs/frontend-guide.md), [demo-script](docs/demo-script.md) |
| `.claude/` | project agents (`screen-builder`, `ui-reviewer`, `test-writer`) and the `smartwallet-brand` skill |

## Run the frontend

Requirements: Node 20+ and npm. Everything below runs from the repository root.

```bash
npm install
npm run build:shared        # once, and after any change in packages/shared
```

### Mock mode (no backend needed; use this for the demo)

```bash
npm run web:mock            # http://localhost:5173
```

MSW serves every API endpoint in the browser with realistic VND data. The database resets on every full page load (a reload returns to the seed), the access token lives in memory only, and the Premium upgrade, goal contributions and the admin user lock are available here even where the real API does not offer them yet (see [docs/backend-requests.md](docs/backend-requests.md)). Design-system showcase: `/dev/ui`. `?theme=dark|light` and `?lang=vi|en` override the theme and language without saving them.

Production-like mock build (what the projector should run if you want no dev server): `npm run build:mock -w @smartwallet/web && npm run preview:mock -w @smartwallet/web` then open http://localhost:4173.

### Real-API mode

```bash
docker compose up --build   # Postgres, Redis, API on :3000 (migrations and seed run automatically)
npm run web:real            # http://localhost:5173, Vite proxies /api to :3000
```

Or run the whole stack in Docker (after a dependency change use `docker compose down -v && docker compose up --build`, the web container keeps its own `node_modules`): `docker compose up --build` (API :3000, web :5173). Check the API first: `curl localhost:3000/health` must answer `{"status":"ok"}`. The auth routes allow 10 requests per minute per IP, so do not log in repeatedly in a row.

### Demo accounts

| Where | Account | Password | What it is |
|---|---|---|---|
| Mock | `linh@smartwallet.demo` | `Demo@12345` | Linh, student, **Free** plan, close to her Food budget limit, one goal |
| Mock | `minh@smartwallet.demo` | `Demo@12345` | Minh, office worker, **Premium**, 6+ months of history, goal nearly achieved |
| Mock | `admin@smartwallet.demo` | `Demo@12345` | Admin console |
| Real API seed | `demo@smartwallet.local` | `Demo@12345` | Free user |
| Real API seed | `admin@smartwallet.local` | `Admin@12345` | Admin |

The login page in mock mode also has one-click demo buttons.

### Production build

```bash
npm run build -w @smartwallet/web      # type-check + vite build -> apps/web/dist (real-API build: no MSW, no /dev/ui)
```

### Tests

```bash
npm test -w @smartwallet/web                         # unit tests (Vitest)
npm run test:coverage -w @smartwallet/web            # + coverage (src/lib and src/ui)
npm run e2e -w @smartwallet/web                      # Playwright against the mock build (desktop 1440 + mobile 360); starts Vite itself
npm run e2e:real -w @smartwallet/web                 # also runs the real-API projects (needs the API on :3000)
npm run e2e -w @smartwallet/web -- --project=mock-mobile -g "GOAL-02"   # a subset
```

First time only: `npx playwright install chromium`. The real-API projects pace their logins (30 s apart) to stay under the auth rate limit, so that run takes about 20 minutes.

## For the backend team

The API contract the UI depends on, the priority order of the missing endpoints and how to run the web against your API are in [docs/backend-handoff.md](docs/backend-handoff.md). After any API change: `npm run build:shared`, `npm run openapi -w @smartwallet/api`, then `npm test -w @smartwallet/web` (the mock coverage test fails on an undocumented or unmocked operation). API commands: `npm run typecheck|test|test:integration -w @smartwallet/api`, see CLAUDE.md sections 5-9.
