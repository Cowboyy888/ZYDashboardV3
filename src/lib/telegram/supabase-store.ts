import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import type { SentReportStore } from './types';

/**
 * Durable idempotency store backed by the `sent_reports` table. The unique
 * constraint on `report_key` is the ultimate guard against duplicate sends even
 * under concurrent job runs.
 */
export class SupabaseSentReportStore implements SentReportStore {
  private supabase = createSupabaseAdminClient();

  async has(reportKey: string): Promise<boolean> {
    const { data } = await this.supabase
      .from('sent_reports')
      .select('id')
      .eq('report_key', reportKey)
      .eq('status', 'sent')
      .maybeSingle();
    return !!data;
  }

  async record(entry: Parameters<SentReportStore['record']>[0]): Promise<void> {
    await this.supabase.from('sent_reports').insert({
      report_key: entry.reportKey,
      report_type: entry.reportType,
      business_date: entry.businessDate,
      chat_id: entry.chatId,
      destination_group: entry.destinationGroup,
      status: entry.status,
      detail: entry.detail ?? null,
    });
  }
}
