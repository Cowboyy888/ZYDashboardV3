import { z } from 'zod';
import { CONDITIONS } from '@/lib/domain/products';
import { MOVEMENT_TYPES } from '@/lib/domain/stock-ledger';
import { SHIFTS, ATTENDANCE_STATUSES } from '@/lib/domain/attendance';
import { ROLES } from '@/lib/domain/rbac';
import { CURRENCIES } from '@/lib/domain/purchasing';
import { DEDUCTION_KINDS } from '@/lib/domain/payroll';

/** Reusable primitives. */
const nonEmpty = z.string().trim().min(1, 'Required');
// FormData.get() returns null (not undefined) for a field that isn't present
// in the DOM at all — e.g. quick-action forms that only submit a fixed set of
// hidden inputs. Normalise null -> undefined before the string check so those
// genuinely-optional fields don't fail validation just for being absent.
const optionalText = z.preprocess(
  (v) => (v == null ? undefined : v),
  z
    .string()
    .trim()
    .optional()
    .transform((v) => (v && v.length ? v : undefined)),
);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');
const positiveQty = z.coerce.number().positive('Must be greater than zero');
// Accepts a uuid, or empty/missing (form selects submit '') -> undefined.
const optionalUuid = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.string().uuid().optional(),
);

// --- Master data -------------------------------------------------------------

export const locationSchema = z.object({
  name: nonEmpty.max(80),
  code: nonEmpty
    .max(32)
    .regex(/^[a-z0-9_]+$/i, 'Letters, numbers, underscore only')
    .transform((v) => v.toLowerCase()),
  isActive: z.boolean().default(true),
});
export type LocationInput = z.infer<typeof locationSchema>;

/**
 * Create a product family. Only the Chinese family name is required; the English
 * name, default unit, and description are optional. The internal `code` slug is
 * generated server-side (not entered by the user).
 */
export const productFamilySchema = z.object({
  name: z.string().trim().min(1, 'Chinese name is required').max(80), // e.g. 钢筋网
  nameEnglish: optionalText, // e.g. Rebar mesh
  defaultUnit: optionalText, // 张 / 捆 — defaults to 张 in the action
  description: optionalText,
});
export type ProductFamilyInput = z.infer<typeof productFamilySchema>;

/** Edit an existing product family (same editable fields; code stays fixed). */
export const productFamilyUpdateSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1, 'Chinese name is required').max(80),
  nameEnglish: optionalText,
  defaultUnit: optionalText,
  description: optionalText,
});
export type ProductFamilyUpdateInput = z.infer<typeof productFamilyUpdateSchema>;

export const skuSchema = z.object({
  familyId: z.string().uuid(),
  diameter: optionalText, // 9厘
  size: optionalText, // 3×6
  hole: optionalText, // 20孔
  rodCount: optionalText, // 15根
  extra: optionalText, // free-form (螺纹盘圆)
  condition: z.enum(CONDITIONS),
  unit: nonEmpty.max(16),
  minimumLevel: z.coerce.number().min(0).default(0),
  isActive: z.boolean().default(true),
  notes: optionalText,
});
export type SkuInput = z.infer<typeof skuSchema>;

export const skuUpdateSchema = skuSchema.extend({ id: z.string().uuid() });
export type SkuUpdateInput = z.infer<typeof skuUpdateSchema>;

// --- Stock movements ---------------------------------------------------------

export const movementSchema = z
  .object({
    skuId: z.string().uuid(),
    locationId: z.string().uuid(),
    type: z.enum(MOVEMENT_TYPES),
    businessDate: isoDate,
    /** Positive magnitude for all types except adjustment (signed). */
    quantity: z.coerce.number().refine((n) => n !== 0, 'Quantity cannot be zero'),
    notes: optionalText,
    attachmentPath: optionalText,
    overrideReason: optionalText,
  })
  .refine((v) => v.type === 'adjustment' || v.quantity > 0, {
    message: 'Quantity must be positive for this movement type',
    path: ['quantity'],
  });
export type MovementFormInput = z.infer<typeof movementSchema>;

export const transferSchema = z
  .object({
    skuId: z.string().uuid(),
    fromLocationId: z.string().uuid(),
    toLocationId: z.string().uuid(),
    businessDate: isoDate,
    quantity: positiveQty,
    notes: optionalText,
  })
  .refine((v) => v.fromLocationId !== v.toLocationId, {
    message: 'Source and destination must differ',
    path: ['toLocationId'],
  });
export type TransferFormInput = z.infer<typeof transferSchema>;

/**
 * "Set new total" shortcut — the UI collects a target quantity; the action
 * computes the delta against the current balance and posts it as a normal
 * `adjustment` movement (never an editable stored total).
 */
export const setStockTotalSchema = z.object({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  newTotal: z.coerce.number().min(0, 'Cannot be negative'),
  businessDate: isoDate,
  notes: optionalText,
  overrideReason: optionalText,
});
export type SetStockTotalInput = z.infer<typeof setStockTotalSchema>;

// --- Employees ---------------------------------------------------------------

/**
 * Create-employee input. Only three fields are required — Display name,
 * Attendance group, and Job title. The Employee ID is NOT entered here; it is
 * generated atomically in the database. Every other field is optional.
 * Messages are plain English; the UI localises them (see i18n PHRASES).
 * Pay is always daily (see employees_pay_type_check) — there is no pay-type
 * field here to set.
 */
export const employeeSchema = z.object({
  displayName: z.string().trim().min(1, 'English name is required'),
  attendanceGroupId: z
    .string()
    .min(1, 'Attendance group is required')
    .uuid('Attendance group is required'),
  jobTitle: z.string().trim().min(1, 'Job title is required'),
  label: optionalText,
  // Optional alternate names + details.
  nameKhmer: optionalText,
  nameEnglish: optionalText,
  nameChinese: optionalText,
  phone: optionalText,
  department: optionalText,
  position: optionalText,
  startDate: isoDate.optional(),
  notes: optionalText,
});
export type EmployeeInput = z.infer<typeof employeeSchema>;

/** Editing an existing employee's attendance-group profile fields. */
export const employeeProfileSchema = z.object({
  attendanceGroupId: optionalUuid,
  displayName: optionalText,
  jobTitle: optionalText,
  label: optionalText,
});
export type EmployeeProfileInput = z.infer<typeof employeeProfileSchema>;

/**
 * Edit an existing employee's core HR details. These fields were previously
 * write-once (set at creation, in `employeeSchema`, with no way to correct
 * them afterward) — this covers everything from that set except
 * `displayName`/`jobTitle` (edited via employeeProfileSchema above) and
 * `nameEnglish`/`position` (unused post-creation elsewhere in the app).
 */
export const employeeDetailsSchema = z.object({
  nameKhmer: optionalText,
  nameChinese: optionalText,
  phone: optionalText,
  department: optionalText,
  startDate: isoDate.optional(),
  notes: optionalText,
});
export type EmployeeDetailsInput = z.infer<typeof employeeDetailsSchema>;

// --- Attendance groups -------------------------------------------------------

export const attendanceGroupSchema = z.object({
  name: nonEmpty.max(60),
});
export type AttendanceGroupInput = z.infer<typeof attendanceGroupSchema>;

// --- Attendance --------------------------------------------------------------

export const attendanceEntrySchema = z.object({
  employeeId: z.string().uuid(),
  businessDate: isoDate,
  shift: z.enum(SHIFTS),
  status: z.enum(ATTENDANCE_STATUSES).exclude(['unmarked']),
  notes: optionalText,
});
export type AttendanceEntryInput = z.infer<typeof attendanceEntrySchema>;

export const bulkAttendanceSchema = z.object({
  businessDate: isoDate,
  shift: z.enum(SHIFTS),
  employeeIds: z.array(z.string().uuid()).min(1),
  status: z.enum(ATTENDANCE_STATUSES).exclude(['unmarked']).default('present'),
});
export type BulkAttendanceInput = z.infer<typeof bulkAttendanceSchema>;

// --- Telegram / settings -----------------------------------------------------

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:mm');

// A new chat id to SET. Blank means "leave the stored value unchanged" (the
// form never round-trips the current value, since it must stay masked); use
// the paired *ChatIdClear flag to explicitly remove it instead.
const chatIdText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v && v.length ? v : undefined))
  .refine((v) => v === undefined || /^-?\d+$/.test(v), {
    message: 'Expected a numeric chat ID (e.g. -1001234567890)',
  });

export const telegramSettingsSchema = z.object({
  morningEnabled: z.boolean().default(true),
  afternoonEnabled: z.boolean().default(true),
  inventoryEnabled: z.boolean().default(true),
  // All three report times are editable (Asia/Bangkok). Defaults match the
  // historical fixed schedule but are no longer hard-coded in the scheduler.
  morningTime: hhmm.default('08:00'),
  afternoonTime: hhmm.default('13:00'),
  inventoryTime: hhmm.default('18:00'),
  // Future-ready: the attendance report is currently always sent in Chinese.
  reportLanguage: z.enum(['en', 'zh']).default('zh'),

  // --- Attendance Group destination (morning + afternoon reports) ----------
  attendanceChatId: chatIdText,
  attendanceChatIdClear: z.boolean().default(false),
  attendanceGroupEnabled: z.boolean().default(true),

  // --- Inventory Group destination (daily inventory report) ----------------
  inventoryChatId: chatIdText,
  inventoryChatIdClear: z.boolean().default(false),
  inventoryGroupEnabled: z.boolean().default(true),
});
export type TelegramSettingsInput = z.infer<typeof telegramSettingsSchema>;

// --- Auth / users ------------------------------------------------------------

export const signInSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'At least 8 characters'),
});

export const userRoleSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(ROLES),
});

// --- Purchasing (Second pass) -------------------------------------------------

export const supplierSchema = z.object({
  name: nonEmpty,
  nameChinese: optionalText,
  nameEnglish: optionalText,
  contactPerson: optionalText,
  phone: optionalText,
  address: optionalText,
  taxId: optionalText,
  paymentTerms: optionalText,
  defaultCurrency: z.enum(CURRENCIES).default('USD'),
  notes: optionalText,
});
export type SupplierInput = z.infer<typeof supplierSchema>;

export const supplierUpdateSchema = supplierSchema.extend({ id: z.string().uuid() });

export const createPurchaseOrderSchema = z.object({
  supplierId: z.string().uuid(),
  orderDate: isoDate,
  expectedArrivalDate: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    isoDate.optional(),
  ),
  currency: z.enum(CURRENCIES),
  notes: optionalText,
  attachmentPath: optionalText,
});
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;

// --- Sales (Third pass) --------------------------------------------------------

export const customerSchema = z.object({
  name: nonEmpty,
  nameChinese: optionalText,
  nameEnglish: optionalText,
  contactPerson: optionalText,
  phone: optionalText,
  address: optionalText,
  taxId: optionalText,
  paymentTerms: optionalText,
  defaultCurrency: z.enum(CURRENCIES).default('USD'),
  notes: optionalText,
});
export type CustomerInput = z.infer<typeof customerSchema>;

export const customerUpdateSchema = customerSchema.extend({ id: z.string().uuid() });

const soItemInputSchema = z.object({
  skuId: z.string().uuid(),
  locationId: z.string().uuid(),
  orderedQty: positiveQty,
  unitPrice: z.coerce.number().min(0, 'Unit price cannot be negative'),
});

export const createSalesOrderSchema = z.object({
  customerId: z.string().uuid(),
  orderDate: isoDate,
  expectedDeliveryDate: z.preprocess(
    (v) => (v === '' || v == null ? undefined : v),
    isoDate.optional(),
  ),
  currency: z.enum(CURRENCIES),
  notes: optionalText,
  attachmentPath: optionalText,
  items: z.array(soItemInputSchema).min(1, 'Add at least one line item'),
});
export type CreateSalesOrderInput = z.infer<typeof createSalesOrderSchema>;

export const deliverGoodsSchema = z.object({
  itemId: z.string().uuid(),
  quantity: positiveQty,
  deliveredDate: isoDate,
  batchReference: optionalText,
  notes: optionalText,
  attachmentPath: optionalText,
  overrideReason: optionalText,
});
export type DeliverGoodsInput = z.infer<typeof deliverGoodsSchema>;

// --- Payroll (Fourth pass) -------------------------------------------------------

export const createPayrollRunSchema = z
  .object({
    periodStart: isoDate,
    periodEnd: isoDate,
    payDate: isoDate,
    notes: optionalText,
  })
  .refine((v) => v.periodEnd >= v.periodStart, {
    message: 'Period end must not be before period start',
    path: ['periodEnd'],
  });
export type CreatePayrollRunInput = z.infer<typeof createPayrollRunSchema>;

export const addPayrollLineSchema = z.object({
  itemId: z.string().uuid(),
  kind: z.enum(DEDUCTION_KINDS),
  label: nonEmpty.max(120),
  amount: z.coerce.number().positive('Amount must be greater than zero'),
});
export type AddPayrollLineInput = z.infer<typeof addPayrollLineSchema>;

// --- Customer price inquiries (quotation tracking) -------------------------------

// Empty form fields ('') become undefined before coercion/validation.
const optionalNumber = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  z.coerce.number().optional(),
);
const optionalIsoDate = z.preprocess(
  (v) => (v === '' || v == null ? undefined : v),
  isoDate.optional(),
);

export const INQUIRY_STATUS_CATEGORIES = ['open', 'won', 'lost'] as const;

/** Create/edit an inquiry. Only the customer name is required. */
export const inquirySchema = z.object({
  inquiryDate: optionalIsoDate,
  salespersonId: optionalUuid,
  customerId: optionalUuid,
  customerName: nonEmpty.max(120),
  companyName: optionalText,
  contact: optionalText,
  customerTypeId: optionalUuid,
  familyId: optionalUuid,
  specification: optionalText,
  diameter: optionalText,
  sheetSize: optionalText,
  areaPerSheet: optionalNumber,
  meshOpening: optionalText,
  quantity: optionalNumber,
  deliveryLocation: optionalText,
  factoryCost: optionalNumber,
  quotedPrice: optionalNumber,
  targetPrice: optionalNumber,
  finalPrice: optionalNumber,
  statusId: optionalUuid,
  followUpDate: optionalIsoDate,
  followUpNotes: optionalText,
  nextAction: optionalText,
  remarks: optionalText,
});
export type InquiryInput = z.infer<typeof inquirySchema>;

export const inquiryUpdateSchema = inquirySchema.extend({ id: z.string().uuid() });
export type InquiryUpdateInput = z.infer<typeof inquiryUpdateSchema>;

export const inquiryFollowupSchema = z.object({
  inquiryId: z.string().uuid(),
  followUpDate: optionalIsoDate,
  previousAction: optionalText,
  customerResponse: optionalText,
  nextFollowUpDate: optionalIsoDate,
  responsibleId: optionalUuid,
  statusId: optionalUuid,
});
export type InquiryFollowupInput = z.infer<typeof inquiryFollowupSchema>;

export const inquiryCustomerTypeSchema = z.object({ name: nonEmpty.max(80) });
export type InquiryCustomerTypeInput = z.infer<typeof inquiryCustomerTypeSchema>;

export const inquiryStatusSchema = z.object({
  name: nonEmpty.max(80),
  category: z.enum(INQUIRY_STATUS_CATEGORIES).default('open'),
});
export type InquiryStatusInput = z.infer<typeof inquiryStatusSchema>;
