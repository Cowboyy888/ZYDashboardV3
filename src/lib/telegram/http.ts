import type { SendResult, TelegramClient } from './types';

/**
 * Real Telegram Bot API client. The token stays server-side; it is never sent
 * to or exposed in the browser. Uses global fetch (Node 20+ / edge).
 */
export class HttpTelegramClient implements TelegramClient {
  readonly name = 'http';
  constructor(private readonly token: string) {}

  async sendMessage(chatId: string, text: string): Promise<SendResult> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
      });
      const data = (await res.json()) as {
        ok: boolean;
        result?: { message_id: number };
        description?: string;
      };
      if (!data.ok) return { ok: false, error: data.description ?? `HTTP ${res.status}` };
      return { ok: true, messageId: data.result?.message_id };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Network error' };
    }
  }
}
