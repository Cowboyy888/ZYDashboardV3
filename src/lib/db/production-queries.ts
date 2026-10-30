import 'server-only';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type {
  ProductionOrderRow,
  ProductionReference,
  ProductionReferenceKind,
} from '@/lib/domain/production-orders';

export const PRODUCTION_COLUMNS =
  'id,order_number,business_date,sales_order_item_id,sales_order_id,sales_order_number,customer_reference,internal_reason,sku_id,sku_label,drawing_id,geometry,planned_quantity,required_date,priority,planned_line,supervisor_id,supervisor_name,notes,attachment_path,status,held_from_status,status_reason,approved_by,approved_at,created_by,updated_by,version,created_at,updated_at';

export async function getProductionOrders(page: number, status = '') {
  const db = await createSupabaseServerClient();
  let query = db.from('production_orders').select(PRODUCTION_COLUMNS, { count: 'exact' });
  if (status) query = query.eq('status', status);
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range((page - 1) * 20, page * 20 - 1);
  if (error) throw error;
  return { rows: (data ?? []) as ProductionOrderRow[], total: count ?? 0 };
}

export async function getProductionOrder(id: string) {
  const db = await createSupabaseServerClient();
  const { data, error } = await db
    .from('production_orders')
    .select(PRODUCTION_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data as ProductionOrderRow | null;
}

export async function getProductionReferences(
  kind: ProductionReferenceKind,
  search = '',
  selected?: string,
) {
  const db = await createSupabaseServerClient();
  const { data, error } = await db.rpc('production_reference_options', {
    p_kind: kind,
    p_search: search,
    p_selected: selected ?? null,
  });
  if (error) throw error;
  return (data ?? []) as ProductionReference[];
}
