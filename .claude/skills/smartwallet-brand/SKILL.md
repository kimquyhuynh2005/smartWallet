---
name: smartwallet-brand
description: SmartWallet's frontend brand and UI rules ("Sổ tay" notebook look, Vietnamese-first voice, design tokens, src/ui components, money formatting, charts, motion, layout, feature-folder and mocks-first workflow). Use this skill whenever you build, change, review or write copy for ANY screen, component, card, chart, empty/error state, dialog, toast or public page in apps/web, even when the request only says "add a card", "new page", "fix the layout", "write the Vietnamese text" or "make it look right". Also use it before reviewing a UI at 360/768/1440 px or adding a mock endpoint.
---

# SmartWallet brand and frontend rules

SmartWallet is a notebook, not a bank form: warm paper, deep ink, ONE green accent, hairline rules instead of shadows, numbers as the hero. People open it for a few seconds, one-handed, right after paying for something, so every screen answers one question quickly and never scolds.

Read this file fully. Open a reference file only when its topic comes up:

| Need | File |
|---|---|
| exact colours, fonts, type scale, spacing, radius, shadows, category hues | `references/tokens.md` |
| props and usage rules per `src/ui` component, charts, motion | `references/components.md` |
| vi/en voice, fixed terms, copy bank (empty, error, confirm), dates, number words | `references/voice.md` |

The values come from the code (`src/styles/tokens.css`, `tailwind.config.js`, `src/ui/*`, `src/lib/format.ts`, `src/lib/categories.ts`, `src/hooks/useReducedMotion.ts`, `src/locales/*`). If code and this skill disagree, the code wins: fix the skill in the same change.

## The ten rules that decide most reviews

1. **Tokens only.** Colours are Tailwind token classes (`bg-surface`, `text-ink-2`, `border-line`, `text-accent`). No raw hex, no `rgb()` literals except `rgb(var(--token))` where a library needs a string (charts).
2. **Components from `@/ui` only.** `Button`, `Card`, `Field` + `Input`/`MoneyInput`/`Select`/`DatePicker`, `Badge`, `Alert`, `EmptyState`, `Skeleton`, `ProgressBar`, `AmountText`, `Tabs`, `Menu`, `ResponsiveDialog`. Do not restyle a primitive; if one is missing, write a row in `docs/shared-requests.md`.
3. **Money = `AmountText` / `MoneyInput` / `formatMoney` only.** Whole dong (integers), tabular digits, real minus sign `−`. vi `1.500.000 ₫`, en `1,500,000 VND`. Income is accent with `+`; **expenses are ink, never red**.
4. **Status is never colour alone.** Every warn/over/success state has an icon AND a word. Budget bar: calm < 80 %, warning ≥ 80 % (amber, triangle, "Gần hết"), over ≥ 100 % (red, octagon, "Vượt ngân sách").
5. **No hard-coded user-facing strings.** Everything through i18next, namespace = your feature file name (`useTranslation('goals')`), always `vi` AND `en`. Vietnamese is written first, naturally, never translated word for word.
6. **Every screen has four states:** loading (skeleton shaped like the content), empty (invites the first action), error (what happened + what to do, with retry), success.
7. **360 px first.** No horizontal scroll at 360, touch targets ≥ 44 px, 16 px minimum text in inputs. Check 360 / 768 / 1440, light and dark.
8. **Motion is purposeful:** 150–250 ms, ease-out, honour `prefers-reduced-motion` (final state at once). No bounce, no confetti except the one calm "goal reached" moment.
9. **Never shame.** No guilt about spending, no streak-loss pressure, no countdowns, no "you failed". Celebrate quietly, recover quietly.
10. **Mocks first.** The UI must work with `VITE_USE_MOCKS=true` AND against the real API; anything the API lacks is mocked and logged (see "Mocks-first" below).

## Palette in one glance

Light = paper, dark = warm night (never cold grey, never pure black). All tokens are space-separated RGB variables so `bg-accent/10` works.

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | #FBF8F3 | #16130F | page background |
| `surface` | #FFFEFB | #1E1A15 | cards, sheets, dialogs |
| `sunken` | #F4EFE6 | #120F0B | inputs, wells, skeleton base |
| `ink` / `ink-2` / `ink-3` | #1F2A26 / #56605A / #5F6862 | #F1EBDD / #B9B2A4 / #A39C90 | primary / secondary / tertiary text |
| `line` / `line-strong` | #E6DFD2 / #D5CCBB | #2E2922 / #403A31 | hairlines |
| `control` | #8C8476 | #766F62 | form-control borders (≥ 3:1) |
| `accent` (+ `accent-ink`, `accent-soft`) | #1F6B54 | #5CC2A0 | THE accent: primary button, income, on-track, focus |
| `warn` (+ `warn-soft`) | #9A4506 | #F0B25A | "careful" |
| `danger` (+ `danger-soft`) | #A33A32 | #F08A80 | "over", destructive |

Accent is never a large fill except the primary button; no gradients; no second brand colour. Details, category hues and the type scale: `references/tokens.md`.

## Type, spacing, radius, elevation (short form)

- **Be Vietnam Pro** for UI and headings (weights 400/500/600/700, vietnamese + latin subsets so stacked diacritics never fall back). **Inter** only supplies tabular digits through the `SW Digits` face; use the `num` class on any number that sits in a column.
- Scale: `text-xs` 12/16, `sm` 14/20, `base` 16/24, `lg` 18/26 (card titles), `xl` 22/30 (page titles), `2xl` 28/36, `3xl` 36/42 (the ONE big number per screen). Sentence case; ALL CAPS only for a 12 px overline.
- 4 px grid. Card padding 16 mobile / 20 from md. Page gutters 16 / 24 / 32; content max width `max-w-page` (1120 px). Section gap 24–32.
- Radius `md` 12 (inputs, buttons), `lg` 16 (cards), `xl` 20 (dialogs, sheet top), pills 999.
- Elevation: hairline `border-line` is the default separator. A shadow (`shadow-float`) only on things that float: dialogs, sheets, menus, toasts. Never on cards.

## Layout patterns

- **App shell** (`src/app`, owned by the lead; do not edit): desktop sidebar (256 px) + top bar (month switcher, bell, avatar menu); below 1024 px a bottom tab bar with a raised **"+" Add** button in the middle (add an entry in ≤ 3 taps: Add, amount, Save). `N` opens quick-add. Your page renders inside `<main>` with `max-w-page`.
- **Page header:** `PageHeader` from `@/features/common/parts` (`title`, optional `subtitle`, `actions`). Section headings: `SectionTitle`. Left-aligned, asymmetric: a calm main column plus a narrower side column on desktop; single column on mobile.
- **Public pages** (landing, auth, about) use `PublicLayout` and `Logo`; same tokens, same voice, never a centred-everything hero.
- **Loading:** `Skeleton` blocks with the same height as the content (no layout jump, no spinner over a blank page). **Empty:** `EmptyState` (left-aligned, one small line icon, one next action). **Error:** a calm block with title, hint and a retry button (copy bank in `references/voice.md`). A failed query that the API simply does not have yet (404 on a mocked-only endpoint) degrades quietly, with no error toast.
- **Plan limits:** do not build upgrade UI. Just call the mutation; a 403 `PLAN_LIMIT_REACHED` opens the global `PlanLimitDialog` (copy lives in the `plans` namespace). Premium-only actions open it with `useUi.getState().openUpgrade({ feature })`.
- **Dialog vs sheet:** use `ResponsiveDialog` (sheet below 768 px, centred dialog from 768 px up); every overlay needs a `title`.

## Feature-folder rules (docs/shared-requests.md, CLAUDE.md §11)

- A feature agent edits ONLY `apps/web/src/features/<feature>/` and `apps/web/src/locales/{vi,en}/<feature>.json`. Everything else is shared and changes through a row in `docs/shared-requests.md` (what you need, why, workaround you used).
- Shared and frozen for feature work: `src/app` (router, layouts, shell), `src/ui`, `src/api` + `src/lib/api`, `src/lib/queryKeys.ts`, `src/mocks`, `src/stores`, `src/i18n`, `src/features/common`, `src/pages`, `packages/shared`.
- A feature folder has `page.tsx` (default export, lazy-loaded by the router) and `index.ts` (the only thing the shell or other features may import). Nothing outside your folder imports your other files.
- Data comes from `@/api` hooks (never `fetch`); server state in TanStack Query with keys from `src/lib/queryKeys.ts`; Zustand only for UI state; forms in React Hook Form + Zod; the month is `usePeriod()` (do not build a month picker).
- Strings: default namespace (`nav.*`, `common.*`, `errors.*`) is shell-owned and read-only; your namespace is your feature name.
- Lead-owned exceptions that still go through the lead: a new route or nav entry, a new dashboard slot, a new shared UI primitive.
- Do not start a dev server of your own and do not commit.

## Mocks-first rule

The API is frozen during the frontend track. When a screen needs something the API lacks:

1. Add an MSW handler in `apps/web/src/mocks/extra-handlers.ts` (append only), validated with the same Zod schema the real API would use (put the `*Out` schema next to the handler or in the feature if `packages/shared` is frozen). `src/mocks/coverage.test.ts` must still pass.
2. Add a typed endpoint/hook in `src/api` only if no existing hook can serve it (additive, and note it in `docs/shared-requests.md`).
3. Add a row to `docs/backend-requests.md` with the next free **BR-nn** id: endpoint, what uses it, what the real API does today (usually 404), status `mocked` or `workaround`.
4. The screen must **degrade quietly** when the real endpoint answers 404: use the client-side workaround or a calm "not available here" state, never a retry storm or an error toast. Mark meta `silent` for that query.
5. Prefer a client-side computation from data that already exists over inventing a new endpoint; propose the endpoint in the BR row so the backend owner can replace the workaround later.

## NEVER (docs/frontend-guide.md §10)

- Purple/indigo-to-pink gradients, glassmorphism on cards, neon glows, heavy drop shadows, more than one accent colour.
- A centred-everything hero or centred body copy; marketing-style heroes inside the app; rows of identical icon-in-a-circle feature cards.
- Colour-only status (red/green without icon and text); red for ordinary expenses.
- Fake 3D coins, piggy-bank clip art, floating currency symbols, rocket / "to the moon" language.
- Emoji used as icons or bullets (icons are `lucide-react` only: 1.75 px stroke, 20 px default, 16 dense, 24 nav).
- Lorem ipsum, "John Doe", placeholder data in screens. Team or demo names that a team must edit are allowed only as clearly marked, realistic Vietnamese placeholders kept in one editable data file.
- Decimal dong, `₫` before the number in vi, proportional digits in amount columns.
- Disabling zoom, text under 12 px, hover-only actions, toasts that hide errors the user must act on.
- Shaming copy about spending; streak guilt; countdown pressure on upgrades.
- Hard-coded user-facing strings, raw hex colours, editing files outside your feature folder.

## Done checklist (run through before reporting)

- [ ] Tokens and `@/ui` only; no raw hex; no inline money formatting.
- [ ] vi and en strings in `src/locales/{vi,en}/<feature>.json`; Vietnamese reads naturally; fixed terms used (`references/voice.md`).
- [ ] Loading / empty / error / success all present; 404 on a mocked-only endpoint is quiet.
- [ ] 360 / 768 / 1440 px, light and dark, no horizontal scroll (`node apps/web/scripts/browser-probe.mjs --base <url> --paths /route --as linh --out .cache/review` reports overflow, raw i18n keys and console errors).
- [ ] Keyboard: visible focus ring (2 px accent, 2 px offset), labels on every control, dialogs trap and restore focus.
- [ ] Reduced motion honoured; animations 150–250 ms.
- [ ] `npm run typecheck -w @smartwallet/web` and `npm test -w @smartwallet/web` pass.
- [ ] New endpoint? MSW handler + BR-nn row. Needed a shared change? Row in `docs/shared-requests.md`.
