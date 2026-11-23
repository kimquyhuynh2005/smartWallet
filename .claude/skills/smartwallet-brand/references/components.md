# Components, money, dates, charts, motion

Import everything from `@/ui` (barrel `src/ui/index.ts`). Shared blocks: `PageHeader`, `SectionTitle`, `TransactionRow`, `BudgetRow`, `GoalProgress` from `@/features/common/parts`. Toasts from `@/stores/ui`. Showcase of every component in both themes: `/dev/ui` (dev and mock builds).

## Contents
1. Component rules (Button, Field + controls, MoneyInput, AmountText, ProgressBar, Badge/Alert, EmptyState, Skeleton, Toast, Dialog vs Sheet, Tabs, Menu, Card, Avatar, Switch)
2. Money formatting
3. Dates and periods
4. Charts (Recharts)
5. Motion

## 1. Component rules

**Button** (`variant` primary | secondary | ghost | destructive; `size` sm min-h-9, md min-h-11 (default), lg min-h-12, icon 44×44; `loading`)
- One primary button per view or dialog. Secondary for the alternative, ghost for tertiary, destructive only for deletes (soft red tint, never a solid red fill).
- `loading` disables, sets `aria-busy` and shows a spinner but keeps the label so the width does not jump. Icon-only buttons need `aria-label`. Default `type="button"`; pass `type="submit"` in forms.
- Icon + label: `<Plus className="h-4 w-4" aria-hidden />` before the text. Buttons wrap on mobile via `flex-wrap gap-2`, never shrink below 44 px.

**Field + Input / MoneyInput / Select / DatePicker / PasswordInput**
- Always wrap a control in `Field` (`label`, `hint`, `error`, `required`, `optional`). It wires `id`, `aria-describedby`, `aria-invalid`; the error line has an icon, so error is never colour alone and is announced (`role="alert"`). Placeholders are examples ("ví dụ: cà phê Highlands"), never the label.
- Show the error from the Zod schema or the server's `VALIDATION_ERROR` field details. `optional` renders the small "Không bắt buộc" tag; mark required with `required` (screen reader text only).
- Controls are `min-h-11`, `text-base`, `border-control`, focus ring accent. `Select` is a styled native select (best mobile picker); pass `options` or children.
- Forms: React Hook Form + the Zod schema from `packages/shared` or the feature. Disable nothing silently: explain why a button is disabled next to it.

**MoneyInput** (`value: number | null`, `onChange(number | null)`, `max`)
- Integer dong only; groups digits as you type (vi dots, en commas), caret-safe, `inputMode="numeric"`, unit shown inside the field, never emits a float or string. Empty = `null`. Pair with `Field`; the accessible name is the Field label ("Số tiền").

**AmountText** (`amount` integer, `kind` income | expense | transfer | balance, `size` sm | md | lg | xl | hero, `hideUnit`)
- The only way to render money. Pass the positive stored amount with `kind`: income = `+` in accent; expense = real minus `−` in ink (never red); transfer = no sign, `ink-2`; balance = sign only when negative. Tabular digits, `whitespace-nowrap`, never truncated. Adds a screen-reader word ("Chi", "Thu") so the sign is not the only cue. Count-up animates changes in place (see Motion).
- The one big number per screen is `size="hero"` (`text-3xl`); everything else `lg`/`md`.

**ProgressBar** (`percent`, `label`, `showStatus`)
- Three states, always icon + word + `role="progressbar"`: **calm** < 80 % (accent, check icon, "Đang ổn"), **warning** 80–99 % (amber `warn`, triangle, "Gần hết"), **over** ≥ 100 % (`danger`, octagon, "Vượt ngân sách"). Same thresholds as the alert engine (`budgetState()`).
- Percentages are whole numbers, floored (99.9 % reads 99 %, never rounds up to 100). Width clamps at 100 but the text keeps the real value (112 %). Set `showStatus={false}` only when the surrounding row already prints the numbers and state. It measures spending against a limit; for savings goals use `GoalProgress` from `@/features/common/parts`.

**Badge / Alert**
- `Badge tone` neutral | accent | warn | danger, give warn/danger an `icon`. `Alert tone` info | success | warning | danger: always icon + text, `role="alert"` for warning/danger so it is announced. Use Alert for in-page messages that need to stay; Toast for transient confirmation.

**EmptyState** (`icon`, `title`, children = hint, `action`)
- Left-aligned, dashed `line-strong` border, one small lucide icon (24 px), a plain title, one hint sentence, and ONE next action (usually a primary button). Never an illustration. Different copy for "nothing yet" vs "filter returned nothing" vs "past period".

**Skeleton**
- A `Skeleton` per block with the same size as the real content (`h-8 w-48` title, `h-14` row). Static tint with a slow sheen, off under reduced motion; `aria-hidden`. Wrap the group in `aria-busy="true"`/`role="status"`. Never a lone spinner over a blank page; `Spinner` is only for buttons and tiny inline waits.

**Toast** (`toast.success|info|warning|error(title, description?)`, `toast.show({ kind, title, action })`)
- Confirms a finished action in one short sentence ("Đã xóa ngân sách"). Errors say what to do next and stay 9 s (so do toasts with an action); others 5 s. Errors/warnings are `role="alert"`. Undo is an `action: { label, onClick }`. Never put the only copy of an error the user must act on in a toast: also show it inline. Toasts sit top on phones, bottom-right on desktop; do not mount your own viewport.

**Dialog vs Sheet** (`ResponsiveDialog`, or `Dialog` / `Sheet` directly; props `open`, `onOpenChange`, `title` (required), `description`, `footer`)
- `ResponsiveDialog` = bottom **sheet** below 768 px (thumb reachable, drag the handle or title down to dismiss, safe-area padding), centred **dialog** (`max-w-md`, `rounded-xl`) from 768 px. Focus is trapped, restored on close, the first input is focused on open, Esc and the overlay close it. Footer buttons stack on mobile (primary first in a sheet), right-aligned row on desktop (cancel then primary).
- Destructive confirmation: title says what is deleted ("Xóa ngân sách?"), description says the consequence in numbers when known, the confirm button is `destructive` and names the action ("Xóa"), the cancel button is secondary. No "Are you sure?" titles. Plan-limit and upgrade dialogs are global; never build your own.

**Tabs** (`Tabs`, `TabsList variant="underline" | "segmented"`, `TabsTrigger`, `TabsContent`; Radix)
- `underline` for page sections (ledger tabs, horizontally scrollable on mobile), `segmented` for 2–4 mutually exclusive options. A trigger is `min-h-11`. If you filter one list with tabs and mount no `TabsContent`, the component removes the dangling `aria-controls` for you. Keep labels short nouns.

**Menu** (`Menu label trigger align`, `MenuItem onSelect icon danger`, `MenuSeparator`)
- Row/overflow actions and the avatar menu. Trigger is a 44 px button with `aria-label` (`label`); items are `min-h-11`; arrows/Home/End move, Esc closes and returns focus, Tab closes, outside click closes. Put destructive items last, after a separator, with `danger`. Never hide the only way to do something behind hover.

**Card / CardHeader / CardTitle**: hairline border, `rounded-lg`, no shadow, `p-4 md:p-5`; title `text-lg font-semibold`. **Avatar**: initials follow Vietnamese name order (family + given name), `decorative` when the control already names the person. **Switch**: real `role="switch"` with a label; write the state ("Bật"/"Tắt") next to it too.

## 2. Money formatting (`@/lib/format`)

- Money is an integer number of VND in JSON and in code. Never a float, never decimals, never `toFixed`.
- `formatMoney(amount, lang, sign?)`: vi `1.500.000 ₫`, en `1,500,000 VND` (a non-breaking space before the unit; the unit always AFTER the number). Negative uses the real minus `−` (U+2212), not a hyphen.
- `formatCompact(amount, lang)`: vi `1,5 tr`, `350 k`, `1,2 tỷ`; en `1.5M`, `350K`, `1.2B`. For chart axes and tight rows only.
- `formatPercent(n, lang)`: vi `82,5%`, en `82.5%`. For budget status floor to a whole number first.
- Inputs: `parseMoneyInput` (digits only) and `MoneyInput`. In JSX use `AmountText`; use `formatMoney` only for strings (aria labels, chart tooltips, CSV, toasts). Tabular numerals (`num` class) for any column.

## 3. Dates and periods

All dates are Vietnam calendar days (`Asia/Ho_Chi_Minh`); never `new Date().toLocaleDateString()`.
- `formatDate(d, lang, style)`: `short` vi `21/11/2026`, en `21 Nov 2026`; `long` vi "Thứ Bảy, 21 tháng 11", en "Saturday 21 November"; `day` vi `21/11`, en `21 Nov`; `time` `14:05` (24 h); `monthYear` vi "Tháng 11/2026", en "November 2026".
- `formatPeriodLabel('2026-11', lang)`, `vnDayKey(d)` (yyyy-MM-dd of the Vietnam day, use it to group by day), `relativeDay(d)` ('today' | 'yesterday' | null → say "Hôm nay"/"Hôm qua").
- A budget period follows the user's `month_start_day`; get the current one from `usePeriod()`/`apiPeriod`, never recompute it. API dates are ISO 8601.

## 4. Charts (Recharts, lazy-loaded chunk `charts`)

Copy the look of `features/dashboard/TrendChart.tsx` and `features/reports/daily-section.tsx`:
- Wrap in `<figure>`; the plot area is `aria-hidden` inside a fixed-height box (`h-56` or similar) so the lazy placeholder holds the same space (no layout jump); `<ResponsiveContainer>` inside it. Provide `figcaption` as the legend (small square `rounded-sm` swatch + label, text `text-sm text-ink-2`) and an **`sr-only` data table** (`caption`, `th scope`) so the numbers are available without the picture.
- Colours via CSS variables as strings: grid `CartesianGrid vertical={false} stroke="rgb(var(--line))"`; axis ticks `fill: 'rgb(var(--ink-2))', fontSize: 12`, `tickLine={false} axisLine={false}`; Y ticks via `formatCompact`; cursor `{ fill: 'rgb(var(--sunken))' }`.
- Series: income `rgb(var(--accent))`, expense `rgb(var(--ink-2))` (expenses are not red), cumulative line `rgb(var(--ink))` width 2, pace/reference line `rgb(var(--ink-3))` dashed `6 4`, a budget or limit line `rgb(var(--warn))`/`danger` only when it means "careful"/"over". By-category charts use `categoryVisual(c).color` (never hand-picked colours) and label slices with name + amount + share, not colour alone.
- Bars: `radius={[4, 4, 0, 0]}`, `maxBarSize` 14–18, `isAnimationActive={false}` (motion comes from the page, and reduced motion stays honest). Tooltip: `background: rgb(var(--surface))`, `1px solid rgb(var(--line))`, radius 12, text `rgb(var(--ink))`, `boxShadow: var(--shadow-float)`, values through `formatMoney`, labels through `formatPeriodLabel`/`formatDate`.
- Dark mode works for free because every colour is a variable; never pass hex. Add a calm empty state when there are no points; do not draw an empty axis.

## 5. Motion

- Purpose only: confirm an action, show a change, keep context. Durations 150–250 ms, `ease-out`: fade-in 150, rise-in 180 (page change), dialog 180 in / 150 out, sheet 220 up / 200 down, toast 180, progress width 400 ms. Tailwind animations: `animate-fade-in`, `animate-rise-in`, `animate-sheet-up`, `animate-toast-in`, `animate-dialog-in`.
- Numbers that change in place ease for ~320 ms (`useCountUp(target, { duration })`, already inside `AmountText` and `ProgressBar`). The first render shows the final value at once. Money is a whole dong at every frame.
- **Reduced motion:** `useReducedMotion()` (`@/hooks/useReducedMotion`) is true when the OS asks for less motion: render the final state with no animation. In CSS add `motion-reduce:animate-none` / `motion-reduce:transition-none`. `useInView()` (same file) reveals a block once when it scrolls into view and never hides it again.
- No bounce, parallax, looping decoration, or confetti. The single exception is the calm "goal reached" ring pulse (one 600 ms pulse). Skeleton sheen is slow (1.6 s) and off under reduced motion.
