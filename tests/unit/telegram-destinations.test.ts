import { describe, it, expect } from 'vitest';
import {
  attendanceChatIdFor,
  inventoryChatId,
  attendanceGroupFor,
  type TelegramDestinations,
} from '@/lib/domain/report-schedule';
import { maskChatId } from '@/lib/domain/telegram-mask';

const destinations = (o: Partial<TelegramDestinations> = {}): TelegramDestinations => ({
  attendanceOfficeChatId: '-1001111111111',
  attendanceOfficeEnabled: true,
  attendanceFactoryChatId: '-1003333333333',
  attendanceFactoryEnabled: true,
  inventoryChatId: '-1002222222222',
  inventoryGroupEnabled: true,
  ...o,
});

describe('attendanceGroupFor — the ReportGroup for each location', () => {
  it('maps each location to its own group, matching the telegram_settings column prefix', () => {
    expect(attendanceGroupFor('office')).toBe('attendance_office');
    expect(attendanceGroupFor('factory')).toBe('attendance_factory');
  });
});

describe('attendanceChatIdFor / inventoryChatId — Office and Factory never cross, nor with inventory', () => {
  it('routes each location to its own configured chat id only', () => {
    const d = destinations();
    expect(attendanceChatIdFor('office', d)).toBe(d.attendanceOfficeChatId);
    expect(attendanceChatIdFor('factory', d)).toBe(d.attendanceFactoryChatId);
    // All three resolved ids are distinct — no accidental cross-routing.
    const all = [
      attendanceChatIdFor('office', d),
      attendanceChatIdFor('factory', d),
      inventoryChatId(d),
    ];
    expect(new Set(all).size).toBe(3);
  });

  it('a disabled Office destination yields no chat id, the others are unaffected', () => {
    const d = destinations({ attendanceOfficeEnabled: false });
    expect(attendanceChatIdFor('office', d)).toBeNull();
    expect(attendanceChatIdFor('factory', d)).toBe(d.attendanceFactoryChatId);
    expect(inventoryChatId(d)).toBe(d.inventoryChatId);
  });

  it('a disabled Factory destination yields no chat id, the others are unaffected', () => {
    const d = destinations({ attendanceFactoryEnabled: false });
    expect(attendanceChatIdFor('factory', d)).toBeNull();
    expect(attendanceChatIdFor('office', d)).toBe(d.attendanceOfficeChatId);
  });

  it('a disabled Inventory destination yields no chat id, attendance is unaffected', () => {
    const d = destinations({ inventoryGroupEnabled: false });
    expect(inventoryChatId(d)).toBeNull();
    expect(attendanceChatIdFor('office', d)).toBe(d.attendanceOfficeChatId);
  });

  it('a missing (never configured) chat id yields null, independent of the other destinations', () => {
    const d = destinations({ attendanceFactoryChatId: null });
    expect(attendanceChatIdFor('factory', d)).toBeNull();
    expect(attendanceChatIdFor('office', d)).toBe(d.attendanceOfficeChatId);
    expect(inventoryChatId(d)).toBe(d.inventoryChatId);
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
