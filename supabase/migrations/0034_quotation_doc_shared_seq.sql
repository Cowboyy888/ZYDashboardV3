-- =============================================================================
-- Zysteel Operations — 0034 Deposit/Balance invoices share the quotation's number
--
-- Previously Q / DP / BL each burned their own independent monthly counter
-- (quotation_doc_seq keyed by kind+period), so a quotation's deposit and
-- balance invoices carried sequence numbers unrelated to the quotation's own
-- — e.g. quotation ZYS-Q2608-003 could end up with deposit ZYS-DP2608-011 and
-- balance ZYS-BL2608-007, with nothing but the customer/date tying them
-- together on paper.
--
-- Deposit and Balance now reuse the SAME {period}-{seq} suffix as the
-- quotation they belong to — only the ZYS-{kind} prefix differs — so the
-- three documents for one deal are visibly the same invoice:
--   Quotation        ZYS-Q2608-003
--   Deposit invoice  ZYS-DP2608-003
--   Balance invoice  ZYS-BL2608-003
-- The quotation_doc_seq counter is now only consulted for kind = 'Q'; issuing
-- a deposit or balance before the quotation itself has a number issues the
-- quotation number first (still idempotent — a re-issued document keeps the
-- number already stored).
-- =============================================================================

create or replace function public.issue_quotation_document(
  p_quotation uuid,
  p_kind text,
  p_issue_date date default current_date
) returns text language plpgsql security invoker set search_path = public as $$
declare
  v_period text := to_char(coalesce(p_issue_date, current_date), 'YYMM');
  v_existing text;
  v_quotation_no text;
  v_suffix text;    -- '{period}-{seq}' lifted from the quotation number
  n int;
  v_no text;
begin
  if p_kind not in ('Q', 'DP', 'BL') then
    raise exception 'Unknown document kind %', p_kind;
  end if;

  select quotation_no,
         case p_kind when 'Q' then quotation_no when 'DP' then deposit_no else balance_no end
    into v_quotation_no, v_existing
    from public.quotations where id = p_quotation;

  if v_existing is not null and length(btrim(v_existing)) > 0 then
    return v_existing;                       -- already issued — keep the number
  end if;

  if p_kind in ('DP', 'BL') then
    if v_quotation_no is null or length(btrim(v_quotation_no)) = 0 then
      v_quotation_no := public.issue_quotation_document(p_quotation, 'Q', p_issue_date);
    end if;
    v_suffix := regexp_replace(v_quotation_no, '^ZYS-Q', '');
    v_no := 'ZYS-' || p_kind || v_suffix;
  else
    insert into public.quotation_doc_seq (kind, period, next_seq) values (p_kind, v_period, 1)
      on conflict (kind, period) do update set next_seq = public.quotation_doc_seq.next_seq + 1
      returning next_seq into n;
    v_no := 'ZYS-' || p_kind || v_period || '-' || lpad(n::text, 3, '0');
  end if;

  if p_kind = 'Q' then
    update public.quotations
       set quotation_no = v_no, quotation_issued_on = coalesce(p_issue_date, current_date)
     where id = p_quotation;
  elsif p_kind = 'DP' then
    update public.quotations
       set deposit_no = v_no, deposit_issued_on = coalesce(p_issue_date, current_date)
     where id = p_quotation;
  else
    update public.quotations
       set balance_no = v_no, balance_issued_on = coalesce(p_issue_date, current_date)
     where id = p_quotation;
  end if;

  return v_no;
end $$;
