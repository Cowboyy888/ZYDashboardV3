-- =============================================================================
-- Zysteel Operations — 0023 Quotation line items: total sheets (reference only)
--
-- A free-entry "total sheets" figure per line item, for the sales team's own
-- reference (e.g. matching against a production count) — deliberately NOT
-- part of the amount formula (amount stays unit_price * quantity, generated).
-- Nullable: existing rows are unaffected.
-- =============================================================================

alter table public.quotation_items
  add column if not exists total_sheets numeric(14, 3);
