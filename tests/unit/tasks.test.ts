import { describe, it, expect } from 'vitest';
import { isOverdue, summarizeTasks, mergeCounts, type TaskLike } from '@/lib/domain/tasks';

const TODAY = '2026-07-24';

describe('isOverdue — derived, never stored', () => {
  it('a past-dated planned/in_progress task is overdue', () => {
    expect(
      isOverdue({ employeeId: 'e1', businessDate: '2026-07-23', status: 'planned' }, TODAY),
    ).toBe(true);
    expect(
      isOverdue({ employeeId: 'e1', businessDate: '2026-07-23', status: 'in_progress' }, TODAY),
    ).toBe(true);
  });

  it('a past-dated but resolved task is not overdue', () => {
    for (const status of ['completed', 'partially_completed', 'cancelled'] as const) {
      expect(isOverdue({ employeeId: 'e1', businessDate: '2026-07-23', status }, TODAY)).toBe(
        false,
      );
    }
  });

  it("today's or a future task is never overdue regardless of status", () => {
    expect(isOverdue({ employeeId: 'e1', businessDate: TODAY, status: 'planned' }, TODAY)).toBe(
      false,
    );
    expect(
      isOverdue({ employeeId: 'e1', businessDate: '2026-07-25', status: 'planned' }, TODAY),
    ).toBe(false);
  });
});

describe('summarizeTasks — rollup + completion rate', () => {
  it('counts each status and computes completion rate excluding cancelled', () => {
    const tasks: TaskLike[] = [
      { employeeId: 'e1', businessDate: TODAY, status: 'completed' },
      { employeeId: 'e1', businessDate: TODAY, status: 'completed' },
      { employeeId: 'e1', businessDate: TODAY, status: 'in_progress' },
      { employeeId: 'e1', businessDate: TODAY, status: 'planned' },
      { employeeId: 'e1', businessDate: TODAY, status: 'partially_completed' },
      { employeeId: 'e1', businessDate: TODAY, status: 'cancelled' },
      { employeeId: 'e1', businessDate: '2026-07-23', status: 'planned' }, // overdue
    ];
    const s = summarizeTasks(tasks, TODAY);
    expect(s.total).toBe(7);
    expect(s.completed).toBe(2);
    expect(s.inProgress).toBe(1);
    expect(s.planned).toBe(2);
    expect(s.partiallyCompleted).toBe(1);
    expect(s.cancelled).toBe(1);
    expect(s.overdue).toBe(1);
    // completed / (total - cancelled) = 2 / 6
    expect(s.completionRate).toBeCloseTo(2 / 6, 5);
  });

  it('returns a zeroed summary with 0 completion rate for an empty list', () => {
    const s = summarizeTasks([], TODAY);
    expect(s.total).toBe(0);
    expect(s.completionRate).toBe(0);
  });

  it('a fully cancelled set has 0 completion rate, not division by zero / NaN', () => {
    const tasks: TaskLike[] = [{ employeeId: 'e1', businessDate: TODAY, status: 'cancelled' }];
    expect(summarizeTasks(tasks, TODAY).completionRate).toBe(0);
  });
});

describe('mergeCounts — per-employee summaries roll up to a team total', () => {
  it('sums every field across summaries and recomputes completion rate from the totals', () => {
    const a = summarizeTasks(
      [
        { employeeId: 'e1', businessDate: TODAY, status: 'completed' },
        { employeeId: 'e1', businessDate: TODAY, status: 'planned' },
      ],
      TODAY,
    );
    const b = summarizeTasks(
      [
        { employeeId: 'e2', businessDate: TODAY, status: 'completed' },
        { employeeId: 'e2', businessDate: TODAY, status: 'cancelled' },
      ],
      TODAY,
    );
    const merged = mergeCounts([a, b]);
    expect(merged.total).toBe(4);
    expect(merged.completed).toBe(2);
    expect(merged.planned).toBe(1);
    expect(merged.cancelled).toBe(1);
    // 2 completed / (4 total - 1 cancelled) = 2/3
    expect(merged.completionRate).toBeCloseTo(2 / 3, 5);
  });
});
