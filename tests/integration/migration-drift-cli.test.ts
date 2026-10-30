import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  extractExpectedObjects,
  extractDroppedObjects,
} from '../../scripts/check-migration-drift.mjs';

const tempDirs: string[] = [];
const migrationSql = readdirSync('supabase/migrations')
  .filter((file) => file.endsWith('.sql'))
  .map((file) => readFileSync(join('supabase/migrations', file), 'utf8'));
const retiredTables = new Set([
  'suppliers',
  'purchase_orders',
  'purchase_order_items',
  'purchase_order_manual_items',
  'purchase_order_seq',
]);
const droppedColumns = new Set(
  migrationSql.flatMap((sql) => [...extractDroppedObjects(sql).columns]),
);

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function runChecker(missingObject?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'zysteel-drift-cli-'));
  tempDirs.push(dir);
  // Model a retired catalog independently of the DROP TABLE parser under test.
  const objects = migrationSql.flatMap(extractExpectedObjects).filter((obj) => {
    if (obj.kind === 'enum_value') return true;
    return !retiredTables.has(obj.table) && !droppedColumns.has(`${obj.table}.${obj.column}`);
  });
  const snapshot = {
    tables: [...new Set(objects.filter((obj) => obj.kind === 'table').map((obj) => obj.table))],
    columns: [
      ...new Set(
        objects.filter((obj) => obj.kind === 'column').map((obj) => `${obj.table}.${obj.column}`),
      ),
    ],
    enums: [
      ...new Set(
        objects
          .filter((obj) => obj.kind === 'enum_value')
          .map((obj) => `${obj.enumType}.${obj.value}`),
      ),
    ],
  };
  snapshot.tables = snapshot.tables.filter((name) => name !== missingObject);
  snapshot.columns = snapshot.columns.filter((name) => name !== missingObject);
  writeFileSync(join(dir, 'snapshot.json'), JSON.stringify(snapshot));
  const queriesPath = join(dir, 'queries.log');
  writeFileSync(queriesPath, '');
  const psqlPath = join(dir, 'psql');
  writeFileSync(
    psqlPath,
    `#!${process.execPath}
const fs = require('node:fs');
const path = require('node:path');
const sql = process.argv[process.argv.indexOf('-c') + 1];
if (!sql || !/^select\\s/i.test(sql)) process.exit(2);
fs.appendFileSync(path.join(__dirname, 'queries.log'), sql + '\\n');
const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, 'snapshot.json'), 'utf8'));
const rows = sql.includes('information_schema.tables') ? snapshot.tables
  : sql.includes('information_schema.columns') ? snapshot.columns
  : sql.includes('pg_enum') ? snapshot.enums : [];
process.stdout.write(rows.join('\\n'));
`,
  );
  chmodSync(psqlPath, 0o755);
  const result = spawnSync(process.execPath, ['scripts/check-migration-drift.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${dir}:${process.env.PATH}`,
      SUPABASE_DB_URL: 'postgresql://fixture@127.0.0.1/postgres',
    },
  });
  return { ...result, queries: readFileSync(queriesPath, 'utf8') };
}

describe('migration drift CLI — final retired catalog, fixture psql only', () => {
  it('accepts the retired catalog and issues only read queries', () => {
    const result = runChecker();
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(result.stdout).toContain('No drift detected in the objects this tool can check');
    expect(result.queries.trim().split('\n')).toHaveLength(4);
    expect(
      result.queries
        .trim()
        .split('\n')
        .every((sql) => /^select\s/i.test(sql)),
    ).toBe(true);
    expect(result.stdout + result.stderr).not.toContain('postgresql://fixture');
  });

  it.each([
    ['tasks', 'table tasks'],
    ['stock_movements.batch_reference', 'column stock_movements.batch_reference'],
  ])('still fails for missing surviving object %s', (missingObject, expected) => {
    const result = runChecker(missingObject);
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`missing: ${expected}`);
    expect(result.stderr).toContain('Drift detected');
  });
});
