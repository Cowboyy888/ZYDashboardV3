-- =============================================================================
-- Zysteel Operations — 0043 VAT-ready invoicing (Quotation pipeline)
--
-- ZY Steel is not currently VAT-registered in Cambodia. This migration adds
-- the company-wide tax configuration (invoice_settings, a singleton row —
-- same shape as marketing_settings, 0041) plus a VAT snapshot on each
-- quotation, so:
--   - today, every invoice keeps showing no VAT (Commercial Invoice), and
--   - if the company registers for VAT later, flipping invoice_settings.
--     vat_registered on affects only NEW quotations going forward — every
--     historical quotation keeps the tax treatment it was actually issued
--     under, because vat_registered_snapshot/vat_rate_snapshot are stamped
--     once at creation (src/lib/actions/quotations.ts createQuotation), never
--     read live from invoice_settings when a document is re-printed.
--
-- Scope: the Quotation/Deposit/Balance pipeline only (quotations table) — the
-- separate Sales-Order/deposit_invoices pipeline is untouched, per its own
-- already-dormant posture (see 0037's header note).
-- =============================================================================

-- --- Company tax configuration (singleton) --------------------------------------
create table if not exists public.invoice_settings (
  id                          int primary key default 1 check (id = 1),
  vat_registered              boolean not null default false,
  vat_rate                    numeric(5, 4) not null default 0.10
                              check (vat_rate >= 0 and vat_rate <= 1),
  vat_tin                     text,
  tax_invoice_prefix          text not null default 'ZYS-TAX',
  commercial_invoice_prefix   text not null default 'ZYS-Q',
  updated_at                  timestamptz not null default now()
);
insert into public.invoice_settings (id) values (1) on conflict (id) do nothing;

drop trigger if exists trg_invoice_settings_updated on public.invoice_settings;
create trigger trg_invoice_settings_updated before update on public.invoice_settings
  for each row execute function public.set_updated_at();

alter table public.invoice_settings enable row level security;

drop policy if exists invoice_settings_select on public.invoice_settings;
create policy invoice_settings_select on public.invoice_settings for select to authenticated
  using (public.auth_role() in ('owner', 'system_admin'));
drop policy if exists invoice_settings_update on public.invoice_settings;
create policy invoice_settings_update on public.invoice_settings for update to authenticated
  using (public.auth_role() in ('owner', 'system_admin'))
  with check (public.auth_role() in ('owner', 'system_admin'));

grant all on public.invoice_settings to anon, authenticated, service_role;

-- --- Per-quotation VAT snapshot --------------------------------------------------
-- Defaults (false / 0) correctly grandfather every existing quotation as
-- non-VAT — that was true when they were actually issued, so no data
-- backfill beyond the column default is needed.
alter table public.quotations
  add column if not exists vat_registered_snapshot boolean not null default false,
  add column if not exists vat_rate_snapshot numeric(5, 4) not null default 0;
