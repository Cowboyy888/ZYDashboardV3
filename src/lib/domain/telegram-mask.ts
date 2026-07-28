/**
 * Chat id masking — pure, so the exact display string is unit-testable without
 * ever needing a real chat id. The server computes the masked string; the full
 * value must never be serialised into a page/component sent to the browser.
 */

/** Last 4 characters visible (digits of a Telegram chat id are what identify
 * it visually to an admin), everything before replaced with a fixed-width mask. */
export function maskChatId(chatId: string | null | undefined): string | null {
  if (!chatId) return null;
  const visible = chatId.slice(-4);
  return `••••${visible}`;
}
