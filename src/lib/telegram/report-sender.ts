import type {
  SendResult,
  TelegramClient,
  SentReportStore,
  TelegramDestinationGroup,
} from './types';

export interface SendReportParams {
  /** Stable idempotency key, e.g. "attendance:morning:2026-07-24". */
  reportKey: string;
  reportType: string;
  businessDate: string;
  chatId: string | null;
  destinationGroup: TelegramDestinationGroup;
  text: string;
}

export interface SendReportOutcome {
  status: 'sent' | 'skipped' | 'failed' | 'no_chat';
  reportKey: string;
  detail?: string;
  result?: SendResult;
}

/**
 * Send a report AT MOST ONCE. Safe to call from a retried/duplicated cron job:
 *   - if the report key is already recorded as sent -> "skipped"
 *   - if no chat id is configured -> "no_chat" (nothing sent, not recorded)
 *   - otherwise send, record the outcome, and return "sent" / "failed"
 *
 * Failures are NOT recorded as sent, so a later retry can succeed.
 */
export async function sendReportOnce(
  client: TelegramClient,
  store: SentReportStore,
  params: SendReportParams,
): Promise<SendReportOutcome> {
  if (await store.has(params.reportKey)) {
    return { status: 'skipped', reportKey: params.reportKey, detail: 'already sent' };
  }
  if (!params.chatId) {
    return { status: 'no_chat', reportKey: params.reportKey, detail: 'no chat id configured' };
  }

  const result = await client.sendMessage(params.chatId, params.text);

  await store.record({
    reportKey: params.reportKey,
    reportType: params.reportType,
    businessDate: params.businessDate,
    chatId: params.chatId,
    destinationGroup: params.destinationGroup,
    status: result.ok ? 'sent' : 'failed',
    detail: result.error ?? null,
  });

  return {
    status: result.ok ? 'sent' : 'failed',
    reportKey: params.reportKey,
    detail: result.error,
    result,
  };
}
