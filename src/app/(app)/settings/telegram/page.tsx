import { requirePermission } from '@/lib/auth';
import { getTelegramSettings } from '@/lib/db/queries';
import { env } from '@/lib/env';
import { maskChatId } from '@/lib/domain/telegram-mask';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { PageHeader } from '@/components/page-header';
import { TelegramForm, type TelegramSettingsView } from './telegram-form';

export const dynamic = 'force-dynamic';

export default async function TelegramSettingsPage() {
  await requirePermission('telegram:manage');
  const locale = await getLocale();
  const t = translator(locale);
  const row = await getTelegramSettings();

  // Build a browser-safe view: the raw chat ids never leave the server —
  // only a masked display string and a "configured" flag reach the client.
  const view: TelegramSettingsView = {
    morningEnabled: row?.morning_enabled ?? true,
    afternoonEnabled: row?.afternoon_enabled ?? true,
    inventoryEnabled: row?.inventory_enabled ?? true,
    morningTime: row?.morning_time ?? '08:00',
    afternoonTime: row?.afternoon_time ?? '13:00',
    inventoryTime: row?.inventory_time ?? '18:00',
    reportLanguage: row?.report_language ?? 'zh',
    attendance: {
      configured: !!row?.attendance_chat_id,
      masked: maskChatId(row?.attendance_chat_id),
      groupEnabled: row?.attendance_group_enabled ?? true,
      lastStatus: row?.attendance_last_status ?? null,
      lastError: row?.attendance_last_error ?? null,
      lastSentAt: row?.attendance_last_sent_at ?? null,
    },
    inventory: {
      configured: !!row?.inventory_chat_id,
      masked: maskChatId(row?.inventory_chat_id),
      groupEnabled: row?.inventory_group_enabled ?? true,
      lastStatus: row?.inventory_last_status ?? null,
      lastError: row?.inventory_last_error ?? null,
      lastSentAt: row?.inventory_last_sent_at ?? null,
    },
  };

  return (
    <div>
      <PageHeader title={t('set.telegram')} description={t('tg.desc')} />
      <TelegramForm settings={view} adapter={env.telegramAdapter()} />
    </div>
  );
}
