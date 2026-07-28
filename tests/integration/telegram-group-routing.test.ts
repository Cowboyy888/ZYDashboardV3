import { describe, it, expect } from 'vitest';
import { MockTelegramClient, InMemorySentReportStore, sendReportOnce } from '@/lib/telegram';
import {
  destinationChatId,
  reportGroup,
  type TelegramDestinations,
} from '@/lib/domain/report-schedule';

/**
 * Proves, at the send layer (not just the pure routing function), that
 * attendance reports never reach the Inventory Group's chat and inventory
 * reports never reach the Attendance Group's chat — even when both
 * destinations are fully configured and enabled at the same time.
 */
describe('acceptance — attendance and inventory reports never cross destinations', () => {
  const destinations: TelegramDestinations = {
    attendanceChatId: '-1001111111111', // Attendance Group
    attendanceGroupEnabled: true,
    inventoryChatId: '-1002222222222', // Inventory Group
    inventoryGroupEnabled: true,
  };

  async function send(
    client: MockTelegramClient,
    store: InMemorySentReportStore,
    type: 'attendance_morning' | 'attendance_afternoon' | 'inventory',
    date: string,
  ) {
    return sendReportOnce(client, store, {
      reportKey: `${type}:${date}`,
      reportType: type,
      businessDate: date,
      chatId: destinationChatId(type, destinations),
      destinationGroup: reportGroup(type),
      text: `${type} body`,
    });
  }

  it('sends attendance reports only to the Attendance Group chat id', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();

    await send(client, store, 'attendance_morning', '2026-07-25');
    await send(client, store, 'attendance_afternoon', '2026-07-25');

    expect(client.sent).toHaveLength(2);
    for (const msg of client.sent) {
      expect(msg.chatId).toBe(destinations.attendanceChatId);
      expect(msg.chatId).not.toBe(destinations.inventoryChatId);
    }
  });

  it('sends the inventory report only to the Inventory Group chat id', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();

    await send(client, store, 'inventory', '2026-07-25');

    expect(client.sent).toHaveLength(1);
    const [msg] = client.sent;
    expect(msg?.chatId).toBe(destinations.inventoryChatId);
    expect(msg?.chatId).not.toBe(destinations.attendanceChatId);
  });

  it('a full day of all three reports never mixes destinations, and logs record the correct group', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();
    const date = '2026-07-25';

    await send(client, store, 'attendance_morning', date);
    await send(client, store, 'attendance_afternoon', date);
    await send(client, store, 'inventory', date);

    expect(client.sent).toHaveLength(3);
    const attendanceMsgs = client.sent.filter((m) => m.chatId === destinations.attendanceChatId);
    const inventoryMsgs = client.sent.filter((m) => m.chatId === destinations.inventoryChatId);
    expect(attendanceMsgs).toHaveLength(2);
    expect(inventoryMsgs).toHaveLength(1);

    // Report logs record which destination was actually used.
    const byType = (t: string) => store.entries.find((e) => e.reportType === t);
    expect(byType('attendance_morning')?.destinationGroup).toBe('attendance');
    expect(byType('attendance_afternoon')?.destinationGroup).toBe('attendance');
    expect(byType('inventory')?.destinationGroup).toBe('inventory');
    expect(byType('attendance_morning')?.chatId).toBe(destinations.attendanceChatId);
    expect(byType('inventory')?.chatId).toBe(destinations.inventoryChatId);
  });

  it('an unconfigured Inventory Group blocks only inventory, attendance still sends', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();
    const partial: TelegramDestinations = { ...destinations, inventoryChatId: null };
    const date = '2026-07-25';

    const attendance = await sendReportOnce(client, store, {
      reportKey: `attendance_morning:${date}`,
      reportType: 'attendance_morning',
      businessDate: date,
      chatId: destinationChatId('attendance_morning', partial),
      destinationGroup: reportGroup('attendance_morning'),
      text: 'morning body',
    });
    const inventory = await sendReportOnce(client, store, {
      reportKey: `inventory:${date}`,
      reportType: 'inventory',
      businessDate: date,
      chatId: destinationChatId('inventory', partial),
      destinationGroup: reportGroup('inventory'),
      text: 'inventory body',
    });

    expect(attendance.status).toBe('sent');
    expect(inventory.status).toBe('no_chat');
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0]?.chatId).toBe(destinations.attendanceChatId);
  });

  it('a disabled Attendance Group blocks only attendance, inventory still sends', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();
    const partial: TelegramDestinations = { ...destinations, attendanceGroupEnabled: false };
    const date = '2026-07-25';

    const morning = await sendReportOnce(client, store, {
      reportKey: `attendance_morning:${date}`,
      reportType: 'attendance_morning',
      businessDate: date,
      chatId: destinationChatId('attendance_morning', partial),
      destinationGroup: reportGroup('attendance_morning'),
      text: 'morning body',
    });
    const inventory = await sendReportOnce(client, store, {
      reportKey: `inventory:${date}`,
      reportType: 'inventory',
      businessDate: date,
      chatId: destinationChatId('inventory', partial),
      destinationGroup: reportGroup('inventory'),
      text: 'inventory body',
    });

    expect(morning.status).toBe('no_chat');
    expect(inventory.status).toBe('sent');
    expect(client.sent).toHaveLength(1);
    expect(client.sent[0]?.chatId).toBe(destinations.inventoryChatId);
  });
});
