-- =============================================================================
-- Zysteel Operations — 0042 kpi_scorecards: add the missing standalone period
-- index.
--
-- 0039 gave sales_targets and commission_entries a standalone `period` index
-- alongside their composite/other indexes, but kpi_scorecards only got the
-- (employee_id, period) unique index — employee_id leading, so it can't serve
-- a period-only lookup. getKpiScorecards(period) in src/lib/db/queries.ts
-- (added alongside the /sales/kpi page) filters on period alone with no
-- employee_id, so without this index that call is a sequential scan.
-- =============================================================================

create index if not exists kpi_scorecards_period_idx on public.kpi_scorecards (period);
