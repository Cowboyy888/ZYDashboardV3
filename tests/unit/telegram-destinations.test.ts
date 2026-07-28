import { describe, it, expect } from 'vitest';
import { destinationChatId, type TelegramDestinations } from '@/lib/domain/report-schedule';
import { maskChatId } from '@/lib/domain/telegram-mask';

const destinations = (o: Partial<TelegramDestinations> = {}): TelegramDestinations => ({
  attendanceChatId: '-1001111111111',
  attendanceGroupEnabled: true,
  inventoryChatId: '-1002222222222',
  inventoryGroupEnabled: true,
  ...o,
});

describe('destinationChatId — Attendance Group vs Inventory Group never cross', () => {
  it('routes both attendance report types to the attendance chat id only', () => {
    const d = destinations();
    expect(destinationChatId('attendance_morning', d)).toBe(d.attendanceChatId);
    expect(destinationChatId('attendance_afternoon', d)).toBe(d.attendanceChatId);
    expect(destinationChatId('attendance_morning', d)).not.toBe(d.inventoryChatId);
    expect(destinationChatId('attendance_afternoon', d)).not.toBe(d.inventoryChatId);
  });

  it('routes the inventory report to the inventory chat id only', () => {
    const d = destinations();
    expect(destinationChatId('inventory', d)).toBe(d.inventoryChatId);
    expect(destinationChatId('inventory', d)).not.toBe(d.attendanceChatId);
  });

  it('a disabled Attendance Group yields no chat id, but Inventory is unaffected', () => {
    const d = destinations({ attendanceGroupEnabled: false });
    expect(destinationChatId('attendance_morning', d)).toBeNull();
    expect(destinationChatId('attendance_afternoon', d)).toBeNull();
    expect(destinationChatId('inventory', d)).toBe(d.inventoryChatId);
  });

  it('a disabled Inventory Group yields no chat id, but Attendance is unaffected', () => {
    const d = destinations({ inventoryGroupEnabled: false });
    expect(destinationChatId('inventory', d)).toBeNull();
    expect(destinationChatId('attendance_morning', d)).toBe(d.attendanceChatId);
    expect(destinationChatId('attendance_afternoon', d)).toBe(d.attendanceChatId);
  });

  it('a missing (never configured) Attendance chat id yields null, independent of Inventory', () => {
    const d = destinations({ attendanceChatId: null });
    expect(destinationChatId('attendance_morning', d)).toBeNull();
    expect(destinationChatId('inventory', d)).toBe(d.inventoryChatId);
  });

  it('a missing (never configured) Inventory chat id yields null, independent of Attendance', () => {
    const d = destinations({ inventoryChatId: null });
    expect(destinationChatId('inventory', d)).toBeNull();
    expect(destinationChatId('attendance_morning', d)).toBe(d.attendanceChatId);
  });

  it('both groups configured and enabled resolve to two distinct chat ids', () => {
    const d = destinations();
    const attendance = destinationChatId('attendance_morning', d);
    const inventory = destinationChatId('inventory', d);
    expect(attendance).not.toBeNull();
    expect(inventory).not.toBeNull();
    expect(attendance).not.toBe(inventory);
  });
});

describe('maskChatId — full chat id never displayed', () => {
  it('shows only the last 4 characters, everything else replaced', () => {
    expect(maskChatId('-1001234567890')).toBe('••••7890');
  });

  it('returns null for an unset chat id', () => {
    expect(maskChatId(null)).toBeNull();
    expect(maskChatId(undefined)).toBeNull();
    expect(maskChatId('')).toBeNull();
  });

  it('never contains the full original value for a realistic chat id', () => {
    const real = '-1009876543210';
    const masked = maskChatId(real);
    expect(masked).not.toBe(real);
    expect(masked).not.toContain(real);
  });
});
