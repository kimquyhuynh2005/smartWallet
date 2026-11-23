# Shared requests (from feature work to the lead)

Feature agents only edit `src/features/<their feature>/` and their own `src/locales/{vi,en}/<feature>.json`. When a screen needs a change in anything shared, **do not make it**: add a row here and work around it inside your feature. The lead applies the request, then updates the row.

Shared (frozen for feature work): `src/app` (shell, router, layouts), `src/ui`, `src/api` + `src/lib/api` (client, endpoints, hooks), `src/lib/queryKeys.ts`, `src/mocks` (MSW), `src/stores`, `src/i18n` (shell strings), `src/features/common`, `src/pages` (landing, auth, onboarding, dev), `packages/shared`.

Backend gaps are **not** listed here: they go in `docs/backend-requests.md`.

| # | Date | Feature | Needs | Why | Workaround used | Status |
|---|------|---------|-------|-----|-----------------|--------|
| 1 | 2026-11-23 | categories | More lucide icons in `lib/categories.ts` `ICONS` (15 added) | CAT-02 icon picker could only offer 15 icons | 15 icons | done (lead) |
| 2 | 2026-11-23 | transactions | `TransactionRow` with an actions slot (menu/swipe) | edit, delete-with-undo, swipe | own `LedgerRow` in features/transactions, reused by wallets | open: only worth moving into features/common if a third feature needs it |
| 3 | 2026-11-24 | dashboard | Move the streak query into `src/api` when BR-34 ships: `endpoints.reports.streak()` + `useStreak()` + `qk.reports.streak` | the saving-streak card needs `GET /reports/streak` | local `useServerStreak` in `features/dashboard/StreakCard.tsx` using `request` from `@/lib/api/client` with a local Zod schema, `meta.silent`, no retry. MSW handler for `GET /reports/streak` appended to `src/mocks/extra-handlers.ts` (additive; the coverage test is unaffected) | open |
