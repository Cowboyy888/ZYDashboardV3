import { describe, it, expect } from 'vitest';
import {
  extractExpectedObjects,
  extractDroppedObjects,
  filterDroppedObjects,
  diffMigration,
  checkMigrationFile,
} from '../../scripts/check-migration-drift.mjs';

describe('extractExpectedObjects — pure parsing, no I/O', () => {
  it('extracts a table creation', () => {
    const sql = `create table if not exists public.task_departments (\n  id uuid primary key\n);`;
    expect(extractExpectedObjects(sql)).toEqual([{ kind: 'table', table: 'task_departments' }]);
  });

  it('extracts multiple added columns from one alter table statement, attributed to that table', () => {
    const sql = `
      alter table public.telegram_settings
        add column if not exists attendance_office_chat_id text,
        add column if not exists attendance_office_enabled boolean not null default true;
    `;
    expect(extractExpectedObjects(sql)).toEqual([
      { kind: 'column', table: 'telegram_settings', column: 'attendance_office_chat_id' },
      { kind: 'column', table: 'telegram_settings', column: 'attendance_office_enabled' },
    ]);
  });

  it('attributes columns to the correct table when a file alters more than one table', () => {
    const sql = `
      alter table public.employees_select_placeholder
        add column if not exists foo text;
      alter table public.customers
        add column if not exists bar text;
    `;
    const objects = extractExpectedObjects(sql);
    expect(objects).toEqual([
      { kind: 'column', table: 'employees_select_placeholder', column: 'foo' },
      { kind: 'column', table: 'customers', column: 'bar' },
    ]);
  });

  it('extracts an enum value addition', () => {
    const sql = `alter type public.app_role add value if not exists 'marketing_admin';`;
    expect(extractExpectedObjects(sql)).toEqual([
      { kind: 'enum_value', enumType: 'app_role', value: 'marketing_admin' },
    ]);
  });

  it('extracts a mix of all three kinds from one file', () => {
    const sql = `
      create table if not exists public.daily_metrics (id uuid primary key);
      alter table public.daily_metrics
        add column if not exists value numeric;
      alter type public.app_role add value if not exists 'marketing_admin';
    `;
    expect(extractExpectedObjects(sql)).toEqual([
      { kind: 'table', table: 'daily_metrics' },
      { kind: 'column', table: 'daily_metrics', column: 'value' },
      { kind: 'enum_value', enumType: 'app_role', value: 'marketing_admin' },
    ]);
  });

  it('extracts a statement even when a leading comment block precedes it with no semicolon in between (regression: this previously hid 0054 entirely)', () => {
    const sql = `
-- =============================================================================
-- Zysteel Operations — some migration
-- Multi-line header comment, no semicolons inside it, before the first
-- real statement — this used to merge with the statement below when split
-- on ';', breaking the ^alter table anchor.
-- =============================================================================

alter table public.telegram_settings
  add column if not exists attendance_factory_enabled boolean not null default true;
    `;
    expect(extractExpectedObjects(sql)).toEqual([
      { kind: 'column', table: 'telegram_settings', column: 'attendance_factory_enabled' },
    ]);
  });

  it('returns an empty array for a policy/DML-only migration (not a false fingerprint)', () => {
    const sql = `
      drop policy if exists tasks_select on public.tasks;
      create policy tasks_select on public.tasks for select to authenticated
        using ((select public.auth_role()) in ('owner', 'sales_admin'));
    `;
    expect(extractExpectedObjects(sql)).toEqual([]);
  });
});

describe('diffMigration — pure comparison, no I/O', () => {
  it('reports nothing missing when every expected object is present', () => {
    const expected = [{ kind: 'table', table: 'tasks' }];
    const liveState = { tables: new Set(['tasks']), columns: new Set(), enumValues: new Set() };
    expect(diffMigration(expected, liveState)).toEqual([]);
  });

  it('reports a missing table', () => {
    const expected = [{ kind: 'table', table: 'task_departments' }];
    const liveState = { tables: new Set(), columns: new Set(), enumValues: new Set() };
    expect(diffMigration(expected, liveState)).toEqual(['table task_departments']);
  });

  it('reports a missing column distinctly from a missing table', () => {
    const expected = [
      { kind: 'table', table: 'telegram_settings' },
      { kind: 'column', table: 'telegram_settings', column: 'attendance_factory_enabled' },
    ];
    // Table exists (it predates the migration being checked) but the new column doesn't.
    const liveState = {
      tables: new Set(['telegram_settings']),
      columns: new Set(),
      enumValues: new Set(),
    };
    expect(diffMigration(expected, liveState)).toEqual([
      'column telegram_settings.attendance_factory_enabled',
    ]);
  });

  it('reports a missing enum value — reproduces the Marketing Admin incident exactly', () => {
    const expected = [{ kind: 'enum_value', enumType: 'app_role', value: 'marketing_admin' }];
    const liveState = {
      tables: new Set(),
      columns: new Set(),
      enumValues: new Set(['app_role.owner', 'app_role.sales_admin']),
    };
    expect(diffMigration(expected, liveState)).toEqual(['enum value app_role.marketing_admin']);
  });
});

describe('checkMigrationFile — combines parsing + diffing for one file', () => {
  const liveState = { tables: new Set(), columns: new Set(), enumValues: new Set() };

  it('marks a migration with no fingerprintable statements as not checkable', () => {
    const result = checkMigrationFile(
      '0058_rls_only.sql',
      'create policy p on public.t for select;',
      liveState,
    );
    expect(result).toEqual({ filename: '0058_rls_only.sql', checkable: false, missing: [] });
  });

  it('marks a migration as checkable and reports what is missing', () => {
    const sql = `create table if not exists public.task_departments (id uuid primary key);`;
    const result = checkMigrationFile('0056_team_tasks.sql', sql, liveState);
    expect(result.checkable).toBe(true);
    expect(result.missing).toEqual(['table task_departments']);
    expect(result.expectedCount).toBe(1);
  });

  it('reports no missing objects when the live state already has everything', () => {
    const sql = `create table if not exists public.task_departments (id uuid primary key);`;
    const populated = {
      tables: new Set(['task_departments']),
      columns: new Set(),
      enumValues: new Set(),
    };
    const result = checkMigrationFile('0056_team_tasks.sql', sql, populated);
    expect(result.missing).toEqual([]);
  });
});

describe('extractDroppedObjects — pure parsing, mirrors extractExpectedObjects for drops', () => {
  it('extracts a dropped table', () => {
    const sql = `drop table if exists public.deposit_invoice_payments;`;
    expect(extractDroppedObjects(sql).tables).toEqual(new Set(['deposit_invoice_payments']));
  });

  it('extracts dropped columns attributed to their table', () => {
    const sql = `
      alter table public.telegram_settings
        drop column if exists attendance_unclassified_chat_id,
        drop column if exists attendance_unclassified_enabled;
    `;
    expect(extractDroppedObjects(sql).columns).toEqual(
      new Set([
        'telegram_settings.attendance_unclassified_chat_id',
        'telegram_settings.attendance_unclassified_enabled',
      ]),
    );
  });
});

describe('filterDroppedObjects — excludes objects a later migration intentionally removed', () => {
  it('removes a dropped table from the expected list', () => {
    const expected = [{ kind: 'table', table: 'task_departments' }];
    const dropped = { tables: new Set(['task_departments']), columns: new Set() };
    expect(filterDroppedObjects(expected, dropped)).toEqual([]);
  });

  it('removes a dropped column but keeps everything else', () => {
    const expected = [
      { kind: 'column', table: 'telegram_settings', column: 'attendance_factory_enabled' },
      { kind: 'column', table: 'telegram_settings', column: 'attendance_unclassified_chat_id' },
    ];
    const dropped = {
      tables: new Set(),
      columns: new Set(['telegram_settings.attendance_unclassified_chat_id']),
    };
    expect(filterDroppedObjects(expected, dropped)).toEqual([
      { kind: 'column', table: 'telegram_settings', column: 'attendance_factory_enabled' },
    ]);
  });

  it('never filters enum values (Postgres has no DROP VALUE)', () => {
    const expected = [{ kind: 'enum_value', enumType: 'app_role', value: 'marketing_admin' }];
    const dropped = { tables: new Set(['marketing_admin']), columns: new Set() };
    expect(filterDroppedObjects(expected, dropped)).toEqual(expected);
  });

  it('reproduces the real 0054→0055 case: a column added then later dropped is not reported as missing', () => {
    // 0054 added attendance_unclassified_chat_id; 0055 later dropped it on
    // purpose. A fully, correctly migrated database legitimately does not
    // have this column — checkMigrationFile must not flag 0054 for it.
    const migration0054 = `
      alter table public.telegram_settings
        add column if not exists attendance_unclassified_chat_id text;
    `;
    const migration0055 = `
      alter table public.telegram_settings
        drop column if exists attendance_unclassified_chat_id;
    `;
    const droppedGlobally = extractDroppedObjects(migration0055);
    const fullyMigratedLiveState = {
      tables: new Set(),
      columns: new Set(), // correctly does NOT have the column — it was dropped
      enumValues: new Set(),
    };
    const result = checkMigrationFile(
      '0054_attendance_location_destinations.sql',
      migration0054,
      fullyMigratedLiveState,
      droppedGlobally,
    );
    expect(result).toEqual({
      filename: '0054_attendance_location_destinations.sql',
      checkable: false,
      missing: [],
    });
  });
});
