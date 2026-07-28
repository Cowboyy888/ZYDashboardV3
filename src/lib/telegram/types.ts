/**
 * Telegram integration boundary.
 *
 * All Telegram access goes through the TelegramClient interface so the app can
 * run and be tested with a MockTelegramClient (no network, no token) and swap
 * in the real Bot API in production purely via environment variables.
 */

export interface SendResult {
  ok: boolean;
  messageId?: number;
  error?: string;
}

export interface TelegramClient {
  /** Human-readable adapter name, e.g. "mock" or "http". */
  readonly name: string;
  sendMessage(chatId: string, text: string): Promise<SendResult>;
}

/**
 * Idempotency store for scheduled reports. A report is identified by a stable
 * key (e.g. "attendance:morning:2026-07-24"); once recorded as sent it must not
 * be sent again by a later/duplicate job run.
 */
export type TelegramDestinationGroup = 'attendance' | 'inventory';

export interface SentReportStore {
  has(reportKey: string): Promise<boolean>;
  record(entry: {
    reportKey: string;
    reportType: string;
    businessDate: string;
    chatId: string | null;
    /** Which group this send was routed to — recorded explicitly, never
     * re-derived from reportType at read time. */
    destinationGroup: TelegramDestinationGroup;
    status: 'sent' | 'failed';
    detail?: string | null;
  }): Promise<void>;
}
