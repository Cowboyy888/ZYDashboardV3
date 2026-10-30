# P5.1 — Dashboard audit and KPI definitions

**Later P9 update:** dashboard module query/section gating (the first recommendation
below) is implemented in the working tree. See [P9 audit](PHASE9_TECHNICAL_AUDIT.md)
for role/request verification and remaining findings. All P5.1 formulas and gaps
below describe its dated baseline unless explicitly superseded; P5.2 is still
unimplemented.

Audit date: 30/10/2026. Baseline: current working tree, including the earlier
source-capture and P4.1 changes; those changes are not evidence of a production
deployment. This increment changes documentation only. It adds no dashboard,
aggregation, schema, permissions, cache, business records or deployment.

## Acceptance and evidence

P5.1 is complete when the existing capabilities/gaps, metric grains/formulas,
dates, units/currencies, authorization, missing-data rules, dependencies,
priorities and verification limits are documented against source. Later sections
define a proposed implementation contract; they do not claim the metrics have
already shipped or invent missing historical facts.

Reviewed AGENTS/CLAUDE/README, product/architecture/decisions/roadmap, data
dictionary and runbooks; dashboard/sales/CRM/production/tasks/payroll/report
pages; query/domain/action layers; migrations, indexes, RLS and existing tests.
No production database, live query plan, production latency, or deployed schema
was inspected. Local Supabase was unavailable in preceding verification. Earlier
disposable PostgreSQL checks verify source migrations, not deployed data quality.

## Existing capabilities and confirmed gaps

| Area                   | Present and reusable                                                                                                                                                                              | Missing or limited                                                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Main dashboard         | Attendance shifts/MTD rate, production receipts today, family/unit stock, low stock, employee exceptions, gated sales/delivery/inquiry/payroll/price counters; `src/app/(app)/dashboard/page.tsx` | No executive financial/pipeline/task/production-plan overview, common period filters, trend charts or management queue. Top operational sections are ungated.                                                                        |
| Sales                  | Orders/items, confirmations, partial/full delivery, cancellation, permanent order IDs, customer IDs, per-order currency; Sales dashboard and `domain/sales-view.ts`                               | Main “Sales today” counts drafts too. No order-level salesperson employee FK. Full-table helpers cannot guarantee complete aggregates at API row limits.                                                                             |
| CRM/quotes             | Inquiry status/category/probability, next follow-up/history, source/loss reasons, requested specs/quantities; issued quote dates/numbers, salesperson, quote→draft-order link                     | No canonical inquiry↔quote opportunity/revision family, scheduled-follow-up completion ledger or dependable closed-event date. Source quote conversion is best effort, not a complete cohort linkage.                                |
| Targets/KPI/commission | Monthly employee targets; manual scorecards and tested weight/attainment math; commission tables/domain                                                                                           | Targets lack currency; order creators are profiles, not salesperson employees. Commission has no active application workflow. Scorecard actuals are entered values, not automatic verified sales.                                    |
| Collections            | Current SO/quote deposit/balance paid-date flags; generated deposit invoice amounts; historical receipts and PDF                                                                                  | Since 0037 the UI no longer records receipt amounts. Flags and dormant ledger-derived status columns cannot establish current cash collected or receivables.                                                                         |
| Inventory              | Append-only movements, balances, SKU/family/location/unit/condition, minimum levels, sales commitments, existing PDF/Excel                                                                        | Some readers cannot see sales commitments under RLS. No finished demand aggregation, stock-at-request snapshots, historical shortages, coverage or configurable A/B/C recommendations. Standard/Special classification is not A/B/C. |
| Production             | P4.1 source/internal plans, approved snapshots, due dates, versioned transitions, bounded reads; separate `production_output` ledger entries                                                      | P4.1 is planning only. No dated schedule allocation, execution/QC, actual accepted/rejected output, downtime/capacity or plan-to-stock posting linkage.                                                                              |
| Team/payroll           | Tasks/daily metrics/weekly views, employee targets/KPI; payroll live/snapshot rules and protected data                                                                                            | No centrally derived outcome ranking. Daily activity counts are not transactional orders. Payroll counts must stay separate from sensitive payroll amounts.                                                                          |
| Reporting/alerts       | Permission-gated attendance/inventory preview; module-specific PDF/Excel utilities/endpoints                                                                                                      | No centralized cross-domain report catalog or deduplicated management action queue. Existing Telegram concurrency/retry limitations remain.                                                                                          |

### Current main-dashboard formulas

All “today” dates use `businessDate()`. Main dashboard helper implementations live
in `src/lib/db/queries.ts`; pure assembly is in attendance/inventory domains.

| Current card                 | Actual calculation                                                                                                         | Interpretation/gap                                                                                                                                             |
| ---------------------------- | -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Morning/afternoon attendance | `summarizeShift(active employee IDs, today's rows)`; headline `present / totalActive`, separate late/leave/absent/unmarked | Headline counts only Present; Late is separate. This differs from the MTD and Telegram present+late definitions. Not a payroll worked-day formula.             |
| MTD attendance rate          | Exact HEAD counts: present+late divided by all non-leave attendance rows from month start through today                    | Record-based rate excludes absent/unrecorded employee-shifts with no row. It is not scheduled-headcount compliance. Empty/error returns currently become zero. |
| Production today             | Sum `stock_movements.quantity` where type=production_output and business_date=today                                        | Currently no SKU/family/unit grouping despite 张 · 钢筋网 label. Can mix units and truncate at row limits. Not QC-accepted output.                             |
| Family stock totals          | `stock_balances` → `buildInventoryRows` → `totalsByFamilyUnit`                                                             | Correct grouping separates units. Physical stock, not free-to-promise stock or stock value. Active-master filtering may hide archived stock.                   |
| Low stock                    | Positive configured minimum and physical total `<= minimum_level`                                                          | Equality is low; zero/unset minimum disables the warning. Missing balances/errors must not be interpreted as measured zero.                                    |
| Sales today                  | Exact count of order_date=today and status≠cancelled                                                                       | Includes Draft. It is neither confirmed order count nor revenue.                                                                                               |
| Pending delivery orders      | Exact count where status is confirmed/partially_delivered                                                                  | All dates; delivery backlog, not unpaid balance.                                                                                                               |
| Open inquiries               | Status unset or category neither won nor lost                                                                              | Count of open inquiry records, not due/overdue follow-ups or unique customers. A failed status lookup can overcount.                                           |
| Payroll pending              | Exact count of Draft payroll runs                                                                                          | Run count only, gated by payroll:view; no salary is queried for this card.                                                                                     |
| Price counts                 | Active status, created since Bangkok month start, expiry in today..today+30                                                | “Changed” currently means created_at, not price-change event history. Dashboard displays only part of the six-count helper result.                             |

## Shared metric contract for later implementation

- **Grain:** stable source IDs first. Aggregate line items once per order before
  joining payments/deliveries. Do not sum order totals repeated across joined
  lines, or use `SUM(DISTINCT amount)` to deduplicate equal-valued real records.
- **Money:** separate USD/KHR/CNY. SO value is `SUM(sales_order_items.line_total)`
  (generated quantity×unit price); do not add quote value, invoice face value,
  deposits, receipts or production value to it. This is confirmed order value,
  not an accounting revenue-recognition policy. Quote VAT/grand-total rules are
  a separate document basis and cannot silently alter SO totals.
- **Dates:** operational date columns use inclusive `[from,to]`; timestamps use
  `[Bangkok midnight(from), Bangkok midnight(to+1))` converted to UTC. Display
  dd/mm/yyyy, store UTC instants and local business dates. Reject invalid/reversed
  ranges rather than silently normalizing them.
- **Presets:** day, Monday–Sunday week (existing `weekRange`), calendar month,
  calendar quarter, or custom range. Show the actual range and “as of” timestamp.
  Period totals and point-in-time backlog/stock must be visibly distinguished.
- **Growth:** full presets compare to the preceding calendar period. An incomplete
  preset compares the same elapsed portion of that prior period (clamped when
  necessary and explicitly labelled). Custom compares the preceding equal number
  of calendar days. Show both ranges; do not compare MTD with a full prior month.
- **Filters:** apply one canonical validated filter object to KPI, chart, drill-down
  and export. Unsupported dimensions are disabled/labelled, not silently ignored.
  Historical customer type/department/line membership is current-master attribution
  unless a real snapshot exists; disclose that restatement behavior.
- **Availability:** distinguish loading, success-empty, success-with-data,
  partial/unknown coverage, forbidden and error. Only a successful complete read
  may yield a measured zero. Undefined ratios/zero denominators are N/A, not 0%.
  Existing helpers that return 0 on empty input need an executive presentation
  adapter that retains denominator/coverage metadata; do not silently change
  established domain semantics globally.
- **No fabricated history:** historical “as-of” funnels, capacity, stock snapshots,
  closed dates, cash amounts and salesperson mappings cannot be inferred from
  current status, names, notes or a last-updated timestamp.

Readiness below: **Ready** means source fields exist, not that a complete,
authorized aggregate query is already implemented. **Limited** needs explicit
coverage/label caveats. **Blocked** requires additional business/source facts.

## A. Sales performance definitions

Source: `sales_orders`, `sales_order_items`, `customers`, `sales_targets`,
`quotations`; reuse `domain/sales-view.ts` money assembly only after complete reads.
Default qualifying SO statuses: confirmed, partially_delivered, delivered.
Draft/cancelled are excluded; partial delivery never multiplies order value.

| Metric                 | Grain / formula / date                                                                                                             | Readiness                                                                                                                                                                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Confirmed order value  | Sum one item-total aggregate per qualifying SO, grouped by SO currency; order_date in range                                        | Ready. Label “by order date, current status.” Not confirmation-event revenue.                                                                                                                                                                          |
| Confirmed orders / AOV | Distinct qualifying SO IDs; value in currency / count of those orders in currency                                                  | Ready; no orders → AOV N/A.                                                                                                                                                                                                                            |
| Confirmation events    | Distinct SOs with confirmed_at in timestamp range                                                                                  | Limited: current action sets this, but legacy/directly created confirmations may lack it. Show missing-date coverage; do not substitute created_at.                                                                                                    |
| Monthly sales target   | Sum one selected employee/month target row after confirming its currency and employee scope                                        | Blocked currency basis: `sales_targets` has no currency field. Missing targets mean not configured, not zero.                                                                                                                                          |
| Target achievement     | Comparable actual order value / target ×100 for the same currency, employee scope and complete target period                       | Blocked currency/attribution. No arbitrary daily proration of monthly targets. For custom/quarterly periods sum full covered monthly targets only; partial-month target needs an approved allocation rule.                                             |
| New/returning buyers   | Unique customer IDs with qualifying SOs in range; first qualifying order_date in range → first recorded buyer, otherwise returning | Limited by full prior history/import coverage. Groups are disjoint and sum to unique buyers. Do not equate new customer-master rows with first-time buyers or deduplicate by names.                                                                    |
| New customer records   | Distinct customer IDs created_at in timestamp range                                                                                | Ready as CRM record creation, separately labelled from new buyers.                                                                                                                                                                                     |
| Order-value growth     | `(current−previous)/previous ×100`, per currency and identical SO inclusion rules                                                  | Ready after complete reads; prior value≤0 → N/A, show absolute change instead. Current-status exclusions can restate a historical comparison after cancellation.                                                                                       |
| Salesperson sales      | Qualifying order totals attributed to a salesperson employee ID                                                                    | Blocked for comprehensive coverage: SO has no salesperson field; created_by is a login profile. Optional quote salesperson through quotation_id covers only linked orders and must show unassigned value. Never silently treat creator as salesperson. |

## B. CRM and pipeline definitions

Source: `sales_inquiries`, `inquiry_statuses`, `inquiry_followups`,
`inquiry_loss_reasons`, quote issue fields and SO quotation_id; reuse
`domain/pipeline.ts`, `sales-inquiry.ts`, `quotation.ts` after selecting the grain.
Inquiry quotation_value is quoted_price×area_per_sheet×quantity, not SO revenue.

| Metric                               | Grain / formula / date                                                                                                        | Readiness                                                                                                                                                                                                                               |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| New inquiry records                  | Distinct inquiry IDs with inquiry_date in range                                                                               | Ready as record count, not automatically unique business opportunities.                                                                                                                                                                 |
| Pipeline by stage                    | Count canonical opportunities by configured current stage ID/category, as of query time                                       | Limited. Editable names/probabilities are not stable semantic stage codes. Map New/Contacted/Qualified/Quotation/Negotiation to configured stage IDs without overwriting existing statuses.                                             |
| Open/weighted value                  | Sum known quotation_value for open records; weighted=sum(value×snapshotted probability)                                       | Limited currency/coverage; inquiries have no currency field. Confirm their workbook currency before aggregation. Unknown value is not zero; show valued/unvalued counts. Do not add separate quote values for the same deal.            |
| Overdue / due-today follow-ups       | Open inquiry with follow_up_date<today / =today; use `followUpFlag`                                                           | Ready as a current action queue. Undated next actions get a separate missing-date warning, not an overdue count. Closed inquiries excluded.                                                                                             |
| Follow-ups logged                    | Distinct inquiry_followups IDs with follow_up_date in range, grouped by responsible employee when known                       | Ready as logged activity. Its date is entered, not proof of an on-time completed obligation.                                                                                                                                            |
| Follow-up completion/compliance rate | Completed due obligations / eligible due obligations in a fixed cohort                                                        | Blocked: history has no durable scheduled-obligation/completion identity, and the inquiry next date is overwritten. Task completion is a different metric.                                                                              |
| Decided-inquiry win rate             | Won / (won+lost) within an explicit inquiry_date cohort, using current status categories                                      | Ready as a record/cohort rate; denominator zero→N/A. This is not quotation conversion and not “wins closed this month.” No reliable closed-on field currently exists.                                                                   |
| Quotation documents issued           | Distinct quote IDs with quotation_issued_on in range and quotation_no present                                                 | Limited: issuance proves document generation, not delivery to a customer. Label “issued”, not “sent”; a real sent event is absent.                                                                                                      |
| Quote→confirmed-order conversion     | Unique canonical issued-quote families with ≥1 qualifying linked SO / eligible issued families, using quote issue-date cohort | Blocked revision/opportunity linkage completeness. Deduplicate by family ID before counting; one quote converting to several SOs contributes one numerator. Expose unlinked/unknown records; no “perfect” ratio from best-effort links. |
| Top lost reasons / stockout requests | Lost inquiry category and explicit loss_reason_id; stockout subset code=stock_unavailable                                     | Ready for recorded inquiry counts. Generic Specification is not stockout. Requested quantity is not a measured shortage. Historical unknown reasons remain unknown.                                                                     |
| Estimated lost value                 | Sum known inquiry quoted value in a lost inquiry_date cohort and compatible confirmed estimate currency                       | Limited; estimates only, never revenue. Same opportunity's revisions must contribute once; no value invented for missing area/price/quantity.                                                                                           |

A customer may legitimately have multiple opportunities. Distinct customer count
and opportunity conversion are separate grains; collapsing all of a customer's
inquiries to one deal is also incorrect. A staged current-count display is not a
historical stage-transition funnel. Existing expected_close_date/forecast SQL and
domain scaffolding do not establish a fully maintained forecasting workflow.

## C. Inventory intelligence definitions

Source: `stock_movements`, security-invoker `stock_balances`, SKUs/master data,
qualifying sales lines and delivered-quantity view, explicit stockout inquiries.
Reuse inventory-view, stock-ledger and committed-stock helpers. Read
`INVENTORY_DEMAND.md` before claiming demand forecasting exists.

| Metric                                    | Grain / formula / date                                                                                                                      | Readiness                                                                                                                                                                                                              |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Physical inventory                        | Sum signed movements by SKU/location; group totals by family AND unit (condition retained in SKU)                                           | Ready as current stock. No single total combining 张/捆; no stock valuation without a supported cost basis.                                                                                                            |
| Low-stock SKUs                            | Count active eligible SKUs with minimum>0 and physical balance≤minimum                                                                      | Ready only with complete successful balances. Disclose archived/non-active stock rather than dropping it from company totals silently.                                                                                 |
| Outstanding commitment / free stock       | Per SKU: sum max(ordered−delivered,0) on confirmed/partially delivered SO lines; physical−commitment                                        | Limited by source permissions/completeness. Not a hard reservation ledger. A zero commitment from denied sales rows is unknown, not “fully available.”                                                                 |
| Fast/slow movement                        | Per SKU/unit, outbound sale_delivery magnitude in a stated trailing window; show delivery frequency and last delivery                       | Ready for delivery history, with configurable thresholds before naming fast/slow. Transfers, opening and production receipts are not sales demand. No sales in a window does not mean a newly created SKU is obsolete. |
| Stockout-lost requests                    | Lost inquiries with explicit unavailable-product reason, with spec and quantity as reported                                                 | Limited: no reliable historical availability/shortage snapshot or automatic SKU matching. Count requests/unique linked customers separately; do not sum ambiguous dimensions or duplicate source revisions.            |
| Coverage days                             | Current free stock / measured average daily fulfilled demand in the same SKU/unit and explicit complete window                              | Blocked until free-stock access, demand-window/coverage policy and complete history are established. Zero demand→N/A, not infinite or zero coverage. Delivery-based coverage is not total requested demand.            |
| Demand/month, A/B/C and recommended stock | Canonical requests separated from committed orders, configured periods/thresholds, lead times/capacity/safety stock and evidence/confidence | Blocked Phase 3 follow-up work. Standard/Special classification and diameter alone must not stand in for stocking recommendations.                                                                                     |

## D. Production definitions

Source: P4.1 `production_orders`/saved geometry and independent
`stock_movements.type=production_output`. Read `PRODUCTION_ORDERS.md`.

| Metric                              | Grain / formula / date                                                                                                                  | Readiness                                                                                                                                                                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Approved quantity due today         | Sum planned sheets on status=approved with required_date=today; derive m² from saved geometry                                           | Ready, labelled **due**, not scheduled output. On-hold quantities shown separately; Draft is unapproved.                                                                    |
| Pending / overdue planning orders   | Counts by Draft/Approved/On Hold; overdue=non-cancelled and required_date<today                                                         | Ready as planning backlog, not verified unfinished factory output. P4.1 has no completion status.                                                                           |
| Recorded production receipts        | Sum production_output by business_date and SKU/unit (family total only within unit)                                                     | Ready from the ledger after complete reads. Not a QC yield or execution-event count.                                                                                        |
| Planned vs actual / completion rate | Accepted output linked to each production plan divided by that plan's approved quantity; current-period execution separately            | Blocked P4.3/P4.6: stock rows have no production_order_id. Never join all daily receipts to all plans by date/SKU and duplicate quantities, or treat Approved as Completed. |
| Defect/waste rate                   | Rejected sheets/(accepted+rejected inspected sheets), separately measured material waste/input by mass                                  | Blocked QC/material measurement; units and denominators differ. Do not infer waste from stock adjustments.                                                                  |
| Utilization / downtime              | Actual operating duration / valid available capacity duration for the specific machine/spec period; downtime duration/reason separately | Blocked schedules/capacity/time logs. Planned-line free text and maintenance dates are not capacity.                                                                        |
| Ready for delivery                  | Accepted/posted finished output and valid unfulfilled customer order requirements, with allocation/readiness rules                      | Blocked complete workflow linkage. Physical stock alone is not proof that a particular order passed QC and is ready.                                                        |

## E. Team performance and restricted payroll

Source: tasks, daily_metrics, employee targets and scorecard lines; reuse
task-performance, tasks and kpi domains. Activity and verified outcomes remain
separate panels; no ranking is introduced by this definition exercise.

| Metric                               | Grain / formula / date                                                                                                                              | Readiness                                                                                                                                                                                                        |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assigned / completed tasks           | Distinct task IDs by business_date; completed=status completed                                                                                      | Ready as current state for tasks assigned to that day, not “completion events today”; no completed_at exists.                                                                                                    |
| Overdue tasks                        | Date<today and status planned/in_progress, using existing isOverdue                                                                                 | Ready, excludes cancelled/completed/partially_completed by current contract. Do not silently broaden that rule in a dashboard.                                                                                   |
| Task completion rate                 | Completed / (all tasks−cancelled), current state of assigned-date cohort                                                                            | Ready with denominator/coverage; no eligible tasks→N/A for executive display. Partially completed gets no fractional credit without an approved rule.                                                            |
| Activity metrics / logged follow-ups | Sum daily_metrics by employee/date/metric_key; follow-up activity separately from inquiry_followups                                                 | Limited: one editable metric value per employee/date/key, not transactional sales or a scheduled-obligation ledger. Do not add reported quotations/orders to transactional counts.                               |
| KPI achievement / outcome comparison | Existing actual/target and configured lower-is-better/weights; group comparable employees/periods and disclose manual inputs                        | Limited: targets/weights/actuals are entered; surface unbalanced weights and missing targets. No ranking solely by task volume or summing incompatible departmental scorecards.                                  |
| Payroll draft count / amounts        | Draft run count under payroll:view; monetary totals only from appropriate live/frozen payroll rows under payroll and sensitive-employee permissions | Existing count is reusable. Draft/Approved are live, Paid/Cancelled snapshots; do not double-count the overlay. Salary remains Owner/System Admin/Payroll Admin only; commissions are not company sales revenue. |

## F. Collections: blocked amount metrics and safe alternatives

Authoritative current workflow evidence: migration
`0037_so_deposit_balance_paid.sql`, `actions/payment-receipts.ts` and
`computeSoPaymentStatus` in `domain/deposit-invoice.ts`. Current paid labels are
derived from flags, not the dormant receipt-derived DB status fields.

| Metric                                     | Definition                                                                                                                                      | Readiness                                                                                                                                                                                                                      |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Confirmed order value                      | Same qualifying SO item totals as section A, currency separated                                                                                 | Ready; never add deposits to this value.                                                                                                                                                                                       |
| Orders marked deposit/balance paid         | Distinct SO IDs currently carrying the respective paid date; date-filter that field and label as flags                                          | Ready as bookkeeping markers only. Separate quote flags; quote and SO must not be counted as two payments. Dates may be updated; not an immutable cash-event history.                                                          |
| Contractual deposit amount                 | Non-void deposit invoice generated amount, by invoice currency/creation cohort                                                                  | Ready as invoiced/scheduled amount, not cash received. Generated remaining_balance is the contractual complement, not outstanding receivables after payments.                                                                  |
| Recorded cash / customer deposits received | Sum verified amount transactions by paid_date and currency, deduped by receipt ID/order lineage                                                 | Blocked for current comprehensive cash reporting. Historical receipt sums may be shown only as legacy recorded amounts with explicit limited coverage. Paid flags do not prove those amounts were collected.                   |
| Outstanding balance / collection rate      | Eligible receivable face amount−verified allocated receipts/credits/refunds; collected/eligible amount using a coherent invoice or order cohort | Blocked current amount coverage, receipt allocation/correction/refund rules and defined receivable basis. Never infer a full deposit or balance from a paid flag or net all historical receipts against current-period orders. |
| Overdue receivables                        | Positive measured amount due with contractual due_date<as-of date                                                                               | Blocked: customer payment_terms is free text, expected_delivery_date is not a payment due date. No invented aging from delivery dates.                                                                                         |

The historical ledger and its guards remain valuable, but restoring/changing
payment entry is a separate business workflow decision. Do not backfill payment
amounts from paid flags, rewrite receipts, or expand sensitive-data access just to
populate a card. Earlier audit/data-dictionary claims of an active receipt-entry
workflow are superseded by the current-source evidence above.

## Permissions and security gaps

Every dashboard/aggregate/chart/export/drill-down must independently authorize the
required source scope. Gate both reads and rendering; navigation or generic
dashboard:view/reports:view is insufficient. No service-role or persistent cache
may bypass per-request user/profile/RLS validation.

| Role             | Attendance | Physical inventory | Sales/collection | CRM | Production plans | Tasks | Targets/KPI | Payroll amounts |
| ---------------- | ---------- | ------------------ | ---------------- | --- | ---------------- | ----- | ----------- | --------------- |
| Owner            | yes        | yes                | yes              | yes | yes              | yes   | yes         | yes             |
| System Admin     | yes        | yes                | yes              | yes | yes              | yes   | yes         | yes             |
| Attendance Admin | yes        | no                 | no               | no  | no               | no    | no          | no              |
| Warehouse Admin  | no         | yes                | no               | no  | yes              | no    | no          | no              |
| Sales Admin      | no         | yes                | yes              | yes | yes              | yes   | yes         | no              |
| Marketing Admin  | no         | no                 | no               | no  | no               | yes   | no          | no              |
| Payroll Admin    | yes        | no                 | no               | no  | no               | no    | no          | yes             |
| Viewer           | yes        | yes                | no               | no  | no               | no    | no          | no              |

This is the current app view-grant matrix from `domain/rbac.ts`; RLS and effective
source visibility must also be checked. Viewer intentionally has attendance and
inventory access: the older roadmap suggestion to hide both is incorrect.

Confirmed source findings, not newly repaired by P5.1:

1. Main dashboard unconditionally queries/renders attendance, employees,
   inventory and production. Sales/Marketing may get employee names but no
   attendance rows and see fabricated Unmarked exceptions; other roles may see
   zero/incomplete stock or low-stock warnings from denied reads. Private salary
   data is not queried by those cards; do not exaggerate this as a salary leak.
2. Inventory report assembly calls sales/customer helpers under Warehouse/Viewer
   sessions that cannot read those commercial tables. Empty commitments can make
   physical stock appear fully available. A safe SKU-level commitment aggregate
   needs an explicit permission boundary; do not widen raw sales/customer RLS.
3. Legacy Task picker payload and RBAC↔RLS parity findings remain documented in
   `SECURITY_PERMISSION_MATRIX.md`. New management exports must not inherit those
   broader payloads or use small-group salary summaries to circumvent restrictions.
4. Most old helpers ignore returned PostgREST errors or return zero/empty arrays;
   current cards cannot distinguish failure from real zero. React request-scoped
   auth caching is already present and should not become a cross-user cache.
5. Global audit-write/quotation atomicity, legacy ledger concurrency/delete
   exceptions and Telegram idempotency findings remain separate issues. P4.1's
   atomic planning audit does not repair those older workflows.

## Filters, charts, reports and alerts: shared dependencies

| Feature                                 | Contract / source / current gap                                                                                                                                                                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales trends/target chart/top customers | Use section A SO grain/currency/date basis; targets need currency/attribution. Top customers group stable customer IDs and never sum currencies.                                                                                                                                              |
| Top specifications                      | Separate confirmed ordered units from delivered units per SKU; price-value ranking per currency. Free-text quote descriptions are not automatic SKU matches.                                                                                                                                  |
| Pipeline funnel                         | Current stage distribution until canonical family/transition evidence exists; no invented progression or duplicate quote revisions.                                                                                                                                                           |
| Inventory demand / plan-vs-actual chart | Suppress unsupported series with a source-coverage explanation. Do not show flat zero lines for missing stockout/QC/execution models.                                                                                                                                                         |
| Department/employee/line filters        | Tasks have explicit department/employee fields. Employee department is current master data, not historical membership. P4 planned-line text is not a standardized line ID. SO salesperson filter cannot pretend actor profile=employee.                                                       |
| Customer type/product filters           | Use customer_type_id and SKU/family IDs where maintained; preserve unassigned/unknown groups. Order-level counts use EXISTS over matching lines; value filtered by product uses only matching line totals and must be labelled accordingly.                                                   |
| Reports                                 | Reuse branded HTML/PDF/Excel utilities and existing permission gates. Central catalog entries advertise only supported data. Include canonical filter summary, units/currencies, generation/as-of time, definitions/version and incomplete-coverage notes. No salary data in general reports. |
| Action queue                            | Deduplicate by (alert type, source ID), using current records; follow-ups→inquiry, low stock→SKU, overdue plan→production order, stock commitment→order/SKU once safely authorized. No overdue-payment alert without actual due/balance data.                                                 |
| Pending quotes/missed targets           | “Issued quote without a linked qualifying order” is unresolved linkage, not proof of awaiting a customer decision. A missed monthly target is evaluated only after its defined period and comparable actual basis, not against a full target halfway through a month.                         |

Main dashboard links currently point mostly to unfiltered modules. Date/salesperson
filters are not supported uniformly by those pages. Before promising drill-down,
define and implement the destination's matching filters; otherwise label a link
“open module” rather than suggesting it reconstructs the KPI cohort.

## Query/performance assessment and production risks

Source inspection, **not a live network benchmark**: the main dashboard launches
13 helper calls, eight unconditional. On an Owner render, those helpers issue
approximately 21 PostgREST reads (20 if Special Price type is absent), excluding
auth/profile resolution/retries. The unconditional group contributes nine reads
because MTD attendance uses two HEAD counts. The price helper reads a type plus
six counts, while the dashboard renders only three of those counts. This identifies
measurement candidates, not a proven latency bottleneck or speedup.

Already implemented: parallel independent dashboard reads, exact HEAD attendance
counts beyond 1,000 rows, Bangkok month cutoffs, request-scoped auth memoization,
RLS InitPlan wrappers (0053), paginated order/quote/price/production list readers,
bounded production references and relevant indexes. Do not rebuild those fixes.

Still at risk: unbounded getSalesOrders/items/delivered, inquiries/follow-ups,
balances/master-data and production-quantity reads can truncate at the API limit.
Page-list pagination does not make full-table analytics/export helpers complete.
Many helpers select full rows when a KPI needs only aggregates. Avoid aggregate
fan-out and the weekly task view's repeated per-employee filtering at scale.

Existing indexes include ledger SKU/location/business-date, sale-delivery lookup,
SO status/due/customer and line FKs, inquiry follow-up/source/expected-close,
monthly target/scorecard period, task employee/date/department and P4 due/created/FK
indexes. Inventory GROUP BY and financial aggregates require representative plans,
not more guessed indexes.

P5.7 measurement protocol: fixed authorized-role/volume/filter fixtures, production
build, cold/warm and p50/p95 request timings, request count/payload, server traces,
and read-only EXPLAIN (ANALYZE, BUFFERS) on disposable/staging SELECTs. Compare the
same workload before/after. Do not log credentials, customer/payroll values or run
EXPLAIN ANALYZE mutations. No production timing, query-plan or caching improvement
is claimed here. Persistent caching, if later justified, must partition by user/
authorization and filters, avoid private salary payloads, and respect role changes;
request-scoped deduplication remains the default.

Data-risk controls: current cancellations restate period cohorts; incomplete
history undermines “new buyer” and conversion; live master dimensions can restate
historical grouping; paid flags can be changed and do not measure cash; missing
RLS data can create false operational alerts. Never “repair” these with historical
inferred rows, stored editable stock totals, ledger rewrites, automatic raw-material
deductions or production deployment from an audit.

## Prioritized implementation roadmap

| Order                | Bounded task                                                                                                         | Dependencies and verification                                                                                                                                                                                               |
| -------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 — recommended next | Dashboard permission foundation before P5.2: gate each operational read AND section with existing module permissions | Reuse conditional-query pattern in Reports page. Test all eight roles, preserve Viewer's legitimate grants, ensure denied domains start no requests, and retain privileged cards. No new data model or permission widening. |
| 2                    | Explicit aggregate success/empty/error/coverage states; fix mixed-unit production receipt label/read                 | Inject DB errors and RLS-limited responses; do not display misleading zeros. Group production by SKU/unit, test >1,000 rows and empty success separately.                                                                   |
| 3 — P5.2a            | Company confirmed-order overview by currency/order_date, counts/AOV/comparison/customer-ID drill-down                | Complete numeric database aggregates and canonical date filters, no one-to-many double counting, full-history coverage for buyer classifications. No collection amount cards yet.                                           |
| 4 — P5.2b            | Target attribution/currency and collection-source decisions                                                          | Decide employee attribution, target currency/partial-period basis and actual amount/payment allocation workflow. Add only justified forward migrations/tests; no payment-history fabrication.                               |
| 5 — P5.3             | Canonical opportunity/revision linkage, supported pipeline and action queue                                          | Reuse inquiry stages/history/loss reason capture; explicit unknown coverage, sent/completed-event definitions and due-date cohort semantics before conversion/compliance ratios.                                            |
| 6 — P5.4             | Safe SKU commitment read boundary, remaining demand/execution/QC prerequisites                                       | Reuse Phase 3/P4.1, but finish source models before coverage/A/B/C, utilization or completion metrics. Never auto-post stock from dashboard computation.                                                                    |
| 7 — P5.5/P5.6        | Comparable team outcomes and supported centralized reports                                                           | Separate entered activity from verified outcomes, preserve payroll restrictions; shared filters and report-content assertions.                                                                                              |
| 8 — P5.7/P5.8        | Measured optimization, role-specific visual/interaction QA                                                           | Baseline the real workload first; only justified indexes/cache. EN/中文, keyboard/table/chart alternatives, mobile/tablet, stable drill-downs and empty/error/loading tests.                                                |

Later-test acceptance must cover same-value different lines, duplicate joins,
multiple currencies, drafts/cancellations/partial delivery, null confirmation/
attribution/payment evidence, Bangkok UTC boundaries/leap dates, zero denominators,
large datasets, role/active-user changes, hidden domains starting no reads,
query/export/drill-down parity and unknown-history states. Existing test-plan
#3–10/#21–22/#28–29/#39–41 remain relevant. P5.1 adds no behavior, so it needs no
implementation-mirroring tests; run the existing verification gate and record its
actual result without claiming skipped live/browser probes passed.

## P5.1 verification result

On 30/10/2026, `npm run verify` passed in 34.4 seconds: format, lint,
type-check, unit/integration tests, schema validation and production build.
Playwright was skipped because local Supabase at `http://127.0.0.1:54321` was
unreachable. No live/deployed RLS, browser flows, query plans or response-time
benchmarks are certified by this documentation-only increment. Earlier working
tree implementation changes remain separate from P5.1; no application/schema,
production data or deployment changes were made for this increment.

Documentation changed for P5.1: this audit, README documentation index,
DEVELOPMENT_ROADMAP, architecture, data-dictionary (current payment semantics),
decisions, test-plan and the supersession note in NEXT_PHASE_AUDIT.
