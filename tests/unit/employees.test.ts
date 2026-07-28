import { describe, it, expect } from 'vitest';
import { formatEmployeeCode } from '@/lib/domain/employees';
import { employeeSchema } from '@/lib/validation/schemas';

const GROUP = '11111111-1111-1111-1111-111111111111';

describe('formatEmployeeCode', () => {
  it('formats the sequence as ZY-####', () => {
    expect(formatEmployeeCode(1)).toBe('ZY-0001');
    expect(formatEmployeeCode(2)).toBe('ZY-0002');
    expect(formatEmployeeCode(42)).toBe('ZY-0042');
    expect(formatEmployeeCode(9999)).toBe('ZY-9999');
    expect(formatEmployeeCode(10000)).toBe('ZY-10000'); // never truncated
  });
});

describe('create-employee schema — root cause of "Validation failed" fixed', () => {
  it('accepts ONLY display name + attendance group + job title', () => {
    // Previously this failed: the schema required a manual employeeCode AND a
    // Khmer/English/Chinese name. Both requirements are now removed.
    const r = employeeSchema.safeParse({
      displayName: 'thol savarin',
      attendanceGroupId: GROUP,
      jobTitle: '焊网机机长',
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.payType).toBe('monthly'); // sensible default
      expect(r.data.startDate).toBeUndefined(); // action defaults it to today
    }
  });

  it('does not require an Employee ID or any alternate name', () => {
    const r = employeeSchema.safeParse({
      displayName: 'Sok Dara',
      attendanceGroupId: GROUP,
      jobTitle: 'Operator',
      // no employeeCode, no name_* — must still pass
    });
    expect(r.success).toBe(true);
  });

  it('reports a field-level error for each missing required field', () => {
    const r = employeeSchema.safeParse({ displayName: '', attendanceGroupId: '', jobTitle: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const byPath = Object.fromEntries(r.error.issues.map((i) => [i.path.join('.'), i.message]));
      expect(byPath.displayName).toBe('English name is required');
      expect(byPath.attendanceGroupId).toBe('Attendance group is required');
      expect(byPath.jobTitle).toBe('Job title is required');
    }
  });

  it('rejects a non-uuid attendance group with the group message', () => {
    const r = employeeSchema.safeParse({
      displayName: 'X',
      attendanceGroupId: 'not-a-uuid',
      jobTitle: 'Y',
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.find((i) => i.path[0] === 'attendanceGroupId')?.message).toBe(
        'Attendance group is required',
      );
    }
  });
});
