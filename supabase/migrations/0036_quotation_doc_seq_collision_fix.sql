-- =============================================================================
-- Zysteel Operations — 0036 Fix deposit/balance number collision from 0034
--
-- 0034 made deposit/balance invoice numbers reuse the quotation's own
-- {period}-{seq} suffix. That collides with any deposit_no/balance_no
-- already issued under the OLD independent-counter scheme (pre-0034) for a
-- DIFFERENT quotation whose leftover number happens to equal this
-- quotation's suffix — e.g. quotation X's quotation_no is ZYS-Q2608-003, but
-- some other quotation Y already has deposit_no = ZYS-DP2608-003 from before
-- 0034 (an arbitrary old counter value, unrelated to X or Y's own numbers).
-- Issuing X's deposit then hits "duplicate key value violates unique
-- constraint quotations_deposit_no_key".
--
-- Two different quotations' shared-suffix candidates can never collide with
-- EACH OTHER post-0034 (quotation_no is itself unique, so their suffixes
-- differ) — the only collision source is a pre-existing legacy value. So on
-- a unique_violation, fall back to a fresh number from the same
-- quotation_doc_seq counter 0034 stopped advancing for DP/BL, which is
-- guaranteed not to collide with any historical value from that counter.
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
  v_suffix text;
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
    begin
      update public.quotations
         set deposit_no = v_no, deposit_issued_on = coalesce(p_issue_date, current_date)
       where id = p_quotation;
    exception when unique_violation then
      insert into public.quotation_doc_seq (kind, period, next_seq) values ('DP', v_period, 1)
        on conflict (kind, period) do update set next_seq = public.quotation_doc_seq.next_seq + 1
        returning next_seq into n;
      v_no := 'ZYS-DP' || v_period || '-' || lpad(n::text, 3, '0');
      update public.quotations
         set deposit_no = v_no, deposit_issued_on = coalesce(p_issue_date, current_date)
       where id = p_quotation;
    end;
  else
    begin
      update public.quotations
         set balance_no = v_no, balance_issued_on = coalesce(p_issue_date, current_date)
       where id = p_quotation;
    exception when unique_violation then
      insert into public.quotation_doc_seq (kind, period, next_seq) values ('BL', v_period, 1)
        on conflict (kind, period) do update set next_seq = public.quotation_doc_seq.next_seq + 1
        returning next_seq into n;
      v_no := 'ZYS-BL' || v_period || '-' || lpad(n::text, 3, '0');
      update public.quotations
         set balance_no = v_no, balance_issued_on = coalesce(p_issue_date, current_date)
       where id = p_quotation;
    end;
  end if;

  return v_no;
end $$;
