-- =============================================================================
-- Zysteel Operations — 0008 employee ID sequence
-- Employee IDs are generated server-side, atomically, and NEVER reused (even
-- after an employee is archived). Format: ZY-0001, ZY-0002, …
-- The raw sequence number (seq_no) is retained so the Telegram report can show
-- "7号" (employee_number defaults to it).
-- =============================================================================

-- Permanent, gap-tolerant, never-reused sequence.
create sequence if not exists public.employee_seq as integer start with 1 increment by 1;

alter table public.employees
  add column if not exists seq_no integer;

-- Assign identity on insert: seq_no (atomic), ZY-#### code, and default the
-- report number to the sequence number when not provided.
create or replace function public.assign_employee_identity()
returns trigger language plpgsql as $$
begin
  if new.seq_no is null then
    new.seq_no := nextval('public.employee_seq');
  end if;
  if new.employee_code is null or length(btrim(new.employee_code)) = 0 then
    new.employee_code := 'ZY-' || lpad(new.seq_no::text, 4, '0');
  end if;
  if new.employee_number is null or length(btrim(new.employee_number)) = 0 then
    new.employee_number := new.seq_no::text;
  end if;
  return new;
end $$;

drop trigger if exists trg_assign_employee_identity on public.employees;
create trigger trg_assign_employee_identity
  before insert on public.employees
  for each row execute function public.assign_employee_identity();

-- Backfill any pre-existing rows (no-op on a fresh `db reset`, where the table
-- is empty when migrations run and the seed loads afterwards).
do $$
declare
  r record;
  n integer;
begin
  for r in select id, employee_code from public.employees where seq_no is null order by created_at, employee_code loop
    n := nextval('public.employee_seq');
    update public.employees
      set seq_no = n,
          employee_code = coalesce(nullif(btrim(employee_code), ''), 'ZY-' || lpad(n::text, 4, '0'))
      where id = r.id;
  end loop;
end $$;

-- Uniqueness: employee_code is already unique (0001). seq_no must be unique too.
create unique index if not exists employees_seq_no_uidx on public.employees (seq_no);

-- seq_no is always assigned (by the trigger) going forward.
alter table public.employees alter column seq_no set not null;
