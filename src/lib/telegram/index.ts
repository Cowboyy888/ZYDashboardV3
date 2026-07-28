import { env } from '@/lib/env';
import type { TelegramClient } from './types';
import { MockTelegramClient } from './mock';
import { HttpTelegramClient } from './http';

export type {
  TelegramClient,
  SendResult,
  SentReportStore,
  TelegramDestinationGroup,
} from './types';
export { MockTelegramClient, InMemorySentReportStore } from './mock';
export { HttpTelegramClient } from './http';
export { sendReportOnce } from './report-sender';
export type { SendReportParams, SendReportOutcome } from './report-sender';

/**
 * Select the Telegram client from the environment:
 *   - TELEGRAM_ADAPTER=mock (or no token)  -> MockTelegramClient
 *   - TELEGRAM_ADAPTER=http with a token    -> HttpTelegramClient
 */
export function getTelegramClient(): TelegramClient {
  const token = env.telegramBotToken();
  const adapter = env.telegramAdapter();
  if (adapter === 'http' && token) {
    return new HttpTelegramClient(token);
  }
  return new MockTelegramClient();
}
