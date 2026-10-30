#!/usr/bin/env node
/**
 * Read-only migration-drift checker.
 *
 * Why this exists: three separate production incidents this project (see
 * docs/DEVELOPMENT_ROADMAP.md Task 2 report) all had the same root cause —
 * a migration file committed to this repo, with its application code
 * already deployed, but never actually applied to the production database.
 * Nothing previously detected that gap before a user hit it live.
 *
 * What this checks: for each migration file, it extracts the tables/
 * columns/enum values that file's `create table if not exists` /
 * `add column if not exists` / `add value if not exists` statements
 * introduce, then checks whether those objects actually exist in a target
 * database. A migration with none of those statements (pure RLS/DML/policy
 * changes) has nothing to fingerprint and is reported as "not checkable" —
 * this tool narrows the blind spot, it does not claim to close it.
 *
 * This is NOT a replacement for supabase_migrations.schema_migrations (the
 * Supabase CLI's own tracking table) — it's a fallback for exactly the
 * situation this project is actually in: production migrations here are
 * applied via raw `psql -f file.sql` / the SQL Editor, not `supabase
 * migration up`, so that tracking table is not a reliable record of what's
 * really been applied (confirmed: it IS fully populated on a CLI-managed
 * local database, which only proves the mechanism works when the CLI is
 * used — it says nothing about a database that was always migrated by hand).
 *
 * Guarantees:
 *  - Never applies, modifies, or repairs anything. Only SELECT queries run
 *    against the target database.
 *  - Never prints SUPABASE_DB_URL or any connection string/credential.
 *  - Exits 0 when no actionable drift is found (or no DB URL is configured
 *    — this is an optional, additive check, same posture as
 *    validate-schema.mjs's own optional live-apply step).
 *  - Exits 1 when a migration's fingerprinted objects are missing from the
 *    target database, or the target database is configured but
 *    unreachable.
 *
 * Usage:
 *   SUPABASE_DB_URL="postgresql://..." node scripts/check-migration-drift.mjs
 *   npm run db:drift -- (same, via the package.json script)
 *
 * Without SUPABASE_DB_URL set, this only reports what it *would* check
 * (migration count, how many are fingerprint-checkable) and exits 0 — same
 * "skip gracefully, don't fail CI without a database" posture as
 * validate-schema.mjs's live-apply step.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = join(root, 'supabase', 'migrations');

// --- Pure parsing: derive "fingerprint" objects from one migration's SQL ----
// Deliberately narrow (table/column/enum-value additions only) — see the
// file header for why a partial signal is still useful and honestly scoped.

/**
 * Strip `-- ...` line comments before any other processing. Required because
 * every migration in this repo opens with a multi-line `--` header comment
 * and has no semicolon inside it — without stripping first, that comment
 * merges into the same semicolon-delimited chunk as the statement right
 * after it, and `^alter table` (anchored to the start of the chunk) never
 * matches. Found by this script failing to fingerprint a migration (0054)
 * that demonstrably does add columns — see the live-DB verification in the
 * Task 2 report, not a theoretical concern.
 */
function stripLineComments(sql) {
  return sql
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

export function extractExpectedObjects(rawSql) {
  const sql = stripLineComments(rawSql);
  const objects = [];

  for (const m of sql.matchAll(/create table if not exists public\.(\w+)/gi)) {
    objects.push({ kind: 'table', table: m[1] });
  }

  // Columns are associated with their table per-statement (split on `;`),
  // since one `alter table` commonly adds several columns in one statement.
  for (const stmtRaw of sql.split(';')) {
    const stmt = stmtRaw.trim();
    const tableMatch = stmt.match(/^alter table public\.(\w+)/i);
    if (!tableMatch) continue;
    const table = tableMatch[1];
    for (const m of stmt.matchAll(/add column if not exists (\w+)/gi)) {
      objects.push({ kind: 'column', table, column: m[1] });
    }
  }

  for (const m of sql.matchAll(/alter type public\.(\w+) add value if not exists '(\w+)'/gi)) {
    objects.push({ kind: 'enum_value', enumType: m[1], value: m[2] });
  }

  return objects;
}

/**
 * Mirror of extractExpectedObjects, for `drop table [if exists]` / `drop
 * column if exists` instead of the `add`/`create` forms — needed because
 * this repo's migrations are additive-only but a LATER migration is allowed
 * to drop something an EARLIER one added (0054 added the `*_unclassified_*`
 * telegram_settings columns; 0055 later dropped them, on purpose). Without
 * this, the checker would permanently flag 0054 as drifted even on a
 * database migrated correctly end-to-end, since those columns are *meant*
 * to be absent in the final schema. Found by this script reporting exactly
 * that false positive against a freshly-reset, fully-migrated local
 * database — see the Task 2 report.
 */
export function extractDroppedObjects(rawSql) {
  const sql = stripLineComments(rawSql);
  const dropped = { tables: new Set(), columns: new Set() };

  for (const m of sql.matchAll(/\bdrop\s+table\s+(?:if\s+exists\s+)?public\.(\w+)\b/gi)) {
    dropped.tables.add(m[1]);
  }

  for (const stmtRaw of sql.split(';')) {
    const stmt = stmtRaw.trim();
    const tableMatch = stmt.match(/^alter table public\.(\w+)/i);
    if (!tableMatch) continue;
    const table = tableMatch[1];
    for (const m of stmt.matchAll(/drop column if exists (\w+)/gi)) {
      dropped.columns.add(`${table}.${m[1]}`);
    }
  }

  return dropped;
}

/** Remove objects known to be intentionally dropped by some (any) migration. */
export function filterDroppedObjects(expectedObjects, droppedGlobally) {
  return expectedObjects.filter((obj) => {
    if (obj.kind === 'table') return !droppedGlobally.tables.has(obj.table);
    if (obj.kind === 'column') {
      return (
        !droppedGlobally.tables.has(obj.table) &&
        !droppedGlobally.columns.has(`${obj.table}.${obj.column}`)
      );
    }
    return true; // enum values: Postgres has no DROP VALUE, nothing to exclude.
  });
}

// --- Pure diff: compare expected objects against a live-state snapshot ------

export function diffMigration(expectedObjects, liveState) {
  const missing = [];
  for (const obj of expectedObjects) {
    if (obj.kind === 'table') {
      if (!liveState.tables.has(obj.table)) missing.push(`table ${obj.table}`);
    } else if (obj.kind === 'column') {
      if (!liveState.columns.has(`${obj.table}.${obj.column}`)) {
        missing.push(`column ${obj.table}.${obj.column}`);
      }
    } else if (obj.kind === 'enum_value') {
      if (!liveState.enumValues.has(`${obj.enumType}.${obj.value}`)) {
        missing.push(`enum value ${obj.enumType}.${obj.value}`);
      }
    }
  }
  return missing;
}

const NOTHING_DROPPED = { tables: new Set(), columns: new Set() };

export function checkMigrationFile(filename, sql, liveState, droppedGlobally = NOTHING_DROPPED) {
  const expected = filterDroppedObjects(extractExpectedObjects(sql), droppedGlobally);
  if (expected.length === 0) return { filename, checkable: false, missing: [] };
  return {
    filename,
    checkable: true,
    missing: diffMigration(expected, liveState),
    expectedCount: expected.length,
  };
}

// --- I/O: read-only fetch of live state from a target database --------------

function runReadOnlyQuery(dbUrl, sql) {
  // execFileSync (not a shell string) so the connection string is never
  // interpolated into a shell command line.
  return execFileSync('psql', [dbUrl, '-t', '-A', '-F', '\t', '-v', 'ON_ERROR_STOP=1', '-c', sql], {
    encoding: 'utf8',
  });
}

function fetchLiveState(dbUrl) {
  const tables = new Set(
    runReadOnlyQuery(
      dbUrl,
      `select table_name from information_schema.tables where table_schema = 'public';`,
    )
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const columns = new Set(
    runReadOnlyQuery(
      dbUrl,
      `select table_name || '.' || column_name from information_schema.columns where table_schema = 'public';`,
    )
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
  const enumValues = new Set(
    runReadOnlyQuery(
      dbUrl,
      `select t.typname || '.' || e.enumlabel from pg_enum e join pg_type t on e.enumtypid = t.oid;`,
    )
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean),
  );
  return { tables, columns, enumValues };
}

/** Best-effort, informational only — see the file header for why this isn't authoritative here. */
function fetchTrackedMigrationVersions(dbUrl) {
  try {
    const out = runReadOnlyQuery(
      dbUrl,
      `select version from supabase_migrations.schema_migrations order by version;`,
    );
    return out
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
  } catch {
    return null; // schema/table doesn't exist, or isn't reachable — not fatal.
  }
}

// --- CLI ----------------------------------------------------------------------

async function main() {
  const files = readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  console.log('Migration drift check');
  console.log(`  ${files.length} migration files in supabase/migrations/`);

  const parsed = files.map((f) => ({
    filename: f,
    sql: readFileSync(join(migrationsDir, f), 'utf8'),
  }));

  // Global: anything ANY migration drops, regardless of which file added it
  // — additions later undone on purpose aren't expected to exist anymore.
  const droppedGlobally = { tables: new Set(), columns: new Set() };
  for (const p of parsed) {
    const d = extractDroppedObjects(p.sql);
    for (const t of d.tables) droppedGlobally.tables.add(t);
    for (const c of d.columns) droppedGlobally.columns.add(c);
  }

  const checkableCount = parsed.filter(
    (p) => filterDroppedObjects(extractExpectedObjects(p.sql), droppedGlobally).length > 0,
  ).length;
  console.log(
    `  ${checkableCount} of ${files.length} have a table/column/enum-value fingerprint this tool can check;`,
    `${files.length - checkableCount} are policy/DML-only, or add only objects later intentionally dropped, and are not checkable by this tool.`,
  );

  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) {
    console.log(
      '\nSUPABASE_DB_URL not set — nothing to compare against. Exiting 0 (optional check).',
    );
    process.exit(0);
  }

  try {
    execFileSync('command', ['-v', 'psql'], { stdio: 'ignore', shell: '/bin/bash' });
  } catch {
    console.log(
      '\npsql not found on PATH — cannot run the live check. Exiting 0 (optional check).',
    );
    process.exit(0);
  }

  let liveState;
  try {
    liveState = fetchLiveState(dbUrl);
  } catch {
    console.error(
      '\n✗ Could not reach or query the target database (connection string withheld from output).',
    );
    process.exit(1);
  }

  const trackedVersions = fetchTrackedMigrationVersions(dbUrl);
  if (trackedVersions === null) {
    console.log(
      '\n(supabase_migrations.schema_migrations not found or unreadable on the target — informational only, skipping that signal)',
    );
  } else {
    const localVersions = new Set(files.map((f) => f.split('_')[0]));
    const trackedSet = new Set(trackedVersions);
    const untracked = [...localVersions].filter((v) => !trackedSet.has(v));
    console.log(
      `\nsupabase_migrations.schema_migrations: ${trackedVersions.length} versions recorded` +
        (untracked.length
          ? ` — ${untracked.length} local migration(s) NOT recorded there (informational only, not authoritative for this project — see file header): ${untracked.join(', ')}`
          : ', matches local migration count.'),
    );
  }

  console.log('\nFingerprint check against the target database:');
  let driftFound = false;
  for (const p of parsed) {
    const result = checkMigrationFile(p.filename, p.sql, liveState, droppedGlobally);
    if (!result.checkable) continue;
    if (result.missing.length === 0) {
      console.log(`  ✓ ${p.filename}`);
    } else {
      driftFound = true;
      console.log(`  ✗ ${p.filename} — missing: ${result.missing.join(', ')}`);
    }
  }

  if (driftFound) {
    console.error(
      '\n✗ Drift detected — one or more migrations have not been fully applied to this database.',
    );
    console.error(
      '  This tool never applies migrations. Apply the listed file(s) manually, in order, then re-run.',
    );
    process.exit(1);
  }
  console.log('\n✅ No drift detected in the objects this tool can check.');
  process.exit(0);
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main();
}
