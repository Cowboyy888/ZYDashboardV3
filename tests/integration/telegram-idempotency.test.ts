import { describe, it, expect } from 'vitest';
import { MockTelegramClient, InMemorySentReportStore, sendReportOnce } from '@/lib/telegram';

describe('acceptance #8 — scheduled sends do not duplicate a report', () => {
  it('sends once and skips the duplicate run for the same report key', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();
    const params = {
      reportKey: 'attendance:morning:2026-07-24',
      reportType: 'attendance_morning',
      businessDate: '2026-07-24',
      chatId: '-100123',
      destinationGroup: 'attendance' as const,
      text: 'morning report body',
    };

    const first = await sendReportOnce(client, store, params);
    const second = await sendReportOnce(client, store, params);

    expect(first.status).toBe('sent');
    expect(second.status).toBe('skipped');
    expect(client.sent).toHaveLength(1); // only ONE actual send
  });

  it('does not mark a failed send as sent, allowing a later retry to succeed', async () => {
    // A client that fails the first attempt, succeeds the second.
    let attempts = 0;
    const flaky = {
      name: 'flaky',
      async sendMessage(chatId: string, text: string) {
        attempts += 1;
        void chatId;
        void text;
        return attempts === 1
          ? { ok: false as const, error: 'timeout' }
          : { ok: true as const, messageId: 1 };
      },
    };
    const store = new InMemorySentReportStore();
    const params = {
      reportKey: 'inventory:2026-07-24',
      reportType: 'inventory',
      businessDate: '2026-07-24',
      chatId: '-100123',
      destinationGroup: 'inventory' as const,
      text: 'inventory body',
    };

    const first = await sendReportOnce(flaky, store, params);
    const second = await sendReportOnce(flaky, store, params);

    expect(first.status).toBe('failed');
    expect(second.status).toBe('sent');
  });

  it('reports "no_chat" and records nothing when no chat id is configured', async () => {
    const client = new MockTelegramClient();
    const store = new InMemorySentReportStore();
    const outcome = await sendReportOnce(client, store, {
      reportKey: 'inventory:2026-07-25',
      reportType: 'inventory',
      businessDate: '2026-07-25',
      chatId: null,
      destinationGroup: 'inventory',
      text: 'body',
    });
    expect(outcome.status).toBe('no_chat');
    expect(client.sent).toHaveLength(0);
    expect(await store.has('inventory:2026-07-25')).toBe(false);
  });
});
