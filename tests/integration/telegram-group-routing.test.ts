import { describe, it, expect } from 'vitest';
import { MockTelegramClient, InMemorySentReportStore, sendReportOnce } from '@/lib/telegram';
import {
  attendanceChatIdFor,
  inventoryChatId,
  attendanceGroupFor,
  ATTENDANCE_LOCATIONS,
  type TelegramDestinations,
  type AttendanceLocation,
} from '@/lib/domain/report-schedule';

/**
 * Proves, at the send layer (not just the pure routing function), that each
 * of the two attendance destinations (Office/Factory) and the Inventory
 * destination never cross — even when all three are fully configured and
 * enabled at the same time.
 */
describe('acceptance — attendance (office/factory) and inventory reports never cross destinations', () => {
  const destinations: TelegramDestinations = {
    attendanceOfficeChatId: '-1001111111111',
    attendanceOfficeEnabled: true,
    attendanceFactoryChatId: '-1003333333333',
    attendanceFactoryEnabled: true,
    inventoryChatId: '-1002222222222',
    inventoryGroupEnabled: true,
  };

  async function sendAttendance(
    client: MockTelegramClient,
    store: InMemorySentReportStore,
    type: 'attendance_morning' | 'attendance_afternoon',
    location: AttendanceLocation,
    date: string,
    d: TelegramDestinations = destinations,
  ) {
    return sendReportOnce(client, store, {
      reportKey: `${type}:${date}:${location}`,
      reportType: type,
      businessDate: date,
      chatId: attendanceChatIdFor(location, d),
      destinationGroup: attendanceGroupFor(location),
      text: `${type} ${location} body`,
    });
  }

  async function sendInventory(
    client: MockTelegramClient,
    store: InMemorySentReportStore,
    date: string,
    d: TelegramDestinations = destinations,
  ) {
    return sendReportOnce(client, store, {
      reportKey: `inventory:${date}`,
      reportType: 'inventory',
      businessDate: date,
      chatId: inventoryChatId(d),
      destinationGroup: 'inventory',
      text: 'inventory body',
    });
  }

  it('sends each attendance location only to its own chat id', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();
    const date = '2026-07-25';

    for (const location of ATTENDANCE_LOCATIONS) {
      await sendAttendance(client, store, 'attendance_morning', location, date);
    }

    expect(client.sent).toHaveLength(2);
    const byLocation = new Map(
      ATTENDANCE_LOCATIONS.map((loc) => [attendanceChatIdFor(loc, destinations), loc]),
    );
    for (const msg of client.sent) {
      expect(byLocation.has(msg.chatId)).toBe(true);
      expect(msg.chatId).not.toBe(destinations.inventoryChatId);
    }
    // Both resolved chat ids are distinct.
    expect(new Set(client.sent.map((m) => m.chatId)).size).toBe(2);
  });

  it('sends the inventory report only to the Inventory destination chat id', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();

    await sendInventory(client, store, '2026-07-25');

    expect(client.sent).toHaveLength(1);
    const [msg] = client.sent;
    expect(msg?.chatId).toBe(destinations.inventoryChatId);
    expect(ATTENDANCE_LOCATIONS.map((loc) => attendanceChatIdFor(loc, destinations))).not.toContain(
      msg?.chatId,
    );
  });

  it('a full day of both shifts (both locations) plus inventory never mixes destinations, and logs record the correct group', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();
    const date = '2026-07-25';

    for (const location of ATTENDANCE_LOCATIONS) {
      await sendAttendance(client, store, 'attendance_morning', location, date);
      await sendAttendance(client, store, 'attendance_afternoon', location, date);
    }
    await sendInventory(client, store, date);

    expect(client.sent).toHaveLength(5); // 2 locations x 2 shifts + 1 inventory

    for (const location of ATTENDANCE_LOCATIONS) {
      const entry = store.entries.find(
        (e) =>
          e.reportType === 'attendance_morning' &&
          e.chatId === attendanceChatIdFor(location, destinations),
      );
      expect(entry?.destinationGroup).toBe(attendanceGroupFor(location));
    }
    const invEntry = store.entries.find((e) => e.reportType === 'inventory');
    expect(invEntry?.destinationGroup).toBe('inventory');
    expect(invEntry?.chatId).toBe(destinations.inventoryChatId);
  });

  it('an unconfigured Inventory destination blocks only inventory, attendance still sends to both locations', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();
    const partial: TelegramDestinations = { ...destinations, inventoryChatId: null };
    const date = '2026-07-25';

    for (const location of ATTENDANCE_LOCATIONS) {
      const outcome = await sendAttendance(
        client,
        store,
        'attendance_morning',
        location,
        date,
        partial,
      );
      expect(outcome.status).toBe('sent');
    }
    const inventory = await sendInventory(client, store, date, partial);

    expect(inventory.status).toBe('no_chat');
    expect(client.sent).toHaveLength(2);
  });

  it('a disabled Factory destination blocks only Factory — Office and Inventory still send', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();
    const partial: TelegramDestinations = { ...destinations, attendanceFactoryEnabled: false };
    const date = '2026-07-25';

    const factory = await sendAttendance(
      client,
      store,
      'attendance_morning',
      'factory',
      date,
      partial,
    );
    const office = await sendAttendance(
      client,
      store,
      'attendance_morning',
      'office',
      date,
      partial,
    );
    const inventory = await sendInventory(client, store, date, partial);

    expect(factory.status).toBe('no_chat');
    expect(office.status).toBe('sent');
    expect(inventory.status).toBe('sent');
    expect(client.sent).toHaveLength(2);
  });
});
