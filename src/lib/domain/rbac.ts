/**
 * Role-based access control.
 *
 * This is the single source of truth for who can do what. It is intentionally
 * pure (no I/O) so it can be unit-tested and reused by:
 *   - the Next.js middleware / server actions (application layer), and
 *   - Postgres RLS policies (which mirror these rules — see supabase/migrations).
 *
 * Sensitive employee data (salary/pay fields, private photos, documents) is
 * restricted to Owner, System Admin, and Payroll Admin per the spec.
 */

export const ROLES = [
  'owner',
  'system_admin',
  'attendance_admin',
  'warehouse_admin',
  'sales_admin',
  'payroll_admin',
  'viewer',
] as const;

export type Role = (typeof ROLES)[number];

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

export const ROLE_LABELS: Record<Role, { en: string; zh: string }> = {
  owner: { en: 'Owner', zh: '老板' },
  system_admin: { en: 'System Admin', zh: '系统管理员' },
  attendance_admin: { en: 'Attendance Admin', zh: '考勤管理员' },
  warehouse_admin: { en: 'Warehouse Admin', zh: '仓库管理员' },
  sales_admin: { en: 'Sales Admin', zh: '销售管理员' },
  payroll_admin: { en: 'Payroll Admin', zh: '工资管理员' },
  viewer: { en: 'Viewer', zh: '查看者' },
};

/** All permissions in the system: `${resource}:${action}`. */
export type Permission =
  | 'dashboard:view'
  | 'reports:view'
  | 'settings:view'
  | 'settings:manage'
  | 'users:manage'
  | 'telegram:manage'
  | 'telegram:send'
  | 'audit:view'
  | 'employees:view'
  | 'employees:manage'
  | 'employee_sensitive:view' // salary + private photos + documents
  | 'attendance:view'
  | 'attendance:manage'
  | 'products:view'
  | 'products:manage'
  | 'locations:manage'
  | 'inventory:view'
  | 'stock:opening'
  | 'stock:production'
  | 'stock:out'
  | 'stock:adjust'
  | 'stock:transfer'
  | 'stock:override_negative'
  | 'purchasing:view'
  | 'purchasing:manage'
  | 'sales:view'
  | 'sales:manage'
  | 'inquiries:view'
  | 'inquiries:manage'
  | 'payroll:view'
  | 'payroll:manage'
  | 'payroll:approve';

const EVERYONE: Permission[] = ['dashboard:view', 'reports:view'];

/**
 * Explicit permission grants per role. Owner is handled specially (all perms).
 * Keeping this a data table (rather than code) makes the policy auditable.
 */
const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  owner: [], // sentinel — owner is granted everything (see hasPermission)
  system_admin: [
    ...EVERYONE,
    'settings:view',
    'settings:manage',
    'users:manage',
    'telegram:manage',
    'telegram:send',
    'audit:view',
    'employees:view',
    'employees:manage',
    'employee_sensitive:view',
    'attendance:view',
    'products:view',
    'products:manage',
    'locations:manage',
    'inventory:view',
    'purchasing:view',
    'sales:view',
    'inquiries:view',
    'inquiries:manage',
    'payroll:view',
  ],
  attendance_admin: [
    ...EVERYONE,
    'employees:view',
    'attendance:view',
    'attendance:manage',
    'telegram:send',
  ],
  warehouse_admin: [
    ...EVERYONE,
    'products:view',
    'inventory:view',
    'stock:opening',
    'stock:production',
    'stock:out',
    'stock:adjust',
    'stock:transfer',
    'purchasing:view',
    'purchasing:manage',
    'telegram:send',
  ],
  sales_admin: [
    ...EVERYONE,
    'products:view',
    'inventory:view',
    'sales:view',
    'sales:manage',
    'inquiries:view',
    'inquiries:manage',
  ],
  payroll_admin: [
    ...EVERYONE,
    'employees:view',
    'employee_sensitive:view',
    'attendance:view',
    'payroll:view',
    'payroll:manage',
  ],
  viewer: [...EVERYONE, 'employees:view', 'attendance:view', 'inventory:view'],
};

/** Does `role` hold `permission`? Owner holds everything. */
export function hasPermission(role: Role, permission: Permission): boolean {
  if (role === 'owner') return true;
  return ROLE_PERMISSIONS[role].includes(permission);
}

/** Convenience: any of the given permissions. */
export function hasAnyPermission(role: Role, permissions: Permission[]): boolean {
  return permissions.some((p) => hasPermission(role, p));
}

/**
 * Sensitive employee data = salary/pay fields, private photos, documents.
 * Restricted to Owner, System Admin (where required), and Payroll Admin.
 */
export function canViewSensitiveEmployeeData(role: Role): boolean {
  return hasPermission(role, 'employee_sensitive:view');
}

/** Only the Owner may override the no-negative-stock guard. */
export function canOverrideNegativeStock(role: Role): boolean {
  return hasPermission(role, 'stock:override_negative');
}

/** Approvals (payroll, etc.) require Owner. */
export function canApprovePayroll(role: Role): boolean {
  return hasPermission(role, 'payroll:approve');
}
