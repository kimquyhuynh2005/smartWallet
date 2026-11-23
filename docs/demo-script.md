# SmartWallet: 10-minute demo script (frontend, 24/11/2026)

Everything below was clicked through end to end in mock mode at 1440 px and at 360 px (`node apps/web/scripts/demo-walkthrough.mjs`, 28 steps, no console errors, no horizontal scroll). The amounts and labels are the ones the app shows.

## Open product decisions for the team (decide before or after the presentation)

| # | Decision | Where it sits today | Suggested answer |
|---|---|---|---|
| 1 | **Premium price** (BR-28). Pricing section and /plans show a placeholder | `PREMIUM_PRICE_VND = 49_000` in `pages/landing/Sections.tsx` and `features/plans/constants.ts`; the API does not expose a price | decide the number; ideally `plans` returns it |
| 2 | **Real payments.** Checkout is a mock ("Xác nhận dùng thử", no money is taken) | `POST /subscriptions/mock-checkout` | say "demo checkout" out loud; real gateway is out of scope |
| 3 | **Who is on the team page.** /about uses placeholder names | `apps/web/src/features/about/team.ts` (one file) | replace the five names, roles are already right |
| 4 | **Saving streak rule.** Daily limit = total budget / days of the period (not "what is left today"); counts the last 60 days | `features/dashboard/streak.ts`, proposal BR-34 `GET /reports/streak` | keep, or switch to the "safe to spend today" rule |
| 5 | **Alert language.** Stored notification text is Vietnamese only (BR-26) | the English UI shows Vietnamese alert text from the server | add `messageEn` or a message key |
| 6 | **Email verification on the real API.** Login is blocked until the link is clicked; with `MAIL_TRANSPORT=console` the link only appears in the API log (BR-31). The mock shows a "Mở liên kết xác thực" button instead | CLAUDE.md open question 3 | for a real-API demo, use the seeded users, not a new registration |
| 7 | **Missing endpoints the demo uses in mock mode only:** subscriptions/me, cancel, goal contributions history, resend-verification, admin lock/plan edit, top notes (BR-01..14) | `docs/backend-requests.md` | the backend owner picks them up in that order |
| 8 | **Goal contributions do not move wallet money** (CLAUDE.md known gap). The contribute dialog says so | goals | decide if a contribution should create a transfer |
| 9 | **Google sign-in** is untested with real credentials (BR-30); the button explains it when unconfigured | auth | skip it in the demo |
| 10 | **Test documents.** `docs/test-cases.md` and `docs/test-report.md` are not generated yet; the last full runs were: unit 259/259 pass, coverage `src/lib` 89.1 % and `src/ui` 95.7 %, mock E2E 0 unexpected failures (desktop and mobile). The real-API E2E rerun with paced logins did not finish | `README.md` "Tests" | generate the two documents from the specs before hand-in |

## Before you walk on stage (5 minutes, do not skip)

1. Demo mode is **mock mode**. It needs no Docker, no database, no internet, and the data resets on a page reload, so every run starts clean. (The real API is fine for a second laptop, but Premium Minh, mock checkout and the admin edits only exist in the mocks.)
2. Start it with one command from the repo root: `npm run web:mock` then open <http://localhost:5173/?lang=vi&theme=light>. Safer on a projector (no dev server, instant load): `npm run build:mock -w @smartwallet/web && npm run preview:mock -w @smartwallet/web`, then <http://localhost:4173/?lang=vi&theme=light>.
3. Chrome, 1440 px or full screen, zoom 100 %, notifications off. Open a second tab on `/dev/ui` is **not** needed (it is not in the production build).
4. **Never press F5 during the demo**: it resets the mock database and drops the login. Use the in-app links. If you must reload, restart from the minute the data matters (see Fallbacks).
5. Accounts (password for all `Demo@12345`): `linh@smartwallet.demo` (Free), `minh@smartwallet.demo` (Premium), `admin@smartwallet.demo` (admin). The new user you register on stage is `hoa.pham@example.vn`.
6. Keep `apps/web/.cache/demo/desktop/*.png` open in a folder window: they are the screenshots of this exact path, your last-resort fallback.

## Minute by minute

### 0:00 to 1:00 · Landing (public)
- **Do:** show `/` top to bottom (hero, live preview, "Cách hoạt động", pricing, FAQ). Scroll to the footer and click **Về chúng tôi**; scroll the About page (mission, five roles, privacy promise), then click the logo to return.
- **Say:** "SmartWallet is for students and young professionals who lose track of spending. One question on the first screen: will my money last until the end of the month? Free plan has 3 wallets, 5 budgets, 2 goals; Premium removes the limits. Everything is Vietnamese first, English one click away, light and dark."
- **Show:** the language toggle (VI/EN) once, the theme toggle once, then back to VI light.

### 1:00 to 2:30 · Register, verify, onboarding with a template
- **Do:** **Bắt đầu** → fill: name `Phạm Thu Hoa`, email `hoa.pham@example.vn`, password `Demo@12345` (point at the strength meter) → **Tạo tài khoản**.
- **Say:** "A real product sends a verification email. In demo mode there is no inbox, so the app offers the link directly." Click **Mở liên kết xác thực** → "Email đã được xác thực" → **Đăng nhập** (same email and password).
- **Onboarding (4 steps):** name → **Tiếp tục**; income `8000000` (type digits, it groups as `8.000.000`) → **Tiếp tục**; wallet name `MoMo`, current balance `1500000` → **Tiếp tục**; template step: leave **50/30/20**, read the preview ("Gợi ý cho thu nhập …", needs/wants/savings split in whole thousands) → **Hoàn tất thiết lập** → "Bạn đã sẵn sàng" → **Vào tổng quan**.
- **Say:** "Three questions and the budgets exist. The split is 50 % needs, 30 % wants, 20 % savings; on the real API it follows what you actually spent in the last three months." The new dashboard is calm and nearly empty, and invites the first expense.
- Then open the avatar menu (top right) → **Đăng xuất**.

### 2:30 to 4:00 · Linh, quick add that raises an 80 % alert
- **Do:** log in as **linh@smartwallet.demo** / `Demo@12345` (or the one-click "Linh" demo button on the login page). Dashboard: point at "Còn lại trong kỳ này", then the green box "Hôm nay bạn có thể chi tối đa" (the one big number), the wallets (3 wallets: Tiền mặt, MoMo, Vietcombank), the goals.
- **Say:** "Linh is 21, Free plan, pays with MoMo. The dashboard leads with what she can still spend today, not with charts."
- **Do:** press **N** (or **Thêm giao dịch**). Quick add: amount `100000` (it shows `100.000`), category **Giải trí**, **Lưu**.
- **Expected:** a warning toast "Đã dùng 88% ngân sách Giải trí" / "Sắp chạm ngân sách…", the bell shows a new unread number. Click the bell: the alert is listed.
- **Say:** "Entertainment was at 55 % of 300.000 ₫. This expense takes it to 88 %. The alert fires once per threshold, 80 and 100, never twice. It arrived in under two seconds, no refresh."
- **Optional (10 seconds):** open quick add again and type the note `highlands`; the category suggestion pre-selects **Ăn uống** ("Gợi ý").

### 4:00 to 5:15 · Dashboard and budgets
- **Do:** back on **Tổng quan**: the "Ngân sách sắp hết" card shows **Di chuyển 112 % Vượt ngân sách** (red, octagon icon, words), **Mua sắm 95 % Gần hết** (amber, triangle). Then **Ngân sách**.
- **Say:** "Never colour alone: every state has an icon and a word. Calm under 80, warning from 80, over from 100. Expenses are ink, not red: spending is normal; red is only for going over."
- **Show on /budgets:** the total budget `6.500.000 ₫`, Ăn uống at 88 % (`1.320.000 ₫ trên 1.500.000 ₫`), "Hôm nay chi tối đa" per category, the **Dùng mẫu** button (templates) and the rollover switch.

### 5:15 to 6:15 · Goals
- **Do:** **Mục tiêu** → **Chuyến đi Đà Lạt** (`2.200.000 ₫ trên 6.000.000 ₫`, 36 %, "Cần góp … mỗi tháng"). On the detail page (history of contributions) click **Góp / rút**, type `500000`, **Góp vào mục tiêu**; the ring and numbers ease to `2.700.000 ₫` (45 %).
- **Say:** "A goal is a deadline plus an amount; the app works out how much to set aside each month. It never nags: it says what is needed, in numbers."
- **Do not** say contributions move wallet money (decision 8).

### 6:15 to 7:15 · Reports (Free)
- **Do:** **Báo cáo**: category donut with names and shares, 6-month bars, the daily-spending line against a straight pace line. Switch to the **12 tháng** tab: a locked card ("Xem xu hướng 12 tháng là tính năng của gói Premium"). Press **Xuất CSV**: the upgrade dialog opens (do not confirm yet; press **Để sau**).
- **Say:** "Free sees the last 6 months. The limit is enforced by the API (403 `PLAN_LIMIT_REACHED`); the UI never guesses it, it just shows the one global dialog."

### 7:15 to 8:30 · Plan limit and upgrade
- **Do:** **Ví** → **Thêm ví** → name `Du lịch` → **Lưu**. Linh already has 3 wallets, so the dialog **Tính năng của Premium** opens ("ví của gói Miễn phí", usage 3/3). Click **Xem các gói**.
- **/plans:** the comparison table (Free vs Premium; price is the placeholder `49.000 ₫`, say "price to be confirmed"). **Nâng cấp Premium** → "không thu tiền thật" → **Xác nhận dùng thử** → "Bạn đang dùng gói Premium."
- **Do:** back to **Ví** → **Thêm ví** `Du lịch` → toast "Đã tạo ví Du lịch" (the limit is gone). **Báo cáo** → **12 tháng** now draws.
- **Say:** "Plans are data, not code: limits come from the `plans` table. Checkout is a demo here; nothing is charged."
- Then avatar menu → **Đăng xuất**.

### 8:30 to 9:15 · Minh (Premium) in 45 seconds
- **Do:** log in as **minh@smartwallet.demo** / `Demo@12345` (or the "Minh" demo button). **Mục tiêu**: **Mua laptop mới** `33.000.000 ₫ trên 35.000.000 ₫` (94 %), and **Đặt cọc mua nhà** `135.000.000 ₫ trên 400.000.000 ₫`. If the dashboard is still on screen: six months of history and 12-month trend.
- **Say:** "Minh is 27, Premium, saving for a house deposit. Six months of real-looking history; the laptop goal is almost there. Premium also unlocks CSV import and export and custom alert thresholds."

### 9:15 to 10:00 · Admin and close
- **Do:** log out, log in as **admin@smartwallet.demo** / `Demo@12345`. The overview shows aggregate numbers and a privacy note; tabs: users, plans, categories, keywords; there are no transaction rows anywhere.
- **Say:** "The admin manages users and plans but can never see an individual transaction. That is a rule of the product, tested end to end."
- **Close (15 seconds):** "Frontend: React, TypeScript, Tailwind, TanStack Query; 259 unit tests, Playwright suites on a 360 px phone and a 1440 px desktop, WCAG 2.1 AA as the target, dark mode. Open decisions are at the top of this file."

## If something fails live (fallbacks, in order)

| Symptom | Do this (under 20 seconds) |
|---|---|
| Page blank, or a reload happened by accident | Open `/?lang=vi&theme=light` again: the data is back to the seed. Jump to the minute you were in and log in again (Linh, Minh, admin all work after a reset). Say "demo data resets on reload". |
| Verify button missing / register fails | Skip registration: log in as Linh and say "registration and onboarding are covered by the E2E suite; here is the result" while showing `.cache/demo/desktop/03..10-*.png`. |
| No alert toast after the quick add | The alert is also stored: click the bell, or open `/notifications` (Linh already has a seeded 80 % and a 100 % alert). If the amount was wrong, add `100000` to **Giải trí** once more. |
| Plan dialog does not open | Linh must be **Free**. If you already upgraded, log out and back in after a reload, or open **Báo cáo** as a Free user and press **Xuất CSV** (also opens the dialog). |
| Dev server dies | Run `npm run preview:mock -w @smartwallet/web` in a second terminal (needs `build:mock` once) and open port 4173. |
| Projector too small / text cut | Browser zoom 110 % to 125 % (layout reflows; do not go below 1280 px width) or switch to the phone view in DevTools at 360 px. |
| Everything is down | Walk through the screenshots in `apps/web/.cache/demo/desktop` (28 numbered PNGs in demo order); regenerate them with `node apps/web/scripts/demo-walkthrough.mjs --base http://localhost:5173 --vp desktop` while the app runs. |
| Someone asks "does it work against the real API?" | Yes: `docker compose up --build` then `npm run web:real`; log in as `demo@smartwallet.local` / `Demo@12345`. Premium, mock checkout, contributions history and admin edits are mock-only until the backend requests in `docs/backend-requests.md` ship. |

## One-page cheat sheet

| Step | Account | Type | Expect |
|---|---|---|---|
| Register | new | `Phạm Thu Hoa`, `hoa.pham@example.vn`, `Demo@12345` | "Kiểm tra email của bạn" |
| Onboarding | new | income `8000000`, wallet `MoMo`, balance `1500000`, template 50/30/20 | "Bạn đã sẵn sàng" |
| Quick add | Linh | `100000`, **Giải trí** | toast "Đã dùng 88% ngân sách Giải trí" |
| Goal | Linh | **Góp / rút** `500000` | Đà Lạt 2.700.000 ₫ (45 %) |
| Plan limit | Linh | new wallet `Du lịch` | dialog "Tính năng của Premium" (3/3) |
| Upgrade | Linh | **Nâng cấp Premium** → **Xác nhận dùng thử** | "Bạn đang dùng gói Premium." |
| Premium view | Minh | none | laptop goal 94 % |
| Admin | admin | none | aggregates only, no transactions |
