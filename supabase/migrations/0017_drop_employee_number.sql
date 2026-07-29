-- =============================================================================
-- Zysteel Operations — 0017 drop employee_number
-- employee_number only ever existed to override the attendance report's "7号"
-- suffix; the report no longer shows the number or label at all (see the
-- migration/commit that dropped them from the report body), so the field is
-- removed entirely — no longer editable, displayed, or stored. seq_no /
-- employee_code (the real, immutable, DB-generated identity) are unaffected.
-- =============================================================================

-- Stop auto-defaulting employee_number; seq_no/employee_code assignment is untouched.
create or replace function public.assign_employee_identity()
returns trigger language plpgsql as $$
begin
  if new.seq_no is null then
    new.seq_no := nextval('public.employee_seq');
  end if;
  if new.employee_code is null or length(btrim(new.employee_code)) = 0 then
    new.employee_code := 'ZY-' || lpad(new.seq_no::text, 4, '0');
  end if;
  return new;
end $$;

alter table public.employees drop column if exists employee_number;
