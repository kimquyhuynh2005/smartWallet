# Voice, tone and copy bank (Vietnamese first, English second)

Copy lives in `apps/web/src/locales/{vi,en}/<feature>.json` (feature namespace) and `src/i18n/locales/{vi,en}.json` (shell: `nav.*`, `common.*`, `errors.*`, `ui.*`). The examples below are copied from those files; reuse their shape and warmth.

## Contents
1. Voice principles
2. Fixed terms
3. Writing rules by situation (empty, error, confirm, success, limits)
4. Copy bank
5. Numbers, dates and units in copy
6. i18n mechanics

## 1. Voice principles

- **Warm, plain, specific.** A friend who is good with money. "Hôm nay bạn có thể chi tối đa 142.000 ₫", not "Daily safe-to-spend allowance".
- **Numbers before adjectives.** Say how much, then how that feels.
- **Never scold, never shame.** Over budget: "Ăn uống đã vượt 12%. Mình điều chỉnh lại nhé?" not "Bạn đã chi tiêu quá mức!". No guilt about spending, no loss-framing for streaks, no countdown pressure, no "you failed".
- **Vietnamese:** *bạn* (you) and *mình* (we/I); short sentences; sentence case; natural word order, never word-for-word English. Soft closers ("nhé", "giúp bạn") but not in every line. No exclamation marks except a reached goal. No jargon ("net", "liquidity", "KPI").
- **English:** "you" and "let's"; same warmth, same brevity; sentence case; no exclamation marks except a reached goal.
- **Errors** say what happened and what to do next. They never blame the user and never show codes or stack traces. **Empty states** invite the first action. **Confirmations** are one short sentence in the past tense.
- Write both languages in the same change. If an English line is much longer, shorten it; layouts must survive both.

## 2. Fixed terms (never vary these)

| Concept | vi | en |
|---|---|---|
| Wallet | **Ví** | Wallet |
| Transaction | **Giao dịch** | Transaction |
| Budget | **Ngân sách** | Budget |
| Goal | **Mục tiêu** | Goal |
| Report | **Báo cáo** | Report |
| Overview / home | Tổng quan | Overview |
| Category | Danh mục | Category |
| Settings | Cài đặt | Settings |
| Plan (Free / Premium) | Gói dịch vụ (Miễn phí / Premium) | Plan |
| Income / Expense / Transfer | Thu nhập (Thu) / Chi tiêu (Chi) / Chuyển ví | Income / Expense / Transfer |
| Safe to spend today | Hôm nay chi tối đa | Safe to spend today |
| Budget states | Đang ổn / Gần hết / Vượt ngân sách | On track / Almost used / Over budget |
| Add (action) | Thêm giao dịch | Add transaction |

Use the same word for the same thing everywhere (don't mix "ví" and "tài khoản", "mục tiêu" and "kế hoạch"). Currency is `₫` after the number in vi and `VND` after the number in en.

## 3. Writing rules by situation

- **Empty state:** title = the fact in plain words ("Chưa có giao dịch nào"); hint = one sentence on the benefit or the first step, with a concrete example; one action button named for what it does ("Tạo mục tiêu đầu tiên"). Distinguish *nothing yet* from *filter shows nothing* from *this past period has none*.
- **Error:** title "Chưa tải được …" / "Could not load …"; hint = a likely cause and reassurance ("Dữ liệu của bạn vẫn an toàn") + "Bạn thử lại nhé."; button "Thử lại". A save that failed: say the data you typed is kept.
- **Confirmation (destructive):** title asks about the specific thing ("Xóa mục tiêu “Mua laptop”?"); body states the consequence and what survives, and offers the gentler alternative if there is one; the confirm button repeats the verb ("Xóa mục tiêu"); the cancel button is "Hủy".
- **Success toast:** past tense, 2–5 words, no "thành công" filler ("Đã xóa ngân sách", "Changes saved").
- **Limit reached (Free):** state the number ("3/3 ví"), what Premium unlocks, and an easy "Để sau"; no urgency, no countdown.
- **Celebration:** the only place for an exclamation mark, one calm sentence plus one line of thanks ("Mỗi lần góp đều có ích.").
- **Labels and buttons:** verbs for actions ("Thêm ngân sách", "Lưu thay đổi"), nouns for tabs/sections. Never "Click here". Placeholders are examples, not instructions.

## 4. Copy bank (from the locale files)

Navigation: Tổng quan · Giao dịch · Ngân sách · Mục tiêu · Báo cáo · Ví · Danh mục · Gói dịch vụ · Cài đặt · Quản trị · Thêm giao dịch.

**Empty states**
- dashboard: "Bắt đầu bằng khoản chi đầu tiên" / "Ghi lại ly cà phê hay bữa trưa hôm nay, chỉ mất vài giây. Tổng quan sẽ tự đầy lên khi bạn có thêm giao dịch." → "Thêm giao dịch đầu tiên". en: "Start with your first expense" / "Log today's coffee or lunch, it takes a few seconds. This page fills in as you add more transactions."
- goals: "Chưa có mục tiêu nào" / "Nghĩ tới một thứ bạn muốn dành tiền cho: quỹ khẩn cấp, chiếc laptop, chuyến đi cuối năm. Mình giúp bạn tính mỗi tháng cần góp bao nhiêu." → "Tạo mục tiêu đầu tiên". en: "No goals yet" / "Think of something you want to save for: an emergency fund, a laptop, a year-end trip. We will work out how much to set aside each month."
- budgets: "Kỳ này chưa có ngân sách" / "Bắt đầu nhanh bằng một mẫu có sẵn, hoặc tự đặt hạn mức cho từng danh mục. Bạn luôn sửa lại được."; past period: "Kỳ này đã kết thúc và chưa có ngân sách nào được đặt. Bạn chọn kỳ gần đây hơn ở thanh chọn tháng nhé."
- wallets: "Bạn chưa có ví nào" / "Tạo ví cho tiền mặt, ngân hàng hoặc MoMo để mình theo dõi số dư giúp bạn."
- transactions: "Chưa có giao dịch nào" / "Thêm khoản chi đầu tiên của bạn, chỉ mất vài giây."
- filtered: "Không có mục tiêu nào ở nhóm này."

**Errors**
- "Chưa tải được ngân sách" / "Có thể mạng đang chập chờn. Bạn thử lại nhé." (en: "Could not load budgets" / "The connection may be unstable. Please try again.")
- "Chưa tải được tổng quan" / "Có thể mạng đang chập chờn. Dữ liệu của bạn vẫn an toàn, bạn thử lại nhé." (en: "Couldn't load your overview" / "The connection may be unstable. Your data is safe, please try again.")
- Field error: "Hạn mức phải lớn hơn 0." (state the rule, not the blame.)

**Confirmations**
- "Xóa ngân sách này?" / "Mình chỉ xóa hạn mức của kỳ này. Các giao dịch của bạn vẫn giữ nguyên." → "Xóa"
- "Xóa mục tiêu “{{name}}”?" / "Mục tiêu và lịch sử góp sẽ bị xóa. Việc này không hoàn tác được. Nếu chỉ muốn tạm dừng, hãy chọn Hủy mục tiêu." → "Xóa mục tiêu"
- "Xóa ví {{name}}?" / "Ví này có {{count}} giao dịch (kể cả chuyển ví liên quan). Tất cả sẽ bị xóa cùng ví." → "Xóa ví và giao dịch"

**Success toasts:** "Đã tạo mục tiêu" · "Đã lưu thay đổi" · "Đã xóa mục tiêu" · "Đã góp vào mục tiêu" · "Đã cập nhật hạn mức" · "Đã xóa giao dịch" · en: "Goal created" · "Changes saved" · "Added to your goal" · "Limit updated" · "Transaction deleted".

**Celebration:** "Bạn đã đạt mục tiêu “{{name}}”!" / "Mỗi lần góp đều có ích. Chúc mừng bạn đã đi hết chặng đường này." (en: "You reached “{{name}}”!" / "Every contribution counted. Congratulations on getting all the way there.")

**Budget copy:** "Hôm nay chi tối đa" · "mỗi ngày · còn {{days}} ngày" · "Đang ổn" / "Gần hết" / "Vượt ngân sách" · alerts: "Đã dùng {{pct}}% ngân sách {{name}}".

## 5. Numbers, dates and units in copy

- Always interpolate formatted values: `t('key', { amount: formatMoney(n, lang) })`; never hand-build "đ" or "VND" strings.
- Pluralise with i18next keys (`_one`/`_other` in en; vi has a single form).
- Dates: vi `21/11/2026` and "Thứ Bảy, 21 tháng 11", en `21 Nov 2026`. Periods: "Tháng 11/2026" / "November 2026". Compact amounts: vi `1,5 tr`, `350 k`; en `1.5M`, `350K`. Relative: "Hôm nay", "Hôm qua". All via `src/lib/format.ts`.
- Counts of days: "5 ngày" / "5 days". Percentages: floor to a whole number in budget status ("82%").

## 6. i18n mechanics

- `const { t } = useTranslation('<feature>')`; shell strings with `useTranslation()` (default namespace) and keys like `t('common.close')`. The file name is the namespace; nested keys group by area (`empty.title`, `error.hint`, `toast.deleted`, `delete.confirm`).
- Add every key to BOTH `vi` and `en`. A raw key showing on screen is a bug (the browser probe reports them).
- `lang` follows the UI language (`useLang()`), and the document `lang` is set by the shell. Do not store copy in components, constants or mock data, except demo data that is meant to be Vietnamese content (note texts, wallet names).
