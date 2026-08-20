-- =============================================================================
-- Zysteel Operations — 0037 Simple deposit/balance paid flags on sales orders
--
-- Replaces the itemized payment_receipts entry UI on the Sales Order detail
-- page with two one-click "mark paid" toggles — the same posture quotations
-- already use (deposit_paid_on/balance_paid_on, 0021_quotations.sql), not an
-- amount-entry ledger. This does NOT touch deposit_invoices, payment_receipts,
-- or their triggers: they're left completely alone and now DORMANT for new
-- writes, same posture this repo already used when payment_receipts
-- superseded deposit_invoice_payments (see 0030's header note) — historical
-- rows and the numbering they already issued stay exactly as they are.
--
-- deposit_amount/remaining_balance are still read from deposit_invoices'
-- existing GENERATED columns (total_order_amount × deposit_percentage) — those
-- were never derived from the payment ledger, only the *status* was, so they
-- keep working unchanged.
-- =============================================================================

alter table public.sales_orders
  add column if not exists deposit_paid_on date,
  add column if not exists balance_paid_on date;
