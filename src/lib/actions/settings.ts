'use server';
import { z } from 'zod';
import { revalidatePath } from 'next/cache';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { assertPermission } from '@/lib/auth';
import { writeAudit } from '@/lib/audit';
import { getCurrentUser } from '@/lib/auth';
import { ROLES } from '@/lib/domain/rbac';
import {
  attendanceGroupSchema,
  locationSchema,
  productFamilySchema,
  productFamilyUpdateSchema,
  skuSchema,
  skuUpdateSchema,
} from '@/lib/validation/schemas';
import { canDeleteFamily, type FamilyUsage } from '@/lib/domain/products';
import { fail, ok, zodFieldErrors, type ActionState } from './types';

type ServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;

// --- Locations ---------------------------------------------------------------

export async function createLocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('locations:manage');
  const parsed = locationSchema.safeParse({
    name: formData.get('name'),
    code: formData.get('code'),
    isActive: true,
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('locations')
    .insert({ name: parsed.data.name, code: parsed.data.code, is_active: true })
    .select('id')
    .single();
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'location.create',
    entity: 'locations',
    entityId: data.id,
    newValue: parsed.data,
  });
  revalidatePath('/settings/locations');
  return ok('Location added');
}

export async function updateLocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('locations:manage');
  const id = String(formData.get('id') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!id || !name) return fail('Name is required');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('locations').update({ name }).eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'location.rename',
    entity: 'locations',
    entityId: id,
    newValue: { name },
  });
  revalidatePath('/settings/locations');
  return ok('Location updated');
}

export async function toggleLocation(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('locations:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('locations').update({ is_active: !isActive }).eq('id', id);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'location.archive' : 'location.activate',
    entity: 'locations',
    entityId: id,
  });
  revalidatePath('/settings/locations');
  return ok(isActive ? 'Location archived' : 'Location activated');
}

// --- Product families --------------------------------------------------------
// Only Owner / System Admin may manage families (enforced by both the
// `products:manage` permission and the families_write RLS policy). Every action
// writes an audit record. A family with any history (specs, stock movements,
// production, purchases, sales) can never be hard-deleted — only archived.

/** Generate a unique internal slug code from the family name (users never type it). */
function familyCodeFromName(name: string): string {
  const ascii = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const rand = Math.random().toString(36).slice(2, 8);
  return (ascii ? `${ascii}_${rand}` : `pf_${rand}`).slice(0, 32);
}

/** Count history referencing a family — used to decide safe delete vs. archive. */
async function familyUsage(supabase: ServerClient, familyId: string): Promise<FamilyUsage> {
  // Preferred path: the SECURITY DEFINER helper (also covers Phase 2 tables).
  const { data, error } = await supabase.rpc('product_family_usage', { p_family: familyId });
  const row = Array.isArray(data) ? data[0] : data;
  if (!error && row) {
    return {
      specs: Number(row.spec_count ?? 0),
      movements: Number(row.movement_count ?? 0),
      production: Number(row.production_count ?? 0),
      purchases: Number(row.purchase_count ?? 0),
      sales: Number(row.sales_count ?? 0),
    };
  }
  // Fallback: count directly (skus + movements) if the RPC is unavailable.
  const { data: skuRows } = await supabase.from('skus').select('id').eq('family_id', familyId);
  const skuIds = (skuRows ?? []).map((s) => s.id);
  let movements = 0;
  let production = 0;
  if (skuIds.length > 0) {
    const mv = await supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .in('sku_id', skuIds);
    movements = mv.count ?? 0;
    const pr = await supabase
      .from('stock_movements')
      .select('id', { count: 'exact', head: true })
      .in('sku_id', skuIds)
      .eq('type', 'production_output');
    production = pr.count ?? 0;
  }
  return { specs: skuIds.length, movements, production, purchases: 0, sales: 0 };
}

export async function createFamily(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('products:manage');
  const parsed = productFamilySchema.safeParse({
    name: formData.get('name'),
    nameEnglish: formData.get('nameEnglish'),
    defaultUnit: formData.get('defaultUnit'),
    description: formData.get('description'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  let lastError: { code?: string; message: string } | null = null;
  // Insert with a generated code; retry once on the (extremely unlikely) clash.
  for (let attempt = 0; attempt < 2; attempt++) {
    const code = familyCodeFromName(d.name);
    const { data, error } = await supabase
      .from('product_families')
      .insert({
        code,
        name: d.name,
        name_english: d.nameEnglish ?? null,
        default_unit: d.defaultUnit ?? '张',
        description: d.description ?? null,
        is_active: true,
      })
      .select('id')
      .single();
    if (!error) {
      await writeAudit(user, {
        action: 'family.create',
        entity: 'product_families',
        entityId: data.id,
        newValue: { ...d, code },
      });
      revalidatePath('/settings/products');
      return ok('Product family added');
    }
    lastError = error;
    if (error.code !== '23505') break; // only a code clash is worth retrying
  }
  return fail(lastError?.message ?? 'Could not create product family');
}

export async function updateFamily(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('products:manage');
  const parsed = productFamilyUpdateSchema.safeParse({
    id: formData.get('id'),
    name: formData.get('name'),
    nameEnglish: formData.get('nameEnglish'),
    defaultUnit: formData.get('defaultUnit'),
    description: formData.get('description'),
  });
  if (!parsed.success)
    return fail('Please check the highlighted fields', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('product_families')
    .update({
      name: d.name,
      name_english: d.nameEnglish ?? null,
      default_unit: d.defaultUnit ?? '张',
      description: d.description ?? null,
    })
    .eq('id', d.id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: 'family.update',
    entity: 'product_families',
    entityId: d.id,
    newValue: d,
  });
  revalidatePath('/settings/products');
  return ok('Product family updated');
}

export async function toggleFamily(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('products:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  if (!id) return fail('Missing family');

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('product_families')
    .update({ is_active: !isActive })
    .eq('id', id);
  if (error) return fail(error.message);

  await writeAudit(user, {
    action: isActive ? 'family.archive' : 'family.activate',
    entity: 'product_families',
    entityId: id,
  });
  revalidatePath('/settings/products');
  return ok(isActive ? 'Product family archived' : 'Product family reactivated');
}

export async function deleteFamily(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('products:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing family');

  const supabase = await createSupabaseServerClient();
  const { data: fam } = await supabase
    .from('product_families')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (!fam) return fail('Family not found');

  // Safe delete: only when the family has NO history of any kind.
  const usage = await familyUsage(supabase, id);
  if (!canDeleteFamily(usage)) {
    return fail('Cannot delete: this product family has records. Archive it instead.');
  }

  const { error } = await supabase.from('product_families').delete().eq('id', id);
  if (error) {
    // Backstop for the FK on_delete restrict guard — treat as "has history".
    if (error.code === '23503')
      return fail('Cannot delete: this product family has records. Archive it instead.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'family.delete',
    entity: 'product_families',
    entityId: id,
    oldValue: fam,
  });
  revalidatePath('/settings/products');
  return ok('Product family deleted');
}

// --- SKUs / specifications ---------------------------------------------------

export async function createSku(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('products:manage');
  const parsed = skuSchema.safeParse({
    familyId: formData.get('familyId'),
    diameter: formData.get('diameter'),
    size: formData.get('size'),
    hole: formData.get('hole'),
    rodCount: formData.get('rodCount'),
    extra: formData.get('extra'),
    condition: formData.get('condition'),
    unit: formData.get('unit'),
    minimumLevel: formData.get('minimumLevel') ?? 0,
    isActive: true,
    notes: formData.get('notes'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from('skus')
    .insert({
      family_id: d.familyId,
      diameter: d.diameter ?? null,
      size: d.size ?? null,
      hole: d.hole ?? null,
      rod_count: d.rodCount ?? null,
      extra: d.extra ?? null,
      condition: d.condition,
      unit: d.unit,
      minimum_level: d.minimumLevel,
      is_active: true,
      notes: d.notes ?? null,
    })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return fail('A SKU with these exact attributes already exists.');
    return fail(error.message);
  }

  await writeAudit(user, { action: 'sku.create', entity: 'skus', entityId: data.id, newValue: d });
  revalidatePath('/settings/products');
  revalidatePath('/inventory');
  return ok('Specification added');
}

export async function updateSku(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('products:manage');
  const parsed = skuUpdateSchema.safeParse({
    id: formData.get('id'),
    familyId: formData.get('familyId'),
    diameter: formData.get('diameter'),
    size: formData.get('size'),
    hole: formData.get('hole'),
    rodCount: formData.get('rodCount'),
    extra: formData.get('extra'),
    condition: formData.get('condition'),
    unit: formData.get('unit'),
    isActive: true,
    notes: formData.get('notes'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase.from('skus').select('*').eq('id', d.id).maybeSingle();
  if (!existing) return fail('Specification not found');

  // minimum_level is intentionally NOT part of this form/action — it stays
  // whatever it already was (set via Settings → Products) so editing other
  // fields here can never silently reset it.
  const { error } = await supabase
    .from('skus')
    .update({
      family_id: d.familyId,
      diameter: d.diameter ?? null,
      size: d.size ?? null,
      hole: d.hole ?? null,
      rod_count: d.rodCount ?? null,
      extra: d.extra ?? null,
      condition: d.condition,
      unit: d.unit,
      notes: d.notes ?? null,
    })
    .eq('id', d.id);
  if (error) {
    if (error.code === '23505') return fail('A SKU with these exact attributes already exists.');
    return fail(error.message);
  }

  await writeAudit(user, {
    action: 'sku.update',
    entity: 'skus',
    entityId: d.id,
    oldValue: existing,
    newValue: d,
  });
  revalidatePath('/settings/products');
  revalidatePath('/inventory');
  return ok('Specification updated');
}

export async function toggleSku(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('products:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('skus').update({ is_active: !isActive }).eq('id', id);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'sku.archive' : 'sku.activate',
    entity: 'skus',
    entityId: id,
  });
  revalidatePath('/settings/products');
  revalidatePath('/inventory');
  return ok(isActive ? 'Specification archived' : 'Specification activated');
}

/** Safe delete: only when the SKU has NO history (stock movements or purchase orders). */
export async function deleteSku(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const user = await assertPermission('products:manage');
  const id = String(formData.get('id') ?? '');
  if (!id) return fail('Missing specification');

  const supabase = await createSupabaseServerClient();
  const { data: sku } = await supabase.from('skus').select('*').eq('id', id).maybeSingle();
  if (!sku) return fail('Specification not found');

  const [movements, poItems] = await Promise.all([
    supabase.from('stock_movements').select('id', { count: 'exact', head: true }).eq('sku_id', id),
    supabase
      .from('purchase_order_items')
      .select('id', { count: 'exact', head: true })
      .eq('sku_id', id),
  ]);
  if ((movements.count ?? 0) > 0 || (poItems.count ?? 0) > 0) {
    return fail('Cannot delete: this specification has records. Archive it instead.');
  }

  const { error } = await supabase.from('skus').delete().eq('id', id);
  if (error) {
    // Backstop for the FK on_delete restrict guard — treat as "has history".
    if (error.code === '23503')
      return fail('Cannot delete: this specification has records. Archive it instead.');
    return fail(error.message);
  }

  await writeAudit(user, { action: 'sku.delete', entity: 'skus', entityId: id, oldValue: sku });
  revalidatePath('/settings/products');
  revalidatePath('/inventory');
  return ok('Specification deleted');
}

// --- Users / roles -----------------------------------------------------------

export async function updateUserRole(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const actor = await assertPermission('users:manage');
  const userId = String(formData.get('userId') ?? '');
  const role = String(formData.get('role') ?? '');
  if (!userId || !role) return fail('User and role are required');

  // Prevent self-lockout: an Owner cannot demote themselves.
  const me = await getCurrentUser();
  if (me && me.id === userId && me.role === 'owner' && role !== 'owner') {
    return fail('An Owner cannot demote their own account.');
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from('profiles').update({ role }).eq('id', userId);
  if (error) return fail(error.message);
  await writeAudit(actor, {
    action: 'user.role_change',
    entity: 'profiles',
    entityId: userId,
    newValue: { role },
  });
  revalidatePath('/settings/users');
  return ok('Role updated');
}

const newUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'At least 8 characters'),
  fullName: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length ? v : undefined)),
  role: z.enum(ROLES),
});

/**
 * Create a new user (the "approved admin action" that adds accounts once the
 * Owner exists and public signup is disabled). Owner / System Admin only.
 */
export async function createUserByAdmin(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const actor = await assertPermission('users:manage');
  const parsed = newUserSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    fullName: formData.get('fullName'),
    role: formData.get('role'),
  });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));
  const d = parsed.data;

  let admin;
  try {
    admin = createSupabaseAdminClient();
  } catch {
    return fail('Server is not configured. Set SUPABASE_SERVICE_ROLE_KEY in .env.local.');
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: d.email,
    password: d.password,
    email_confirm: true,
    user_metadata: { full_name: d.fullName ?? '' },
  });
  if (error) {
    if (/registered|exists/i.test(error.message)) return fail('That email is already registered.');
    return fail(error.message);
  }
  if (!data.user) return fail('User creation returned no user.');

  // The signup trigger created the profile (as viewer since an Owner exists);
  // apply the chosen role + name.
  await admin
    .from('profiles')
    .update({ role: d.role, full_name: d.fullName ?? '' })
    .eq('id', data.user.id);

  await writeAudit(actor, {
    action: 'user.create',
    entity: 'profiles',
    entityId: data.user.id,
    newValue: { email: d.email, role: d.role },
  });
  revalidatePath('/settings/users');
  return ok('User created');
}

// --- Attendance groups -------------------------------------------------------

export async function createAttendanceGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const parsed = attendanceGroupSchema.safeParse({ name: formData.get('name') });
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  // Place new group at the end.
  const { data: last } = await supabase
    .from('attendance_groups')
    .select('sort_order')
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? 0) + 1;

  const { data, error } = await supabase
    .from('attendance_groups')
    .insert({ name: parsed.data.name, sort_order: nextOrder, is_active: true })
    .select('id')
    .single();
  if (error) {
    if (error.code === '23505') return fail('A group with this name already exists.');
    return fail(error.message);
  }
  await writeAudit(user, {
    action: 'attendance_group.create',
    entity: 'attendance_groups',
    entityId: data.id,
    newValue: parsed.data,
  });
  revalidatePath('/settings/attendance-groups');
  return ok('Group added');
}

export async function renameAttendanceGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const id = String(formData.get('id') ?? '');
  const parsed = attendanceGroupSchema.safeParse({ name: formData.get('name') });
  if (!id) return fail('Missing group');
  if (!parsed.success) return fail('Validation failed', zodFieldErrors(parsed.error.issues));

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('attendance_groups')
    .update({ name: parsed.data.name })
    .eq('id', id);
  if (error) {
    if (error.code === '23505') return fail('A group with this name already exists.');
    return fail(error.message);
  }
  await writeAudit(user, {
    action: 'attendance_group.rename',
    entity: 'attendance_groups',
    entityId: id,
    newValue: parsed.data,
  });
  revalidatePath('/settings/attendance-groups');
  return ok('Group renamed');
}

export async function toggleAttendanceGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const user = await assertPermission('settings:manage');
  const id = String(formData.get('id') ?? '');
  const isActive = String(formData.get('isActive')) === 'true';
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from('attendance_groups')
    .update({ is_active: !isActive })
    .eq('id', id);
  if (error) return fail(error.message);
  await writeAudit(user, {
    action: isActive ? 'attendance_group.archive' : 'attendance_group.activate',
    entity: 'attendance_groups',
    entityId: id,
  });
  revalidatePath('/settings/attendance-groups');
  return ok(isActive ? 'Group archived' : 'Group reactivated');
}

/** Move a group up or down by swapping sort_order with its neighbour. */
export async function reorderAttendanceGroup(
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await assertPermission('settings:manage');
  const id = String(formData.get('id') ?? '');
  const direction = String(formData.get('direction') ?? '');
  if (!id || (direction !== 'up' && direction !== 'down')) return fail('Invalid reorder request');

  const supabase = await createSupabaseServerClient();
  const { data: groups } = await supabase
    .from('attendance_groups')
    .select('id, sort_order, is_active')
    .order('sort_order');
  const list = (groups ?? []) as { id: string; sort_order: number; is_active: boolean }[];
  const index = list.findIndex((g) => g.id === id);
  if (index === -1) return fail('Group not found');
  const swapWith = direction === 'up' ? index - 1 : index + 1;
  if (swapWith < 0 || swapWith >= list.length) return ok('Already at the edge');

  const a = list[index]!;
  const b = list[swapWith]!;
  await supabase.from('attendance_groups').update({ sort_order: b.sort_order }).eq('id', a.id);
  await supabase.from('attendance_groups').update({ sort_order: a.sort_order }).eq('id', b.id);

  revalidatePath('/settings/attendance-groups');
  return ok('Order updated');
}
