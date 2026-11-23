# Tokens, type, spacing, radius, elevation, category colours

Source of truth: `apps/web/src/styles/tokens.css` and `apps/web/tailwind.config.js`. Values below are copied from there.

## Contents
1. Colour tokens (full)
2. Category icons and hues
3. Fonts and type scale
4. Spacing, layout, radius, elevation
5. Focus, scrim, dark mode

## 1. Colour tokens

Use Tailwind classes (`bg-paper`, `text-ink-2`, `border-line`, `bg-accent-soft`, `text-warn`, `bg-danger-soft`). Opacity works: `bg-accent/10`, `border-danger/40`. In a library that needs a colour string (Recharts, `style=`) write `rgb(var(--ink-2))`.

| Token | Tailwind | Light | Dark | Use |
|---|---|---|---|---|
| `--paper` | `bg-paper` | 251 248 243 `#FBF8F3` | 22 19 15 `#16130F` | page background |
| `--surface` | `bg-surface` | 255 254 251 `#FFFEFB` | 30 26 21 `#1E1A15` | cards, sheets, dialogs, menus |
| `--sunken` | `bg-sunken` | 244 239 230 `#F4EFE6` | 18 15 11 `#120F0B` | inputs, wells, progress track, skeleton |
| `--ink` | `text-ink` | 31 42 38 `#1F2A26` | 241 235 221 `#F1EBDD` | primary text, expenses |
| `--ink-2` | `text-ink-2` | 86 96 90 `#56605A` | 185 178 164 `#B9B2A4` | secondary text (≥ 4.5:1) |
| `--ink-3` | `text-ink-3` | 95 104 98 `#5F6862` | 163 156 144 `#A39C90` | tertiary, placeholder (≥ 4.5:1) |
| `--line` | `border-line` | 230 223 210 `#E6DFD2` | 46 41 34 `#2E2922` | hairlines, dividers |
| `--line-strong` | `border-line-strong` | 213 204 187 `#D5CCBB` | 64 58 49 `#403A31` | secondary button border, sheet handle |
| `--control` | `border-control` | 140 132 118 `#8C8476` | 118 111 98 `#766F62` | form-control borders (WCAG 1.4.11, ≥ 3:1) |
| `--scrim` | `bg-[rgb(var(--scrim))]` | 31 42 38 / 0.4 | 8 6 4 / 0.62 | dialog and sheet backdrop (dims, no blur) |
| `--accent` | `text-accent` `bg-accent` | 31 107 84 `#1F6B54` | 92 194 160 `#5CC2A0` | primary button, income, on-track, focus, active nav |
| `--accent-ink` | `text-accent-ink` | 255 255 255 | 13 31 24 | text on accent |
| `--accent-soft` | `bg-accent-soft` | 227 240 234 `#E3F0EA` | 27 46 39 `#1B2E27` | tinted accent backgrounds |
| `--warn` | `text-warn` | 154 69 6 `#9A4506` | 240 178 90 `#F0B25A` | careful (budget ≥ 80 %) |
| `--warn-soft` | `bg-warn-soft` | 251 235 208 | 58 44 20 | amber tint |
| `--danger` | `text-danger` | 163 58 50 `#A33A32` | 240 138 128 `#F08A80` | over (≥ 100 %), destructive |
| `--danger-soft` | `bg-danger-soft` | 248 227 224 | 59 31 28 | red tint |

Rules:
- Accent is never a large fill except the primary button. One accent, no gradients, no second brand colour.
- Red is only for overspending and destructive actions. Expenses are `text-ink`; income is `text-accent` with `+`.
- Text on tinted backgrounds uses the matching text token (`text-warn` on `bg-warn-soft`). Avatar initials use `ink` on a tint, never the hue as text.
- Never write `dark:` colour overrides for tokens: the variables already switch under `.dark`. Verify both themes with `?theme=dark|light`.

## 2. Category icons and hues

One lucide icon and one muted hue per default category, identical in lists, charts, budgets and forms. Use `CategoryIcon` (`@/ui`) or `categoryVisual(category)` from `@/lib/categories`, which returns `{ Icon, color, key }`. A chip is `color` at 14 % tint behind the full-colour icon (`color-mix(in srgb, <color> 14%, transparent)`), icon stroke 1.75. The category NAME is always printed next to the icon (the icon is decorative).

| Category (en / vi) | key | Icon | Light | Dark |
|---|---|---|---|---|
| Food & Drinks / Ăn uống | `food` | `utensils` | `#A8502C` | `#E08F6C` |
| Transport / Di chuyển | `transport` | `car` | `#426094` | `#8AA8DC` |
| Housing / Nhà ở | `housing` | `home` | `#8C7442` | `#C9AE72` |
| Bills / Hóa đơn | `bills` | `receipt` | `#8A6A0E` | `#DDB84F` |
| Shopping / Mua sắm | `shopping` | `shopping-bag` | `#A0405E` | `#E58BA8` |
| Entertainment / Giải trí | `entertainment` | `clapperboard` | `#2F8A85` | `#6CC3BD` |
| Education / Học tập | `education` | `graduation-cap` | `#5666A6` | `#94A3E0` |
| Health / Sức khỏe | `health` | `heart-pulse` | `#BC4A43` | `#EA8A82` |
| Gifts / Quà tặng | `gifts` | `gift` | `#A85C40` | `#E7A58C` |
| Other / Khác | `other` | `ellipsis` | `#737A74` | `#A9AFA8` |
| Salary / Lương | `salary` | `banknote` | `#246C4C` | `#63C49B` |
| Allowance / Tiền được cho | `allowance` | `hand-coins` | `#347844` | `#86CC95` |
| Part-time / Làm thêm | `parttime` | `briefcase` | `#33868B` | `#6FC2C7` |
| Bonus / Thưởng | `bonus` | `trophy` | `#60781C` | `#B5D06A` |
| Transfer | `transfer` | `arrow-left-right` | `ink-2` | `ink-2` |
| Custom category | `custom` | its saved icon or `tag` | its saved `#rrggbb`, else `ink-3` | same |

Custom-category icon choices (picker): the above plus `coffee plane bus dumbbell music paw-print baby phone wifi fuel shirt book-open piggy-bank wallet landmark`. Matching is by `nameEn` (case-insensitive). Never hard-code a category colour: call `categoryVisual`.

## 3. Fonts and type scale

- **Be Vietnam Pro** (`font-sans`, `var(--font-ui)`): all UI text and headings, weights 400/500/600/700, self-hosted via `@fontsource` with the `vietnamese`, `latin`, `latin-ext` subsets.
- **SW Digits** (Inter 400/500/600/700, `unicode-range` 0-9 only): supplies tabular figures. Put the `num` class on any number that sits in a column or changes in place (`AmountText` and `ProgressBar` already do).
- Inputs are `text-base` (16 px) so iOS does not zoom. Prose line length ≤ 68ch. Headings are sentence case.

| Class | Size / line | Weight | Use |
|---|---|---|---|
| `text-xs` | 12 / 16 | 500 | badges, captions (never essential info) |
| `text-sm` | 14 / 20 | 400–500 | secondary text, table cells, hints, labels |
| `text-base` | 16 / 24 | 400 | body, inputs, buttons |
| `text-lg` | 18 / 26 | 600 | card titles (`CardTitle`) |
| `text-xl` | 22 / 30 | 600 | page title on mobile (`PageHeader`) |
| `text-2xl` | 28 / 36, -0.01em | 600 | page title from md, section numbers |
| `text-3xl` | 36 / 42, -0.02em | 600 | the ONE big number per screen (safe to spend) |

## 4. Spacing, layout, radius, elevation

- 4 px base grid. Component padding 12 / 16 / 20. `Card` = `p-4 md:p-5`. Dialog `p-6`. Page gutters `px-4 md:px-6 lg:px-8`. Gap between sections 24–32 (`gap-6` / `gap-8`).
- Content column `max-w-page` = 1120 px. Reflow from 360 px. Touch targets ≥ 44 px (`min-h-11`, `h-11 w-11`).
- Radius: `rounded-md` 12 (inputs, buttons, alerts, skeleton), `rounded-lg` 16 (cards), `rounded-xl` 20 (dialog; sheet top corners), `rounded-full` (badges, bars, avatars). Do not mix sharp and round inside one component.
- Elevation: hairline `border border-line` is the default. `shadow-float` (`0 12px 32px -16px rgb(31 42 38 / .28), 0 2px 6px -2px rgb(31 42 38 / .08)`; dark: `0 16px 40px -16px rgb(0 0 0 / .65), …`) only on floating layers: dialog, sheet, menu, toast. Never on cards.
- Sticky top bar uses `bg-paper/90 backdrop-blur`; that is the only blur in the app.

## 5. Focus, scrim, dark mode

- Focus ring: 2 px accent, 2 px offset on paper, always visible on keyboard focus (`focus-visible:ring-2 focus-visible:ring-accent/40` on controls). Never remove outlines without a replacement.
- The scrim dims; it does not blur. Dark mode keeps the same hue family, lifts lightness; check hover and disabled states in both themes.
- `?theme=dark|light` and `?lang=vi|en` override without persisting, handy for screenshots.
