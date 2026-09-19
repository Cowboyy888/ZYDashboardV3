import { describe, it, expect } from 'vitest';
import { maintenanceStatus, DUE_SOON_DAYS } from '@/lib/domain/maintenance';

describe('maintenanceStatus', () => {
  it('is "none" when no next-due date is set', () => {
    expect(maintenanceStatus(null, '2026-09-19')).toBe('none');
  });

  it('is "overdue" once the due date has passed', () => {
    expect(maintenanceStatus('2026-09-18', '2026-09-19')).toBe('overdue');
    expect(maintenanceStatus('2026-01-01', '2026-09-19')).toBe('overdue');
  });

  it('is "due_soon" when due today or within the due-soon window', () => {
    expect(maintenanceStatus('2026-09-19', '2026-09-19')).toBe('due_soon'); // due today
    expect(maintenanceStatus('2026-09-26', '2026-09-19')).toBe('due_soon'); // exactly DUE_SOON_DAYS out
    expect(DUE_SOON_DAYS).toBe(7);
  });

  it('is "ok" when due further out than the due-soon window', () => {
    expect(maintenanceStatus('2026-09-27', '2026-09-19')).toBe('ok'); // one day past the window
    expect(maintenanceStatus('2027-01-01', '2026-09-19')).toBe('ok');
  });

  it('handles month/year boundaries correctly', () => {
    expect(maintenanceStatus('2026-10-01', '2026-09-30')).toBe('due_soon'); // 1 day out
    expect(maintenanceStatus('2026-01-02', '2025-12-31')).toBe('due_soon'); // crosses year boundary
  });
});
