import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { CurrentUser } from '@/lib/auth';

export interface AuditEntry {
  action: string; // e.g. "employee.update", "stock.transfer"
  entity: string; // table/domain name, e.g. "employees"
  entityId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
}

/**
 * Append an immutable audit record. The audit_log table is insert-only (no
 * UPDATE/DELETE granted, enforced by RLS) so the trail is tamper-evident.
 * Failures here are logged but never block the primary operation.
 */
export async function writeAudit(actor: CurrentUser | null, entry: AuditEntry): Promise<void> {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.from('audit_log').insert({
      actor_id: actor?.id ?? null,
      actor_email: actor?.email ?? null,
      action: entry.action,
      entity: entry.entity,
      entity_id: entry.entityId ?? null,
      old_value: entry.oldValue ?? null,
      new_value: entry.newValue ?? null,
    });
  } catch (err) {
    console.error('[audit] failed to write audit entry', entry.action, err);
  }
}
