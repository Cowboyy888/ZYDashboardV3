# Decision Log & Completion Status

## Completion status — First pass (Operations MVP)

| Module | Status | Notes |
| --- | --- | --- |
| Engineering harness | ✅ Complete | AGENTS.md, README, docs/*, `npm run verify`, CI, `.env.example` |
| Brand & foundation | ✅ Complete | 中粤铁网 red/charcoal UI, auth, RBAC, immutable audit log, dashboard |
| Settings / master data | ✅ Complete | Editable locations, families, SKUs (units/conditions/min-stock), users, audit |
| Employees | ✅ Complete | Profiles, Khmer names, private photos (signed URLs), sensitive data gated |
| Attendance | ✅ Complete | Morning/afternoon entry, bulk present, exceptions, unmarked warning, dashboard |
| Telegram | ✅ Complete | Mock/http adapters, Send-now, idempotent scheduled jobs, cron endpoints |
| Core inventory | ✅ Complete | Append-only ledger, transfers, negative guard + Owner override, dashboard, report |
| Attendance groups & grouped report | ✅ Complete | Editable groups (add/rename/reorder/archive/reactivate); employee group + number/display/title/label; exact 中粤钢铁 grouped Telegram format generated from records |
| Bilingual UI (EN / 中文) | ✅ Complete | Default English; EN \| 中文 segmented switch in header (desktop + mobile); real dictionaries; cookie + profile persistence; action/validation messages localised; Telegram report stays Chinese with a future-ready report-language setting |
| Purchasing / Sales / Payroll / Reports | ⏳ Placeholder | Navigation entries only; scoped for passes 2–4 |
| Verification | ✅ `npm run verify` green | 68 unit/integration tests + 7 Playwright specs (attendance, transfer, report-preview, employee-create ×2, 2 smoke); build succeeds |

### Phase-1 acceptance fixes (post-review)

| Fix | Status | Notes |
| --- | --- | --- |
| Real logo | ✅ | Supplied PNG trimmed to a transparent red mark (public/brand/zysteel-logo.png), rendered at fixed height / auto width (proportions preserved) in sidebar, app header (desktop + mobile), and login. |
| Inventory totals by family + unit | ✅ | Removed the mixed-unit "Company grand total". `totalsByFamilyUnit` never sums 张/捆/吨/kg together; totals shown per (family, unit) on Inventory + Dashboard. Unit-tested. |
| Telegram Report Preview page | ✅ | Visible `/reports` page renders the exact grouped Chinese morning/afternoon report from live records (group actual/scheduled, leave details, final 总计/实到) via the same builder the jobs use. |
| Playwright in `verify` | ✅ | e2e is a first-class verify step that runs whenever local Supabase is reachable (auto-detected); global-setup seeds a test Owner + login state; specs: attendance entry, stock transfer, report preview (+ smoke). CI boots Supabase and runs it with `REQUIRE_E2E=1`. |
| Safe Owner bootstrap | ✅ | Public self-signup disabled (`enable_signup=false`). First Owner created only while `owner_exists()` is false (server action, service-role); afterward setup shows "already configured" and users are added only by an Owner via Settings → Users. |
| Employee create fix | ✅ | Root cause: schema required a manual `employeeCode` + a Khmer/English/Chinese name. Now required = **Display name, Attendance group, Job title**; all else optional; start date defaults to today. IDs are generated atomically in the DB (`employee_seq` + trigger) as `ZY-0001`… (never reused, unique `seq_no` retained for `7号`); Employee ID is read-only on the profile. Generic "Validation failed" replaced by per-field EN/ZH errors that retain entered values; photo never blocks creation. Unit + Playwright tests confirm `ZY-0001` then `ZY-0002`. |

## Key decisions

- **Ledger over totals.** Signed `stock_movements.quantity`, balance =
  `SUM(quantity)` via the `stock_balances` view. Rationale: full traceability,
  transfers total-preserving by construction, auditable. Enforced by a DB `CHECK`
  on sign + trigger for non-negativity.
- **Invariants in Postgres, not just the app.** Triggers enforce non-negative
  stock (Owner override only), append-only ledger + audit log, and
  no-hard-delete of attendance. So correctness survives bugs or direct SQL.
- **Salary column protection via `employee_private`.** RLS is row-level; a
  separate table gives us column-level protection (Owner/System/Payroll only)
  cleanly. Photos/docs use private Storage buckets + signed URLs.
- **RBAC single source + RLS mirror.** `src/lib/domain/rbac.ts` is authoritative
  for the app and unit-tested; `0003_rls.sql` mirrors it in the DB.
- **Timezone: UTC storage + local `business_date`.** Avoids day-boundary
  ambiguity; display + scheduling in Asia/Bangkok; dd/mm/yyyy formatting.
- **Adapters behind interfaces.** Telegram mock by default → the whole app runs &
  tests with **no credentials and no network**. Real Bot API via env.
- **Idempotent reports.** `sent_reports.report_key` unique + `sendReportOnce`;
  manual "Send now" bypasses the guard (to resend corrections) but is logged.
- **Grouped attendance report.** The Telegram attendance report uses the exact
  中粤钢铁 grouped format (date `YYYY/MM/DD`, `{group} {actual}/{scheduled}` lines
  in configured order, nonzero 请假/缺勤/迟到/未打卡 sections with employee detail
  lines, `总计 … 实到 …` footer). It is built purely in
  `src/lib/domain/attendance-report.ts` from the shift's records — never typed by
  hand — and is exact-match unit-tested. "实到" = present + late; the group
  denominator is active employees assigned to that group.
- **Bilingual UI switching.** Real dictionaries in `src/lib/i18n` (no browser
  auto-translation), default English. The `EN | 中文` segmented switch persists the
  choice to a cookie (local/demo) and, when signed in, to `profiles.locale` via a
  locale-only RPC; server components re-render on `router.refresh()`, so every
  label switches immediately. Business data (Chinese product names, Khmer/English
  employee names, numbers, dates) is never translated. Action/validation messages
  are localised at display time via a phrase map so action code stays English.
  Telegram attendance reports remain Chinese; a `report_language` setting is
  stored for the future but does not change the current format.
- **First signup = Owner.** Simplest safe bootstrap; subsequent users are Viewers
  promoted via Settings → Users.
- **Placeholders for later passes.** Purchasing/Sales/Payroll/Reports are routed
  and permission-gated but intentionally not implemented in pass 1.

## Assumptions

- 螺纹盘圆 specifications/units are fully configurable; seeded with one example
  spec and default unit 捆 (adjust in Settings).
- `purchase_receipt` and `sale_delivery` movement types exist in the ledger now
  (so balances/reports are forward-compatible), but the **workflows** that create
  them (goods receiving, confirmed delivery) land in passes 2–3. In pass 1 they
  can only be posted by warehouse/admin via the generic movement path.
- Production does **not** auto-consume raw materials in v1 (documented future BOM).
- Local development targets the Supabase CLI stack; a live database is required to
  exercise auth, RLS, and the UI end-to-end (the domain + build are validated
  without one).

## Deferred / future work

- Passes 2–4 (Purchasing, Sales, Payroll) per `docs/product-spec.md`.
- Full filterable Reports module with CSV/export.
- Regenerate fully-typed Supabase client (`supabase gen types`) to replace the
  hand-maintained row types in `src/lib/db/types.ts`.
- Authenticated Playwright flows once a Supabase test project + CI secrets exist
  (the e2e job is scaffolded but gated `if: false`).
