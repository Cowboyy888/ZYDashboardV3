import { describe, it, expect } from 'vitest';
import {
  ROLES,
  hasPermission,
  canViewSensitiveEmployeeData,
  canOverrideNegativeStock,
  canApprovePayroll,
  type Role,
} from '@/lib/domain/rbac';

describe('acceptance #10 — unauthorized users cannot access salary / private photos', () => {
  it('only Owner, System Admin and Payroll Admin can view sensitive employee data', () => {
    const allowed: Role[] = ['owner', 'system_admin', 'payroll_admin'];
    for (const role of ROLES) {
      expect(canViewSensitiveEmployeeData(role)).toBe(allowed.includes(role));
    }
  });

  it('attendance/warehouse/sales/viewer roles are denied sensitive employee data', () => {
    for (const role of ['attendance_admin', 'warehouse_admin', 'sales_admin', 'viewer'] as Role[]) {
      expect(hasPermission(role, 'employee_sensitive:view')).toBe(false);
    }
  });
});

describe('role permission matrix', () => {
  it('owner holds every permission', () => {
    expect(hasPermission('owner', 'payroll:approve')).toBe(true);
    expect(hasPermission('owner', 'stock:override_negative')).toBe(true);
    expect(hasPermission('owner', 'telegram:manage')).toBe(true);
  });

  it('only owner can override negative stock and approve payroll', () => {
    for (const role of ROLES) {
      expect(canOverrideNegativeStock(role)).toBe(role === 'owner');
      expect(canApprovePayroll(role)).toBe(role === 'owner');
    }
  });

  it('warehouse admin can post stock movements but not manage users', () => {
    expect(hasPermission('warehouse_admin', 'stock:production')).toBe(true);
    expect(hasPermission('warehouse_admin', 'stock:transfer')).toBe(true);
    expect(hasPermission('warehouse_admin', 'users:manage')).toBe(false);
  });

  it('attendance admin can manage attendance but not inventory', () => {
    expect(hasPermission('attendance_admin', 'attendance:manage')).toBe(true);
    expect(hasPermission('attendance_admin', 'stock:out')).toBe(false);
  });

  it('viewer is read-only', () => {
    expect(hasPermission('viewer', 'dashboard:view')).toBe(true);
    expect(hasPermission('viewer', 'attendance:manage')).toBe(false);
    expect(hasPermission('viewer', 'products:manage')).toBe(false);
  });

  it('only Owner and System Admin can edit the Telegram report schedule', () => {
    expect(hasPermission('owner', 'telegram:manage')).toBe(true);
    expect(hasPermission('system_admin', 'telegram:manage')).toBe(true);
    for (const role of [
      'attendance_admin',
      'warehouse_admin',
      'sales_admin',
      'payroll_admin',
      'viewer',
    ] as Role[]) {
      expect(hasPermission(role, 'telegram:manage')).toBe(false);
    }
  });

  it('attendance/warehouse admins can still send reports, just not edit the schedule', () => {
    expect(hasPermission('attendance_admin', 'telegram:send')).toBe(true);
    expect(hasPermission('attendance_admin', 'telegram:manage')).toBe(false);
    expect(hasPermission('warehouse_admin', 'telegram:send')).toBe(true);
    expect(hasPermission('warehouse_admin', 'telegram:manage')).toBe(false);
  });

  it('only Owner and System Admin can edit the company VAT/invoice configuration', () => {
    expect(hasPermission('owner', 'invoice:manage')).toBe(true);
    expect(hasPermission('system_admin', 'invoice:manage')).toBe(true);
    for (const role of [
      'attendance_admin',
      'warehouse_admin',
      'sales_admin',
      'payroll_admin',
      'viewer',
    ] as Role[]) {
      expect(hasPermission(role, 'invoice:manage')).toBe(false);
    }
  });
});

describe('acceptance — purchase order costs visible only to Owner/System Admin/Warehouse Admin', () => {
  it('only those three roles hold purchasing:view (and therefore ever see cost fields)', () => {
    const allowed: Role[] = ['owner', 'system_admin', 'warehouse_admin'];
    for (const role of ROLES) {
      expect(hasPermission(role, 'purchasing:view')).toBe(allowed.includes(role));
    }
  });

  it('only Owner and Warehouse Admin can create/issue/receive purchase orders; System Admin is view-only', () => {
    expect(hasPermission('owner', 'purchasing:manage')).toBe(true);
    expect(hasPermission('warehouse_admin', 'purchasing:manage')).toBe(true);
    expect(hasPermission('system_admin', 'purchasing:view')).toBe(true);
    expect(hasPermission('system_admin', 'purchasing:manage')).toBe(false);
  });

  it('attendance/sales/payroll/viewer have no purchasing access at all', () => {
    for (const role of ['attendance_admin', 'sales_admin', 'payroll_admin', 'viewer'] as Role[]) {
      expect(hasPermission(role, 'purchasing:view')).toBe(false);
      expect(hasPermission(role, 'purchasing:manage')).toBe(false);
    }
  });
});

describe('acceptance — sales order prices visible only to Owner/System Admin/Sales Admin', () => {
  it('only those three roles hold sales:view (and therefore ever see price fields)', () => {
    const allowed: Role[] = ['owner', 'system_admin', 'sales_admin'];
    for (const role of ROLES) {
      expect(hasPermission(role, 'sales:view')).toBe(allowed.includes(role));
    }
  });

  it('only Owner and Sales Admin can create/confirm/deliver sales orders; System Admin is view-only', () => {
    expect(hasPermission('owner', 'sales:manage')).toBe(true);
    expect(hasPermission('sales_admin', 'sales:manage')).toBe(true);
    expect(hasPermission('system_admin', 'sales:view')).toBe(true);
    expect(hasPermission('system_admin', 'sales:manage')).toBe(false);
  });

  it('attendance/warehouse/payroll/viewer have no sales access at all', () => {
    for (const role of [
      'attendance_admin',
      'warehouse_admin',
      'payroll_admin',
      'viewer',
    ] as Role[]) {
      expect(hasPermission(role, 'sales:view')).toBe(false);
      expect(hasPermission(role, 'sales:manage')).toBe(false);
    }
  });
});

describe('acceptance — payroll figures visible only to Owner/System Admin/Payroll Admin', () => {
  it('only those three roles hold payroll:view (and therefore ever see salary figures)', () => {
    const allowed: Role[] = ['owner', 'system_admin', 'payroll_admin'];
    for (const role of ROLES) {
      expect(hasPermission(role, 'payroll:view')).toBe(allowed.includes(role));
    }
  });

  it('Payroll Admin can generate/manage runs but only Owner can approve; System Admin is view-only', () => {
    expect(hasPermission('owner', 'payroll:manage')).toBe(true);
    expect(hasPermission('payroll_admin', 'payroll:manage')).toBe(true);
    expect(hasPermission('system_admin', 'payroll:view')).toBe(true);
    expect(hasPermission('system_admin', 'payroll:manage')).toBe(false);

    // payroll:approve is granted to no role in the table — only Owner, via
    // the sentinel in hasPermission() — matching canApprovePayroll().
    expect(hasPermission('owner', 'payroll:approve')).toBe(true);
    for (const role of ROLES) {
      if (role === 'owner') continue;
      expect(hasPermission(role, 'payroll:approve')).toBe(false);
    }
  });

  it('attendance/warehouse/sales/viewer have no payroll access at all', () => {
    for (const role of ['attendance_admin', 'warehouse_admin', 'sales_admin', 'viewer'] as Role[]) {
      expect(hasPermission(role, 'payroll:view')).toBe(false);
      expect(hasPermission(role, 'payroll:manage')).toBe(false);
    }
  });
});
