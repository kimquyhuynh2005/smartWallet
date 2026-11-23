# AGENTS.md

Instructions for any AI coding agent (Claude Code, Codex, Cursor, ...) working in this repository. **[CLAUDE.md](CLAUDE.md) is the full rulebook and applies to you; read it first.** This file is the short map.

## Orientation

- Monorepo (npm workspaces): `apps/api` (NestJS), `apps/web` (React + Vite), `packages/shared` (Zod schemas, plan limits, `budgetPeriod`).
- Product scope, domain rules, security rules, "never do" list: CLAUDE.md sections 1-10. Frontend rules: CLAUDE.md section 11 and [docs/frontend-guide.md](docs/frontend-guide.md).
- **Backend work:** start at [docs/backend-handoff.md](docs/backend-handoff.md), then [docs/backend-requests.md](docs/backend-requests.md) (`BR-01`..`BR-34`, each with the endpoint the UI expects and the workaround to delete when it ships).
- Frontend work: use the `smartwallet-brand` skill (`.claude/skills/smartwallet-brand/SKILL.md`) and the agents in `.claude/agents/`.

## Commands

```bash
npm install && npm run build:shared      # after any change in packages/shared
npm run typecheck | lint | test          # per workspace: add -w @smartwallet/api or @smartwallet/web
npm run test:integration -w @smartwallet/api   # needs Postgres + Redis (CLAUDE.md section 9)
npm run openapi -w @smartwallet/api      # after ANY endpoint change; commit apps/api/openapi.json
npm run web:mock                         # web on :5173 with MSW, no backend
npm run web:real                         # web on :5173 proxied to the API on :3000
docker compose up --build                # Postgres, Redis, API :3000 (and web :5173)
```

## Hard rules (short form)

- Money is integer VND, never float. Every query filters by the JWT user id. Other users' resources are 404. Admins never see individual transactions.
- Controller -> service -> repository; business rules only in services; Zod validation via `@ZBody` / `@ZQuery`; same schema for validation and OpenAPI.
- Money-changing writes run in ONE `prisma.$transaction`, then invalidate caches and publish a domain event.
- Every Must requirement needs a unit and an integration test (happy + error path). Conventional Commits with the requirement ID as scope.
- Frontend: no hard-coded user strings (i18next, `vi` default), tokens not hex, `AmountText`/`MoneyInput` for money, status is never colour-only. A missing endpoint is mocked in `apps/web/src/mocks/extra-handlers.ts` plus a `BR-nn` row, never silently invented.
- Do not commit secrets; only `.env.example` is tracked.

## Keep the docs true

When you change behaviour, update the doc that owns it in the same change: CLAUDE.md (rules and known gaps), `docs/backend-requests.md` (status of a `BR-nn`), `docs/shared-requests.md` (shell requests), README "Run the frontend" (commands, accounts).
