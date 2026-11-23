# SmartWallet frontend guide

Single source of truth for how `apps/web` looks, sounds and moves. Tokens live in `apps/web/src/styles/tokens.css`; this file explains the *why*. If code and guide disagree, fix the guide in the same PR.

## 1. Classification and direction

**Product class:** consumer personal-finance *software* (an app, not a marketing page). People open it many times a day for a few seconds, usually on a phone, often one-handed, often right after paying for something.

**Personas**
- **Linh, 21, student.** Pays with MoMo. Wants one answer: *"will my money last until month-end?"* → the dashboard leads with **safe to spend today**, not with charts.
- **Minh, 27, office worker.** Saves for a house deposit. Wants to see goals move and monthly trends. → goals and the 6-month trend are first-class.

**Feeling:** a well-made notebook, not a bank form. Calm, trustworthy, warm, human. It never shouts, never gamifies debt, never looks like a trading app.

**Direction: "Sổ tay" (the notebook).** Warm off-white paper, deep ink text, hairline rules instead of shadows, ONE confident green accent, amber only for "careful", soft red only for "over". Left-aligned, ledger-like layouts with generous whitespace. Numbers are the hero and get tabular figures so columns of money line up like a ledger.

Why green: it reads as "money is fine" in Vietnamese and global convention and is calm rather than loud; a deep, slightly teal green (not neon) keeps it away from crypto/fintech clichés. It is used sparingly: primary actions, income, "on track", focus rings, the active nav item. Everything else is ink on paper.

## 2. Palette (tokens)

All colors are CSS variables holding space-separated RGB so Tailwind can apply opacity (`bg-accent/10`). Light = paper, dark = warm night (same personality, never cold grey, never pure black).

| Token | Light | Dark | Use |
|---|---|---|---|
| `paper` | `#FBF8F3` | `#16130F` | page background |
| `surface` | `#FFFEFB` | `#1E1A15` | cards, sheets |
| `sunken` | `#F4EFE6` | `#120F0B` | inputs, wells, skeleton base |
| `ink` | `#1F2A26` | `#F1EBDD` | primary text |
| `ink-2` | `#56605A` | `#B9B2A4` | secondary text (≥ 4.5:1 on paper) |
| `ink-3` | `#5F6862` | `#A39C90` | tertiary / placeholder (≥ 4.5:1 on paper, sunken and the soft tints) |
| `line` | `#E6DFD2` | `#2E2922` | hairline borders, dividers |
| `line-strong` | `#D5CCBB` | `#403A31` | decorative strong dividers |
| `control` | `#8C8476` | `#766F62` | form-control borders (≥ 3:1, WCAG 1.4.11) |
| `scrim` | `#1F2A26` 40% | `#080604` 62% | dialog/sheet backdrop (dims; no blur) |
| `accent` | `#1F6B54` | `#5CC2A0` | THE accent: primary button, income, on-track, focus |
| `accent-ink` | `#FFFFFF` | `#0D1F18` | text on accent |
| `accent-soft` | `#E3F0EA` | `#1B2E27` | tinted backgrounds for accent |
| `warn` | `#9A4506` | `#F0B25A` | "careful" text/icons (budget ≥ 80%) |
| `warn-soft` | `#FBEBD0` | `#3A2C14` | amber tinted background |
| `danger` | `#A33A32` | `#F08A80` | "over" (budget ≥ 100%), destructive |
| `danger-soft` | `#F8E3E0` | `#3B1F1C` | red tinted background |

Rules
- Accent is **never** a large fill except the primary button. No accent gradients. No second brand color.
- Red is reserved for *overspending and destructive actions*. **Expenses are ink, not red** (spending is normal); income is accent with a `+`.
- Status is never color alone: every warning/over/success state also has an icon and a word.
- Focus ring: 2 px `accent`, 2 px offset on `paper`. Always visible on keyboard focus.

### Category colors
Each default category has one lucide icon and one muted hue, used identically in lists, charts, budgets and the quick-add form (`CategoryIcon`, `categoryVisual()`). Chips are `color 14%` tint background + full-color icon. Dark mode lifts lightness, keeps hue.

| Category (en / vi) | Icon | Light | Dark |
|---|---|---|---|
| Food & Drinks / Ăn uống | `utensils` | `#A8502C` | `#E08F6C` |
| Transport / Di chuyển | `car` | `#4F6FA3` | `#8AA8DC` |
| Housing / Nhà ở | `home` | `#8C7442` | `#C9AE72` |
| Bills / Hóa đơn | `receipt` | `#A8841A` | `#DDB84F` |
| Shopping / Mua sắm | `shopping-bag` | `#B2506F` | `#E58BA8` |
| Entertainment / Giải trí | `clapperboard` | `#2F8A85` | `#6CC3BD` |
| Education / Học tập | `graduation-cap` | `#5666A6` | `#94A3E0` |
| Health / Sức khỏe | `heart-pulse` | `#BC4A43` | `#EA8A82` |
| Gifts / Quà tặng | `gift` | `#BE7358` | `#E7A58C` |
| Other / Khác | `ellipsis` | `#737A74` | `#A9AFA8` |
| Salary / Lương | `banknote` | `#2C7A58` | `#63C49B` |
| Allowance / Tiền được cho | `hand-coins` | `#4F955F` | `#86CC95` |
| Part-time / Làm thêm | `briefcase` | `#33868B` | `#6FC2C7` |
| Bonus / Thưởng | `trophy` | `#7E9A2E` | `#B5D06A` |
| Custom categories | `tag` | derived from its saved color, else ink-3 | |

## 3. Typography

- **Be Vietnam Pro** (UI + headings), self-hosted via `@fontsource` with the `vietnamese`, `latin`, `latin-ext` subsets so stacked diacritics ("Nguyễn", "ở", "ữ") never fall back to another font. Weights 400/500/600/700 only.
- **Money and any column of numbers** use `tabular-nums` (`.num` utility). If the UI font lacks tabular figures the `.num` class swaps digits to **Inter** through a `unicode-range` face, so amounts line up regardless.
- Body 16 px minimum on mobile inputs (prevents iOS zoom). Line length for prose ≤ 68ch.

| Step | Size / line | Weight | Use |
|---|---|---|---|
| `text-xs` | 12 / 16 | 500 | captions, badges (never for essential info) |
| `text-sm` | 14 / 20 | 400–500 | secondary text, table cells |
| `text-base` | 16 / 24 | 400 | body, inputs |
| `text-lg` | 18 / 26 | 600 | card titles |
| `text-xl` | 22 / 30 | 600 | page titles |
| `text-2xl` | 28 / 36 | 600, tracking -0.01em | section numbers |
| `text-3xl` | 36 / 42 | 600, tracking -0.02em | the one big number per screen (safe-to-spend) |

Headings are sentence case. No ALL CAPS except the 12 px overline label (`tracking-wide`).

## 4. Spacing, layout, radius, elevation
- 4 px base grid. Component padding 12/16/20; card padding 16 (mobile) / 20 (≥ md); page gutters 16 (mobile), 24 (md), 32 (lg). Section gap 24–32.
- Radius: inputs/buttons **12**, cards **16**, sheets/dialogs **20** top corners, pills/badges **999**. Never mix sharp and round in one component.
- Elevation: **hairline borders (`line`) are the default separator.** Shadows only on things that float: popovers, dialogs, toasts (`0 12px 32px -16px rgb(31 42 38 / .28)`), never on cards.
- Layout is **left-aligned and asymmetric**: a calm main column plus a narrower side column on desktop; single column on mobile. Content max width 1120 px. Reflow from 360 px; touch targets ≥ 44 px.
- Navigation: bottom tab bar on < 1024 px with a persistent **Add** button in the middle (an entry is ≤ 3 taps from anywhere: Add → amount → Save); sidebar on ≥ 1024 px with the same Add action.

## 5. Motion
- Purpose only: confirm an action, show a change, keep context. 150–200 ms, `ease-out`; progress bars 400 ms. Sheets slide 220 ms; dialogs fade + 4 px rise.
- No bounce, no parallax, no looping decoration, no confetti except one calm "goal reached" moment.
- `prefers-reduced-motion: reduce` removes all transform/opacity transitions except instant state changes.
- Skeletons are static tinted blocks with a very slow 1.6 s sheen, off under reduced motion. Loading never blocks the page.

## 6. Icons
`lucide-react` only, 1.75 px stroke, 20 px default (16 in dense rows, 24 in nav). Icons are decorative unless they carry meaning, then they have an accessible label or sit beside text. **Never emoji as icons.**

## 7. Components (src/ui)
`Button` (primary, secondary, ghost, destructive, loading), `Input`, `MoneyInput`, `Select`, `DatePicker`, `Dialog`/`Sheet`/`ResponsiveDialog`, `Tabs`, `Badge`, `ProgressBar`, `Card`, `EmptyState`, `Skeleton`, `Toast`, `Avatar`, `CategoryIcon`, `AmountText`, `Field`. All demonstrated, both themes, on `/dev/ui`.

- **AmountText**: always shows a sign for flows (`+` income in accent, `−` expense in ink), tabular, locale format: **vi `1.500.000 ₫`**, **en `1,500,000 VND`**. Whole dong only, no decimals anywhere.
- **MoneyInput**: groups digits as you type, caret-safe, `inputMode="numeric"`, shows the unit inside the field, emits an integer.
- **ProgressBar**: *calm* (< 80 %, accent), *warning* (80–99 %, amber + triangle icon + "Gần hết"), *over* (≥ 100 %, red + octagon icon + "Vượt ngân sách"). Always icon + text + `role="progressbar"` with `aria-valuenow`.

## 8. Voice and tone
Vietnamese first, English second; both written, never machine-translated word for word.
- **Warm, plain, specific.** Talk like a friend who is good with money: "Hôm nay bạn có thể chi tối đa 142.000 ₫", not "Daily safe-to-spend allowance".
- **Never scold.** Over budget: "Ăn uống đã vượt 12%. Mình điều chỉnh lại nhé?" Not "Bạn đã chi tiêu quá mức!".
- **Numbers before adjectives.** Say how much, then how that feels.
- Use *bạn* (you) and *mình* (we/I) in vi; "you" and "let's" in en. No exclamation marks except for a reached goal. No jargon ("net", "liquidity") in UI copy.
- Errors say what happened and what to do next, never blame the user or show codes. Empty states invite the first action.
- Dates: vi `21/11/2026`, `Thứ Bảy, 21 tháng 11`; en `21 Nov 2026`. Periods: "Tháng 11/2026" / "November 2026". Compact amounts: vi `1,5 tr`, `350 k`; en `1.5M`, `350K`.

## 9. Accessibility
WCAG 2.1 AA: text contrast ≥ 4.5:1 in both themes, 44 px targets, visible focus, labels on every control, `aria-live` for toasts and alerts, dialogs trap focus and restore it, color is never the only signal, `lang` follows the UI language, layout reflows at 360 px without horizontal scroll.

## 10. NEVER
- Purple/indigo-to-pink gradients, glassmorphism on cards, neon glows.
- A centered-everything hero; centered body copy; marketing-style hero inside the app.
- Rows of identical icon-in-a-circle feature cards.
- Color-only status (red/green without icon and text).
- Fake 3D coins, piggy-bank clip art, floating currency symbols, rocket/"to the moon" language.
- Emoji used as icons or bullets.
- Lorem ipsum, "John Doe", placeholder data in screens (seed with real Vietnamese notes and amounts).
- Heavy drop shadows, more than one accent color, red for ordinary expenses.
- Decimal dong, `₫` placed before the number in vi, proportional digits in amount columns.
- Disabling zoom, tiny (< 12 px) text, hover-only actions, toasts that hide errors the user must act on.
- Shaming copy about spending; streak guilt; countdown pressure on upgrades.

## 11. Technical rules
- Server state in TanStack Query with the key factory in `src/lib/queryKeys.ts`; **Zustand only for UI state** (theme, language, quick-add sheet, upgrade dialog, offline flag). The access token lives in memory only.
- Strings only in `src/i18n/locales/{vi,en}.json`; formatting only through `src/lib/format.ts`.
- All API calls go through `src/lib/api/client.ts` (silent refresh, error mapping) and are typed with the Zod schemas from `packages/shared`.
- Mock first: `VITE_USE_MOCKS=true` serves every endpoint of the API contract from MSW (`src/mocks`). When the real API lacks something, mock it in `src/mocks/extra-handlers.ts` and list it in `docs/backend-requests.md`.
- Verify UI at **360 / 768 / 1440 px**, light and dark, on `/dev/ui` and each new screen before calling it done.

## 12. Polish pass rules (2026-11)
- Hue chips: initials in avatars use `ink` on a tint (never the hue as text); category icons reach 3:1 on their 14 % tint (Bills `#8A6A0E`, Gifts `#A85C40`, Allowance `#347844`, Bonus `#60781C`, Shopping `#A0405E`, Transport `#426094`, Salary `#246C4C`).
- Numbers that change in place ease for ~320 ms (`useCountUp`, used by `AmountText` and `ProgressBar`); first render, and reduced motion, show the final value at once.
- Sheets and dialogs have an exit animation (150-200 ms) and sheets close by dragging the handle down; toasts sit at the top on phones.
- Every touch target is >= 44 px (switches get a larger hit area); money never truncates; progress percentages are whole numbers (floor, like the alert text).
- A network blip never logs the user out; a failed save shows a quiet warning; the app has a root error screen for crashes and stale chunks.
- PWA: `public/manifest.webmanifest`, icons `icon-192/512`, `icon-maskable-512`, `apple-touch-icon` (no service worker yet: offline caching is out of scope).
