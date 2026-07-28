import { describe, it, expect } from 'vitest';
import {
  EMPTY_FAMILY_USAGE,
  canDeleteFamily,
  familyHasHistory,
  familyDeleteBlockers,
  selectableFamilies,
  type FamilyUsage,
} from '@/lib/domain/products';
import { productFamilySchema, productFamilyUpdateSchema } from '@/lib/validation/schemas';

// A tiny stand-in for the fields the UI/actions read off a family row.
type Fam = { id: string; is_active: boolean };
const fam = (id: string, is_active: boolean): Fam => ({ id, is_active });
const usage = (u: Partial<FamilyUsage>): FamilyUsage => ({ ...EMPTY_FAMILY_USAGE, ...u });

describe('add — createFamily validation (only Chinese name required)', () => {
  it('accepts a family with just the Chinese name', () => {
    const r = productFamilySchema.safeParse({ name: '钢筋网' });
    expect(r.success).toBe(true);
  });

  it('accepts optional English name, default unit, and description', () => {
    const r = productFamilySchema.safeParse({
      name: '钢筋网',
      nameEnglish: 'Rebar mesh',
      defaultUnit: '张',
      description: 'Welded steel mesh',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.nameEnglish).toBe('Rebar mesh');
      expect(r.data.defaultUnit).toBe('张');
    }
  });

  it('rejects a blank Chinese name with a field-level message', () => {
    const r = productFamilySchema.safeParse({ name: '   ' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.find((i) => i.path[0] === 'name')?.message).toBe(
        'Chinese name is required',
      );
    }
  });

  it('does NOT require an internal code (generated server-side)', () => {
    const r = productFamilySchema.safeParse({ name: '拔丝料' });
    expect(r.success).toBe(true);
    // code is not part of the parsed shape any more
    if (r.success) expect('code' in r.data).toBe(false);
  });
});

describe('edit — productFamilyUpdateSchema', () => {
  it('requires an id and a Chinese name', () => {
    const ok = productFamilyUpdateSchema.safeParse({
      id: '11111111-1111-1111-1111-111111111111',
      name: '螺纹盘圆',
    });
    expect(ok.success).toBe(true);

    const noId = productFamilyUpdateSchema.safeParse({ name: '螺纹盘圆' });
    expect(noId.success).toBe(false);
  });
});

describe('archive / reactivate — selectable families for NEW forms', () => {
  it('hides archived families from new forms but keeps active ones', () => {
    const list = [fam('a', true), fam('b', false), fam('c', true)];
    const selectable = selectableFamilies(list).map((f) => f.id);
    expect(selectable).toEqual(['a', 'c']); // b is archived -> hidden
  });

  it('reactivating (is_active back to true) makes a family selectable again', () => {
    const archived = fam('x', false);
    expect(selectableFamilies([archived])).toHaveLength(0);
    const reactivated = { ...archived, is_active: true };
    expect(selectableFamilies([reactivated]).map((f) => f.id)).toEqual(['x']);
  });
});

describe('safe delete — allowed only when a family has no history', () => {
  it('allows delete when there is no history at all', () => {
    expect(familyHasHistory(EMPTY_FAMILY_USAGE)).toBe(false);
    expect(canDeleteFamily(EMPTY_FAMILY_USAGE)).toBe(true);
    expect(familyDeleteBlockers(EMPTY_FAMILY_USAGE)).toEqual([]);
  });
});

describe('blocked delete — any history prevents permanent delete (archive instead)', () => {
  it('blocks delete when the family still has specifications', () => {
    const u = usage({ specs: 2 });
    expect(canDeleteFamily(u)).toBe(false);
    expect(familyDeleteBlockers(u)).toContain('specs');
  });

  it('blocks delete when stock movement history exists', () => {
    const u = usage({ movements: 5 });
    expect(familyHasHistory(u)).toBe(true);
    expect(canDeleteFamily(u)).toBe(false);
    expect(familyDeleteBlockers(u)).toContain('movements');
  });

  it('blocks delete when production records exist', () => {
    const u = usage({ movements: 3, production: 3 });
    expect(canDeleteFamily(u)).toBe(false);
    expect(familyDeleteBlockers(u)).toEqual(expect.arrayContaining(['movements', 'production']));
  });

  it('blocks delete when Phase 2 purchases or sales exist', () => {
    expect(canDeleteFamily(usage({ purchases: 1 }))).toBe(false);
    expect(canDeleteFamily(usage({ sales: 1 }))).toBe(false);
  });
});
