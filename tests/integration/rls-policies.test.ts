import { describe, it, expect, beforeAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import type { Role } from '@/lib/domain/rbac';

/**
 * Real Postgres RLS enforcement tests — not mocks. `rbac.test.ts` proves the
 * app's own `hasPermission()` table; this file proves the database enforces
 * the same boundary independently, so a role cannot bypass the UI by calling
 * the Supabase REST/PostgREST API directly with its own session. Per the
 * Task 3 audit (see docs/SECURITY_PERMISSION_MATRIX.md), passing UI/RBAC
 * tests does not prove this — only querying the live database does.
 *
 * Every probe runs inside `begin; ... rollback;` against a local, disposable
 * Supabase Postgres only (loopback-only guard below) — nothing here is ever
 * committed, and the suite refuses to run against anything but 127.0.0.1/
 * localhost. If no local database is reachable, the whole file is skipped
 * (same "optional, environment-gated" posture as scripts/validate-schema.mjs
 * and the e2e step of scripts/verify.mjs), not treated as a failure.
 */

const DB_URL =
  process.env.SUPABASE_DB_URL ?? 'postgresql://postgres:postgres@127.0.0.1:54322/postgres';

function isLoopbackOnly(url: string): boolean {
  try {
    const { hostname } = new URL(url);
    return hostname === '127.0.0.1' || hostname === 'localhost';
  } catch {
    return false;
  }
}

interface ProbeResult {
  ok: boolean;
  stdout: string;
  errorText: string;
}

function psql(script: string): ProbeResult {
  try {
    const stdout = execFileSync('psql', [DB_URL, '-v', 'ON_ERROR_STOP=1', '-t', '-A'], {
      input: script,
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    return { ok: true, stdout, errorText: '' };
  } catch (e) {
    const err = e as { stdout?: string | Buffer; stderr?: string | Buffer };
    return {
      ok: false,
      stdout: String(err.stdout ?? ''),
      errorText: String(err.stderr ?? ''),
    };
  }
}

/** Runs `probeSql` as `role`, after `setupSql` runs as the superuser (so fixtures bypass RLS). */
function runAsRole(role: Role, setupSql: string, probeSql: string): ProbeResult {
  return psql(`
begin;
select gen_random_uuid() as probe_uuid \\gset
insert into auth.users (id, email) values (:'probe_uuid', 'rls-audit-probe@example.com');
update public.profiles set role = '${role}' where id = :'probe_uuid';
${setupSql}
set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'probe_uuid')::text, true);
${probeSql}
rollback;
`);
}

/** Runs `probeSql` as the literal unauthenticated `anon` Postgres role. */
function runAsAnon(setupSql: string, probeSql: string): ProbeResult {
  return psql(`
begin;
${setupSql}
set local role anon;
${probeSql}
rollback;
`);
}

/** psql prints one line per statement (BEGIN, INSERT 0 1, SET, ...); the
 * count we want is the last line that is purely numeric, not the last line
 * overall (which is usually "ROLLBACK"). */
function countFrom(result: ProbeResult): number {
  const numericLines = result.stdout
    .trim()
    .split('\n')
    .filter((line) => /^-?\d+$/.test(line.trim()));
  if (numericLines.length === 0) {
    throw new Error(`Expected a count, got: ${JSON.stringify(result)}`);
  }
  return Number(numericLines[numericLines.length - 1]);
}

let canRun = false;

beforeAll(() => {
  if (!isLoopbackOnly(DB_URL)) {
    canRun = false;
    return;
  }
  try {
    execFileSync('psql', ['--version'], { stdio: 'ignore' });
    const probe = psql('select 1;');
    canRun = probe.ok;
  } catch {
    canRun = false;
  }
});

describe.sequential(
  'RLS — employee_private (salary) is restricted to Owner/System Admin/Payroll Admin',
  () => {
    const setup = `
    insert into public.employees (employee_code, name_english, department, pay_type)
      values ('RLS-PROBE-EMP', 'RLS Probe Employee', 'Marketing', 'monthly') returning id \\gset emp_
    insert into public.employee_private (employee_id, base_salary) values (:'emp_id', 12345);
  `;
    const probe = (): string =>
      `select count(*) from public.employee_private where employee_id = :'emp_id';`;

    it('payroll_admin and system_admin can see the salary row', () => {
      if (!canRun) return;
      for (const role of ['payroll_admin', 'system_admin'] as Role[]) {
        const result = runAsRole(role, setup, probe());
        expect(result.ok).toBe(true);
        expect(countFrom(result)).toBe(1);
      }
    });

    it('every other role is denied — fails if this grant is ever accidentally broadened', () => {
      if (!canRun) return;
      for (const role of [
        'attendance_admin',
        'warehouse_admin',
        'sales_admin',
        'marketing_admin',
        'viewer',
      ] as Role[]) {
        const result = runAsRole(role, setup, probe());
        expect(result.ok).toBe(true);
        expect(countFrom(result)).toBe(0);
      }
    });
  },
);

describe.sequential('RLS — payroll_runs is restricted to Owner/System Admin/Payroll Admin', () => {
  const setup = `
    insert into public.payroll_runs (period_start, period_end, pay_date)
      values ('2026-01-01', '2026-01-31', '2026-02-05') returning id \\gset run_
  `;
  const probe = (): string => `select count(*) from public.payroll_runs where id = :'run_id';`;

  it('payroll_admin and system_admin can see the run', () => {
    if (!canRun) return;
    for (const role of ['payroll_admin', 'system_admin'] as Role[]) {
      const result = runAsRole(role, setup, probe());
      expect(result.ok).toBe(true);
      expect(countFrom(result)).toBe(1);
    }
  });

  it('everyone else is denied', () => {
    if (!canRun) return;
    for (const role of [
      'attendance_admin',
      'warehouse_admin',
      'sales_admin',
      'marketing_admin',
      'viewer',
    ] as Role[]) {
      const result = runAsRole(role, setup, probe());
      expect(result.ok).toBe(true);
      expect(countFrom(result)).toBe(0);
    }
  });

  it('only payroll_admin and owner may write a run (system_admin is view-only)', () => {
    if (!canRun) return;
    const insertSql = `insert into public.payroll_runs (period_start, period_end, pay_date)
      values ('2026-02-01', '2026-02-28', '2026-03-05');`;
    const allowed = runAsRole('payroll_admin', '', insertSql);
    expect(allowed.ok).toBe(true);

    const denied = runAsRole('system_admin', '', insertSql);
    expect(denied.ok).toBe(false);
    expect(denied.errorText.toLowerCase()).toContain('row-level security');
  });
});

describe.sequential(
  'RLS — customers (F1): matches the documented, intentional Task-picker grant',
  () => {
    const setup = `
    insert into public.customers (name, tax_id, payment_terms)
      values ('RLS Probe Customer', 'TAX-PROBE-1', 'Net 30') returning id \\gset cust_
  `;
    const probe = (): string => `select count(*) from public.customers where id = :'cust_id';`;

    it('owner/system_admin/sales_admin/marketing_admin can read the full customer row (see F1 in the matrix doc)', () => {
      if (!canRun) return;
      for (const role of ['system_admin', 'sales_admin', 'marketing_admin'] as Role[]) {
        const result = runAsRole(role, setup, probe());
        expect(result.ok).toBe(true);
        expect(countFrom(result)).toBe(1);
      }
    });

    it('attendance/warehouse/payroll/viewer cannot read customers at all — fails if this is ever accidentally widened', () => {
      if (!canRun) return;
      for (const role of [
        'attendance_admin',
        'warehouse_admin',
        'payroll_admin',
        'viewer',
      ] as Role[]) {
        const result = runAsRole(role, setup, probe());
        expect(result.ok).toBe(true);
        expect(countFrom(result)).toBe(0);
      }
    });

    it('only owner/sales_admin may write a customer row — marketing_admin is read-only', () => {
      if (!canRun) return;
      const insertSql = `insert into public.customers (name) values ('RLS Probe Write Test');`;
      expect(runAsRole('sales_admin', '', insertSql).ok).toBe(true);

      const denied = runAsRole('marketing_admin', '', insertSql);
      expect(denied.ok).toBe(false);
      expect(denied.errorText.toLowerCase()).toContain('row-level security');
    });
  },
);

describe.sequential(
  'RLS — stock_movements insert (F3): locks in the current, audited role set',
  () => {
    const setup = `
    insert into public.locations (code, name) values ('RLS-PROBE-LOC', 'RLS Probe Location') returning id \\gset loc_
    insert into public.product_families (code, name) values ('RLS-PROBE-FAM', 'RLS Probe Family') returning id \\gset fam_
    insert into public.skus (family_id, condition, unit, minimum_level)
      values (:'fam_id', 'normal', 'sheet', 0) returning id \\gset sku_
  `;
    const insertSql = (): string => `
    insert into public.stock_movements (sku_id, location_id, type, quantity, business_date)
      values (:'sku_id', :'loc_id', 'opening_balance', 1, current_date);
  `;

    it('owner/system_admin/warehouse_admin/sales_admin can insert — matches the documented 0014 exception', () => {
      if (!canRun) return;
      for (const role of ['system_admin', 'warehouse_admin', 'sales_admin'] as Role[]) {
        const result = runAsRole(role, setup, insertSql());
        expect(result.ok).toBe(true);
      }
    });

    it('attendance_admin/payroll_admin/viewer cannot insert stock movements', () => {
      if (!canRun) return;
      for (const role of ['attendance_admin', 'payroll_admin', 'viewer'] as Role[]) {
        const result = runAsRole(role, setup, insertSql());
        expect(result.ok).toBe(false);
        expect(result.errorText.toLowerCase()).toContain('row-level security');
      }
    });

    it('nobody — not even Owner — can update a posted movement (append-only ledger: no UPDATE policy exists at all)', () => {
      if (!canRun) return;
      // stock_movements has no UPDATE RLS policy for any role, so the row is
      // simply invisible to the UPDATE's own targeting — it matches zero rows
      // without ever reaching the `trg_movements_no_update` trigger. That
      // trigger is what would actually fire (raising UPDATE_FORBIDDEN) if a
      // future migration ever added an UPDATE policy — belt and suspenders.
      const probeSql = `
      insert into public.stock_movements (sku_id, location_id, type, quantity, business_date)
        values (:'sku_id', :'loc_id', 'opening_balance', 1, current_date) returning id \\gset mv_
      update public.stock_movements set quantity = 999 where id = :'mv_id';
      select count(*) from public.stock_movements where id = :'mv_id' and quantity = 999;
    `;
      const result = runAsRole('owner', setup, probeSql);
      expect(result.ok).toBe(true);
      expect(countFrom(result)).toBe(0);
    });
  },
);

describe.sequential(
  'RLS — quotations write (F2): locks in the current role set so a future change is visible',
  () => {
    const insertSql = `insert into public.quotations (customer_name) values ('RLS Probe Quotation');`;

    it('owner/sales_admin/system_admin can currently write quotations (system_admin has no matching app permission — see F2)', () => {
      if (!canRun) return;
      for (const role of ['sales_admin', 'system_admin'] as Role[]) {
        const result = runAsRole(role, '', insertSql);
        expect(result.ok).toBe(true);
      }
    });

    it('attendance/warehouse/payroll/marketing/viewer cannot write quotations', () => {
      if (!canRun) return;
      for (const role of [
        'attendance_admin',
        'warehouse_admin',
        'payroll_admin',
        'marketing_admin',
        'viewer',
      ] as Role[]) {
        const result = runAsRole(role, '', insertSql);
        expect(result.ok).toBe(false);
        expect(result.errorText.toLowerCase()).toContain('row-level security');
      }
    });
  },
);

describe.sequential(
  'RLS — audit_log cannot be forged (regression for the exact gap fixed in migration 0024)',
  () => {
    // A second, real profile row (FK-valid) to impersonate — isolates the RLS
    // check from an unrelated foreign-key failure.
    const setupVictim = `
    select gen_random_uuid() as victim_uuid \\gset
    insert into auth.users (id, email) values (:'victim_uuid', 'rls-audit-victim@example.com');
    update public.profiles set role = 'owner' where id = :'victim_uuid';
  `;

    it('a role cannot insert an audit_log row attributed to a different (but real) actor_id', () => {
      if (!canRun) return;
      const forgeSql = `
      insert into public.audit_log (actor_id, actor_email, action, entity)
        values (:'victim_uuid', 'rls-audit-victim@example.com', 'forged.action', 'forged');
    `;
      for (const role of ['viewer', 'owner'] as Role[]) {
        const result = runAsRole(role, setupVictim, forgeSql);
        expect(result.ok).toBe(false);
        expect(result.errorText.toLowerCase()).toContain('row-level security');
      }
    });

    it('a role CAN insert an audit_log row attributed to its own id', () => {
      if (!canRun) return;
      const legitSql = `
      insert into public.audit_log (actor_id, actor_email, action, entity)
        values (:'probe_uuid', 'rls-audit-probe@example.com', 'self.action', 'self');
    `;
      const result = runAsRole('viewer', '', legitSql);
      expect(result.ok).toBe(true);
    });
  },
);

describe.sequential(
  'RLS — every public table has row-level security enabled (no accidental new unprotected table)',
  () => {
    it('zero tables in the public schema lack RLS', () => {
      if (!canRun) return;
      const result = psql(`
      select count(*) from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
    `);
      expect(result.ok).toBe(true);
      expect(countFrom(result)).toBe(0);
    });
  },
);

describe.sequential(
  'RLS — anon (unauthenticated) cannot read any core business table (F4 mitigating control)',
  () => {
    it('anon sees zero rows on sales_order_items, quotations, profiles, employee_private, customers', () => {
      if (!canRun) return;
      for (const table of [
        'sales_order_items',
        'quotations',
        'profiles',
        'employee_private',
        'customers',
      ]) {
        const result = runAsAnon('', `select count(*) from public.${table};`);
        expect(result.ok).toBe(true);
        expect(countFrom(result)).toBe(0);
      }
    });
  },
);
