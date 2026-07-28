import type { SendResult, TelegramClient, SentReportStore } from './types';

/**
 * In-memory Telegram client used by default when no bot token is configured and
 * by the test suite. Records every message instead of hitting the network.
 */
export class MockTelegramClient implements TelegramClient {
  readonly name = 'mock';
  readonly sent: Array<{ chatId: string; text: string; at: Date }> = [];
  private counter = 0;

  async sendMessage(chatId: string, text: string): Promise<SendResult> {
    this.counter += 1;
    this.sent.push({ chatId, text, at: new Date() });
    return { ok: true, messageId: this.counter };
  }
}

/** Simple in-memory idempotency store for tests. */
export class InMemorySentReportStore implements SentReportStore {
  readonly records: string[] = [];
  /** Every recorded entry (sent or failed), for assertions on destination routing. */
  readonly entries: Array<Parameters<SentReportStore['record']>[0]> = [];

  async has(reportKey: string): Promise<boolean> {
    return this.records.includes(reportKey);
  }

  async record(entry: Parameters<SentReportStore['record']>[0]): Promise<void> {
    this.entries.push(entry);
    if (entry.status === 'sent') this.records.push(entry.reportKey);
  }
}
