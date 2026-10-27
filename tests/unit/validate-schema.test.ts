import { afterEach, describe, expect, it } from 'vitest';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('validate-schema', () => {
  it('never replays migration files against SUPABASE_DB_URL', () => {
    const dir = mkdtempSync(join(tmpdir(), 'zysteel-schema-'));
    tempDirs.push(dir);
    const argsPath = join(dir, 'psql-args.txt');
    const psqlPath = join(dir, 'psql');
    writeFileSync(psqlPath, `#!/bin/sh\nprintf '%s\\n' "$@" >> '${argsPath}'\nexit 0\n`);
    chmodSync(psqlPath, 0o755);

    const result = spawnSync(process.execPath, ['scripts/validate-schema.mjs'], {
      cwd: root,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: dir,
        SUPABASE_DB_URL: 'postgresql://schema-test@localhost:54322/postgres',
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('migration replay intentionally disabled');
    expect(readFileSync(argsPath, 'utf8')).not.toContain('-f');
  });
});
