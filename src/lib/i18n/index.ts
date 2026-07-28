/**
 * Dependency-free i18n for English (default) and Chinese.
 *
 * - UI labels resolve to { en, zh } via `t(locale, key)` / `translator`.
 * - Business DATA is never translated here: Chinese product/spec names, Khmer /
 *   English employee names, numbers, quantities and dates are rendered as saved
 *   (see src/lib/domain/datetime.ts for date formatting).
 * - Action/validation messages returned by server actions are localised at
 *   DISPLAY time via `localizeMessage` (a phrase map), so action code stays in
 *   plain English while the UI still switches language.
 * - This is a real dictionary — browser auto-translation is not used.
 */

export const LOCALES = ['en', 'zh'] as const;
export type Locale = (typeof LOCALES)[number];

/** Default language is English. */
export const DEFAULT_LOCALE: Locale =
  (process.env.NEXT_PUBLIC_DEFAULT_LOCALE as Locale) === 'zh' ? 'zh' : 'en';

export function isLocale(value: unknown): value is Locale {
  return value === 'zh' || value === 'en';
}

type Entry = { en: string; zh: string };

export const dictionary = {
  'app.name': { en: 'Zysteel Operations', zh: '中粤铁网 运营系统' },
  'app.shortName': { en: 'Zysteel', zh: '中粤铁网' },

  // Language switcher
  'lang.en': { en: 'EN', zh: 'EN' },
  'lang.zh': { en: '中文', zh: '中文' },
  'lang.aria': { en: 'Language', zh: '语言' },

  // Navigation
  'nav.dashboard': { en: 'Dashboard', zh: '仪表盘' },
  'nav.attendance': { en: 'Attendance', zh: '考勤' },
  'nav.employees': { en: 'Employees', zh: '员工' },
  'nav.inventory': { en: 'Inventory', zh: '库存' },
  'nav.purchasing': { en: 'Purchasing', zh: '采购' },
  'nav.sales': { en: 'Sales', zh: '销售' },
  'nav.payroll': { en: 'Payroll', zh: '工资' },
  'nav.reports': { en: 'Reports', zh: '报表' },
  'nav.settings': { en: 'Settings', zh: '设置' },
  'nav.signOut': { en: 'Sign out', zh: '退出登录' },

  // Common
  'common.save': { en: 'Save', zh: '保存' },
  'common.cancel': { en: 'Cancel', zh: '取消' },
  'common.add': { en: 'Add', zh: '新增' },
  'common.edit': { en: 'Edit', zh: '编辑' },
  'common.archive': { en: 'Archive', zh: '归档' },
  'common.reactivate': { en: 'Reactivate', zh: '重新启用' },
  'common.activate': { en: 'Activate', zh: '启用' },
  'common.deactivate': { en: 'Deactivate', zh: '停用' },
  'common.active': { en: 'Active', zh: '启用' },
  'common.archived': { en: 'Archived', zh: '已归档' },
  'common.inactive': { en: 'Inactive', zh: '停用' },
  'common.notes': { en: 'Notes', zh: '备注' },
  'common.date': { en: 'Date', zh: '日期' },
  'common.quantity': { en: 'Quantity', zh: '数量' },
  'common.unit': { en: 'Unit', zh: '单位' },
  'common.location': { en: 'Location', zh: '地点' },
  'common.condition': { en: 'Condition', zh: '状态' },
  'common.total': { en: 'Total', zh: '合计' },
  'common.status': { en: 'Status', zh: '状态' },
  'common.actions': { en: 'Actions', zh: '操作' },
  'common.name': { en: 'Name', zh: '名称' },
  'common.code': { en: 'Code', zh: '代码' },
  'common.id': { en: 'ID', zh: '编号' },
  'common.close': { en: 'Close', zh: '关闭' },
  'common.delete': { en: 'Delete', zh: '删除' },
  'common.all': { en: 'All', zh: '全部' },
  'common.search': { en: 'Search', zh: '搜索' },
  'common.min': { en: 'Min', zh: '最低' },
  'common.ok': { en: 'OK', zh: '正常' },
  'common.low': { en: 'Low', zh: '低' },
  'common.select': { en: 'Select…', zh: '请选择…' },
  'common.sendNow': { en: 'Send now', zh: '立即发送' },
  'common.loading': { en: 'Loading…', zh: '加载中…' },
  'common.saved': { en: 'Saved', zh: '已保存' },

  // Passes (roadmap)
  'pass.second': { en: 'second pass', zh: '第二阶段' },
  'pass.third': { en: 'third pass', zh: '第三阶段' },
  'pass.fourth': { en: 'fourth pass', zh: '第四阶段' },
  'pass.later': { en: 'later passes', zh: '后续阶段' },
  'cs.comingSoon': { en: 'Coming soon', zh: '即将推出' },
  'cs.scoped': {
    en: 'This module is scoped for the {pass}. See docs/decisions.md for the roadmap.',
    zh: '该模块规划于{pass}。路线图见 docs/decisions.md。',
  },

  // Dashboard
  'dash.title': { en: 'Operations Dashboard', zh: '运营仪表盘' },
  'dash.morningAtt': { en: "Today's Attendance · Morning", zh: '今日考勤 · 上午' },
  'dash.afternoonAtt': { en: "Today's Attendance · Afternoon", zh: '今日考勤 · 下午' },
  'dash.mtdRate': { en: 'Month-to-date rate', zh: '本月出勤率' },
  'dash.productionToday': { en: 'Production today', zh: '今日生产' },
  'dash.inventoryTotals': { en: 'Inventory Totals', zh: '库存总量' },
  'dash.lowStock': { en: 'Low-stock alerts', zh: '低库存预警' },
  'dash.allGood': { en: 'All good', zh: '全部正常' },
  'dash.attExceptions': { en: 'Attendance exceptions', zh: '今日考勤异常' },
  'dash.none': { en: 'None', zh: '无' },
  'dash.morning': { en: 'Morning', zh: '上午' },
  'dash.afternoon': { en: 'Afternoon', zh: '下午' },
  'dash.salesToday': { en: 'Sales today', zh: '今日销售' },
  'dash.openPOs': { en: 'Open POs', zh: '采购订单' },
  'dash.pendingDeliveries': { en: 'Pending deliveries', zh: '待交付' },
  'dash.payrollApprovals': { en: 'Payroll approvals', zh: '待审工资' },
  'dash.logProduction': { en: 'Log production', zh: '登记生产' },
  'dash.placeholderNote': {
    en: 'Placeholder tiles cover modules planned for later passes (see docs/decisions.md).',
    zh: '占位卡片为后续阶段规划的模块（详见 docs/decisions.md）。',
  },

  // Attendance
  'att.title': { en: 'Attendance', zh: '考勤' },
  'att.shifts': {
    en: 'morning & afternoon shifts (Asia/Phnom_Penh)',
    zh: '上午与下午班次（Asia/Phnom_Penh）',
  },
  'att.morning': { en: 'Morning', zh: '上午' },
  'att.afternoon': { en: 'Afternoon', zh: '下午' },
  'att.sendReport': { en: 'Send report', zh: '发送报告' },
  'att.markAllPresent': { en: 'Mark all present', zh: '全部标为出勤' },
  'att.unmarkedWarn': {
    en: 'employee(s) still unmarked for this shift — complete before sending the report.',
    zh: '名员工尚未标记 — 发送报告前请完成。',
  },
  'att.employee': { en: 'Employee', zh: '员工' },
  'att.set': { en: 'Set', zh: '设置' },
  'att.noActive': { en: 'No active employees.', zh: '暂无在职员工。' },
  'att.date': { en: 'Date', zh: '日期' },

  // Inventory
  'inv.title': { en: 'Inventory', zh: '库存' },
  'inv.desc': {
    en: 'Append-only stock ledger. Live balances by Storage Room, Warehouse, and company total.',
    zh: '仅追加库存台账。按仓房、仓库及公司合计实时显示。',
  },
  'inv.stockTab': { en: 'Stock', zh: '库存' },
  'inv.recordTab': { en: 'Record', zh: '记录' },
  'inv.ledgerTab': { en: 'Ledger', zh: '流水' },
  'inv.specification': { en: 'Specification', zh: '规格' },
  'inv.storageRoom': { en: 'Storage Room', zh: '仓房' },
  'inv.warehouse': { en: 'Warehouse', zh: '仓库' },
  'inv.company': { en: 'Company total', zh: '公司合计' },
  'inv.companyGrandTotal': { en: 'Company grand total', zh: '公司总计' },
  'inv.editAmount': { en: 'Edit amount', zh: '编辑数量' },
  'inv.editAmountHint': {
    en: 'Type the new total for each location — the difference is recorded as an adjustment.',
    zh: '输入各地点的新数量，差额将作为调整记录。',
  },
  'inv.totalsByFamily': { en: 'Totals by product family', zh: '按产品系列合计' },
  'inv.noSpecs': {
    en: 'No specifications yet. Add them in Settings → Products.',
    zh: '暂无规格，请在 设置 → 产品 中新增。',
  },
  'inv.recordMovement': { en: 'Record movement', zh: '记录出入库' },
  'inv.type': { en: 'Type', zh: '类型' },
  'inv.sendInventory': { en: 'Send inventory report', zh: '发送库存报告' },
  'inv.transfer': { en: 'Transfer', zh: '调拨' },
  'inv.transferTitle': { en: 'Transfer (Storage Room ↔ Warehouse)', zh: '调拨（仓房 ↔ 仓库）' },
  'inv.from': { en: 'From', zh: '从' },
  'inv.to': { en: 'To', zh: '到' },
  'inv.overrideLabel': {
    en: 'Owner override reason (only if going negative)',
    zh: '老板超额原因（仅当库存为负时）',
  },
  'inv.overridePlaceholder': { en: 'Reason for negative stock', zh: '库存为负的原因' },
  'inv.adjustNote': {
    en: 'For adjustments, enter a positive or negative amount. Other types use a positive quantity; direction is applied automatically.',
    zh: '调整可输入正数或负数；其他类型输入正数，方向自动应用。',
  },
  'inv.transferNote': {
    en: 'Creates a matching transfer-out and transfer-in — company total does not change.',
    zh: '生成对应的调出与调入 — 公司合计不变。',
  },
  'inv.noMovements': { en: 'No movements yet.', zh: '暂无流水。' },
  'inv.movement.opening_balance': { en: 'Opening balance', zh: '期初库存' },
  'inv.movement.purchase_receipt': { en: 'Purchase receipt', zh: '采购入库' },
  'inv.movement.production_output': { en: 'Production output', zh: '生产入库' },
  'inv.movement.sale_delivery': { en: 'Sale delivery', zh: '销售出库' },
  'inv.movement.other_stock_out': { en: 'Other stock out', zh: '其他出库' },
  'inv.movement.adjustment': { en: 'Adjustment', zh: '库存调整' },
  'inv.movement.transfer_out': { en: 'Transfer out', zh: '调拨出库' },
  'inv.movement.transfer_in': { en: 'Transfer in', zh: '调拨入库' },

  // Employees
  'emp.title': { en: 'Employees', zh: '员工' },
  'emp.desc': {
    en: 'Profiles with Khmer / English / Chinese names, attendance group, and report fields.',
    zh: '含高棉文 / 英文 / 中文姓名、考勤分组及报告字段的员工档案。',
  },
  'emp.add': { en: 'Add employee', zh: '新增员工' },
  'emp.new': { en: 'New employee', zh: '新增员工' },
  'emp.empId': { en: 'Employee ID', zh: '工号' },
  'emp.numberHint': { en: 'Employee number (report “7号”)', zh: '员工编号（报告 “7号”）' },
  'emp.group': { en: 'Attendance group', zh: '考勤分组' },
  'emp.displayReport': { en: 'Display name (report)', zh: '显示名（报告）' },
  'emp.jobTitleReport': { en: 'Job title (report)', zh: '职位（报告）' },
  'emp.labelHint': { en: 'Label (optional, e.g. 备用)', zh: '标签（可选，如 备用）' },
  'emp.khmer': { en: 'Khmer name', zh: '高棉文姓名' },
  'emp.english': { en: 'English name', zh: '英文姓名' },
  'emp.chinese': { en: 'Chinese name', zh: '中文姓名' },
  'emp.phone': { en: 'Phone', zh: '电话' },
  'emp.department': { en: 'Department', zh: '部门' },
  'emp.position': { en: 'Position', zh: '岗位' },
  'emp.startDate': { en: 'Start date', zh: '入职日期' },
  'emp.payType': { en: 'Pay type', zh: '薪资类型' },
  'emp.monthly': { en: 'Monthly salary', zh: '月薪' },
  'emp.daily': { en: 'Daily wage', zh: '日薪' },
  'emp.create': { en: 'Create employee', zh: '创建员工' },
  'emp.privateNote': {
    en: 'Salary and private details can be added on the employee page (restricted access).',
    zh: '工资与隐私信息可在员工页面添加（受限访问）。',
  },
  'emp.nameCol': { en: 'Name', zh: '姓名' },
  'emp.groupCol': { en: 'Group', zh: '分组' },
  'emp.noEmployees': { en: 'No employees yet.', zh: '暂无员工。' },
  'emp.profile': { en: 'Profile', zh: '档案' },
  'emp.reportProfile': { en: 'Report profile', zh: '报告信息' },
  'emp.payroll': { en: 'Payroll & private details', zh: '工资与隐私' },
  'emp.salaryRestricted': {
    en: 'Salary and private employee data are restricted to Owner, System Admin, and Payroll Admin.',
    zh: '工资及隐私数据仅限老板、系统管理员与工资管理员查看。',
  },
  'emp.photoAdminNote': {
    en: 'Photo upload requires payroll/admin access.',
    zh: '上传照片需工资/管理员权限。',
  },
  'emp.uploadPhoto': { en: 'Upload photo', zh: '上传照片' },
  'emp.saveProfile': { en: 'Save report profile', zh: '保存报告信息' },
  'emp.savePayroll': { en: 'Save payroll details', zh: '保存工资信息' },
  'emp.baseSalary': { en: 'Monthly base salary', zh: '月基本工资' },
  'emp.dailyRate': { en: 'Daily rate', zh: '日薪' },
  'emp.emergency': { en: 'Emergency contact', zh: '紧急联系人' },
  'emp.jobTitle': { en: 'Job title', zh: '职位' },
  'emp.displayName': { en: 'Display name', zh: '显示名' },
  'emp.number': { en: 'Employee number', zh: '员工编号' },
  'emp.label': { en: 'Label', zh: '标签' },
  'emp.employeeId': { en: 'Employee ID', zh: '工号' },
  'emp.employeeIdAuto': { en: 'Auto-generated (ZY-0001)', zh: '自动生成（ZY-0001）' },
  'emp.required': { en: 'Required', zh: '必填' },
  'emp.optionalDetails': { en: 'Optional details', zh: '可选信息' },
  'emp.optionalNote': {
    en: 'All fields below are optional.',
    zh: '以下字段均为可选。',
  },
  'emp.photoOptional': { en: 'Photo (optional)', zh: '照片（可选）' },
  'emp.photoHint': {
    en: 'JPG or PNG. Uploaded right after the employee is created — it never blocks creation.',
    zh: 'JPG 或 PNG。在员工创建后立即上传，不会影响创建。',
  },
  'emp.choosePhoto': { en: 'Choose photo', zh: '选择照片' },
  'emp.removePhoto': { en: 'Remove', zh: '移除' },
  'emp.photoUploading': { en: 'Uploading photo…', zh: '照片上传中…' },
  'emp.photoUploaded': { en: 'Photo uploaded', zh: '照片已上传' },
  'emp.photoFailed': {
    en: 'Employee created, but the photo failed to upload. Add it on the employee page.',
    zh: '员工已创建，但照片上传失败，请在员工页面重试。',
  },

  // Settings
  'set.subtitle': {
    en: 'Master data, integrations, users & audit.',
    zh: '主数据、集成、用户与审计。',
  },
  'set.locations': { en: 'Locations', zh: '库存地点' },
  'set.products': { en: 'Products & Specs', zh: '产品与规格' },
  'set.groups': { en: 'Attendance Groups', zh: '考勤分组' },
  'set.telegram': { en: 'Telegram', zh: 'Telegram 设置' },
  'set.users': { en: 'Users & Roles', zh: '用户与角色' },
  'set.audit': { en: 'Audit Log', zh: '审计日志' },
  'set.addLocation': { en: 'Add location', zh: '新增地点' },
  'set.noLocations': { en: 'No locations yet.', zh: '暂无地点。' },
  'set.locationsDesc': {
    en: 'Editable stock locations. Archive a location to hide it from new movements.',
    zh: '可编辑的库存地点。归档后不再用于新出入库。',
  },
  'set.productsDesc': {
    en: 'Editable product families and per-attribute SKUs. Each unique combination is a distinct SKU.',
    zh: '可编辑的产品系列与按属性的规格。每种唯一组合为独立 SKU。',
  },
  'set.addFamily': { en: 'Add Product Family', zh: '新增产品系列' },
  'set.defaultUnit': { en: 'Default unit', zh: '默认单位' },
  'set.addFamilyBtn': { en: 'Add family', zh: '新增系列' },
  // Product family management
  'set.families': { en: 'Product families', zh: '产品系列' },
  'set.newFamily': { en: 'New product family', zh: '新增产品系列' },
  'set.familyNameZh': { en: 'Chinese name', zh: '中文名称' },
  'set.familyNameEn': { en: 'English name', zh: '英文名称' },
  'set.familyDesc': { en: 'Description', zh: '描述' },
  'set.familyNameZhPlaceholder': { en: 'e.g. 钢筋网', zh: '例如 钢筋网' },
  'set.familyNameEnPlaceholder': {
    en: 'e.g. Rebar mesh (optional)',
    zh: '例如 Rebar mesh（可选）',
  },
  'set.searchFamilies': { en: 'Search families…', zh: '搜索系列…' },
  'set.noFamilies': { en: 'No product families yet.', zh: '暂无产品系列。' },
  'set.noFamiliesMatch': { en: 'No families match your filter.', zh: '没有符合条件的系列。' },
  'set.specCount': { en: 'Specs', zh: '规格数' },
  'set.editFamily': { en: 'Edit product family', zh: '编辑产品系列' },
  'set.deleteFamily': { en: 'Delete family', zh: '删除系列' },
  'set.archiveFamily': { en: 'Archive family', zh: '归档系列' },
  'set.reactivateFamily': { en: 'Reactivate family', zh: '重新启用系列' },
  'set.confirmDeleteFamilyTitle': { en: 'Delete this product family?', zh: '删除该产品系列？' },
  'set.confirmDeleteFamilyBody': {
    en: 'This permanently removes the family. It is allowed only when the family has no specifications, stock movements, purchases, sales, or production records. If it has any history, archive it instead.',
    zh: '此操作将永久删除该系列。仅当该系列没有任何规格、出入库、采购、销售或生产记录时才可删除。如存在历史记录，请改为归档。',
  },
  'set.confirmArchiveFamilyTitle': { en: 'Archive this product family?', zh: '归档该产品系列？' },
  'set.confirmArchiveFamilyBody': {
    en: 'Archived families are hidden from new inventory, purchase, production, and sales forms but stay in historical records. You can reactivate them at any time.',
    zh: '已归档的系列会从新的库存、采购、生产和销售表单中隐藏，但仍保留在历史记录中。可随时重新启用。',
  },
  'set.confirmReactivateFamilyTitle': {
    en: 'Reactivate this product family?',
    zh: '重新启用该产品系列？',
  },
  'set.confirmReactivateFamilyBody': {
    en: 'It will reappear in new inventory, purchase, production, and sales forms.',
    zh: '它将重新出现在新的库存、采购、生产和销售表单中。',
  },
  'set.familyAfterCreateHint': {
    en: 'After creating a family, add its specifications below.',
    zh: '创建系列后，可在下方为其新增规格。',
  },
  'set.addSpec': { en: 'Add specification (SKU)', zh: '新增规格（SKU）' },
  'set.family': { en: 'Family', zh: '系列' },
  'set.diameter': { en: 'Diameter', zh: '直径' },
  'set.size': { en: 'Size', zh: '尺寸' },
  'set.hole': { en: 'Hole', zh: '孔' },
  'set.rod': { en: 'Rod count', zh: '根数' },
  'set.extra': { en: 'Extra spec (螺纹盘圆)', zh: '其他规格（螺纹盘圆）' },
  'set.minStock': { en: 'Min stock', zh: '最低库存' },
  'set.addSpecBtn': { en: 'Add specification', zh: '新增规格' },
  'set.editSpec': { en: 'Edit specification', zh: '编辑规格' },
  'set.specifications': { en: 'Specifications', zh: '规格' },
  'set.noSpecs': { en: 'No specifications yet.', zh: '暂无规格。' },
  'set.confirmDeleteSpecTitle': { en: 'Delete this specification?', zh: '删除该规格？' },
  'set.confirmDeleteSpecBody': {
    en: 'This permanently removes the specification. It is allowed only when it has no stock movements or purchase order history. If it has any history, archive it instead.',
    zh: '此操作将永久删除该规格。仅当该规格没有任何出入库或采购记录时才可删除。如存在历史记录，请改为归档。',
  },
  'set.groupsDesc': {
    en: 'Groups structure the attendance report. Reorder to change report order; archive to hide.',
    zh: '分组用于组织考勤报告。调整顺序即改变报告顺序；归档可隐藏。',
  },
  'set.addGroup': { en: 'Add group', zh: '新增分组' },
  'set.groupsTable': { en: 'Attendance groups (report order)', zh: '考勤分组（报告顺序）' },
  'set.order': { en: 'Order', zh: '顺序' },
  'set.noGroups': { en: 'No groups yet.', zh: '暂无分组。' },
  'set.usersDesc': {
    en: 'Assign roles. New signups start as Viewer; the first account is the Owner.',
    zh: '分配角色。新注册默认为查看者；第一个账户为老板。',
  },
  'set.user': { en: 'User', zh: '用户' },
  'set.addUser': { en: 'Add user', zh: '新增用户' },
  'set.role': { en: 'Role', zh: '角色' },
  'set.addUserNote': {
    en: 'Public signup is disabled. New accounts are created here by an Owner / System Admin.',
    zh: '公开注册已关闭。新账户由 Owner / 系统管理员在此创建。',
  },
  'set.currentRole': { en: 'Current role', zh: '当前角色' },
  'set.changeRole': { en: 'Change role', zh: '修改角色' },
  'set.noUsers': { en: 'No users yet.', zh: '暂无用户。' },
  'set.auditDesc': {
    en: 'Immutable record of sensitive changes (actor, action, entity, before/after).',
    zh: '敏感变更的不可篡改记录（操作者、动作、实体、前后值）。',
  },
  'set.when': { en: 'When', zh: '时间' },
  'set.actor': { en: 'Actor', zh: '操作者' },
  'set.action': { en: 'Action', zh: '动作' },
  'set.entity': { en: 'Entity', zh: '实体' },
  'set.noAudit': { en: 'No audit entries yet.', zh: '暂无审计记录。' },

  // Telegram
  'tg.desc': {
    en: 'Automated attendance and inventory reports at admin-configurable times (Asia/Phnom_Penh). Token stays server-side.',
    zh: '在管理员可配置的时间（Asia/Phnom_Penh）自动发送考勤与库存报告。令牌仅存于服务端。',
  },
  'tg.config': { en: 'Configuration', zh: '配置' },
  'tg.adapter': { en: 'Adapter', zh: '适配器' },
  'tg.adapterNote': {
    en: 'The bot token is a server-only secret (TELEGRAM_BOT_TOKEN) and is never exposed here. With no token the mock adapter is used and no real messages are sent.',
    zh: '机器人令牌为服务端密钥（TELEGRAM_BOT_TOKEN），不会在此暴露。未设置令牌时使用模拟适配器，不发送真实消息。',
  },
  'tg.morning': { en: 'Morning attendance report', zh: '上午考勤报告' },
  'tg.afternoon': { en: 'Afternoon attendance report', zh: '下午考勤报告' },
  'tg.inventory': { en: 'Daily inventory report', zh: '每日库存报告' },
  // Editable report times
  'tg.attendanceGroup': { en: 'Attendance Telegram Group', zh: '考勤 Telegram 群组' },
  'tg.inventoryGroup': { en: 'Inventory Telegram Group', zh: '库存 Telegram 群组' },
  'tg.groupEnabled': { en: 'Enabled', zh: '已启用' },
  'tg.chatIdCurrent': { en: 'Current chat ID', zh: '当前会话 ID' },
  'tg.chatIdNone': { en: 'Not set', zh: '未设置' },
  'tg.chatIdNew': {
    en: 'New chat ID (leave blank to keep current)',
    zh: '新会话 ID（留空则保持不变）',
  },
  'tg.chatIdClear': { en: 'Remove this chat ID', zh: '移除此会话 ID' },
  'tg.testConnection': { en: 'Test connection', zh: '测试连接' },
  'tg.neverSent': { en: 'Never sent', zh: '从未发送' },
  'tg.lastSent': { en: 'Last sent', zh: '最近发送' },
  'tg.lastError': { en: 'Last error', zh: '最近错误' },
  'tg.statusSent': { en: 'Sent', zh: '已发送' },
  'tg.statusFailed': { en: 'Failed', zh: '失败' },
  'tg.reportTime': { en: 'Report time (HH:mm)', zh: '报告时间（HH:mm）' },
  'tg.timezone': { en: 'Asia/Phnom_Penh (Cambodia)', zh: 'Asia/Phnom_Penh（柬埔寨）' },
  'tg.timezoneLabel': { en: 'Timezone', zh: '时区' },
  'tg.scheduleNote': {
    en: 'The scheduler reads these saved times. Each report sends once per Cambodia business date, even if a time is changed later that day.',
    zh: '调度器读取所保存的时间。每个报告在每个柬埔寨业务日仅发送一次，即使当天稍后更改时间。',
  },
  'tg.earlyWarnMorning': {
    en: 'Earlier than the usual 07:30 morning entry time — attendance may not be entered yet.',
    zh: '早于通常的 07:30 上午打卡时间 — 考勤可能尚未录入。',
  },
  'tg.earlyWarnAfternoon': {
    en: 'Earlier than the usual 12:30 afternoon entry time — attendance may not be entered yet.',
    zh: '早于通常的 12:30 下午打卡时间 — 考勤可能尚未录入。',
  },
  'tg.confirmEarlyTitle': { en: 'Send before manual-entry time?', zh: '在打卡时间前发送？' },
  'tg.confirmEarlyBody': {
    en: 'One or more reports are scheduled before their normal manual-entry time, so attendance may not be entered yet. You can still save.',
    zh: '有报告安排在通常的打卡时间之前发送，此时考勤可能尚未录入。仍可保存。',
  },
  'tg.beforeEntry': { en: 'before', zh: '早于' },
  'tg.saveAnyway': { en: 'Save anyway', zh: '仍然保存' },
  'tg.reportLang': { en: 'Report language', zh: '报告语言' },
  'tg.reportLangNote': {
    en: 'Attendance reports are sent in Chinese. English reports are planned; the current format is unchanged.',
    zh: '考勤报告以中文发送。英文报告规划中；当前格式不变。',
  },
  'tg.save': { en: 'Save settings', zh: '保存设置' },
  'tg.sendNow': { en: 'Send now', zh: '立即发送' },
  'tg.sendNowDesc': {
    en: 'Manually send (or resend a corrected) report to the configured chat.',
    zh: '手动发送（或重发已更正的）报告到已配置的会话。',
  },
  'tg.morningAtt': { en: 'Morning attendance', zh: '上午考勤' },
  'tg.afternoonAtt': { en: 'Afternoon attendance', zh: '下午考勤' },
  'tg.inventoryReport': { en: 'Inventory', zh: '库存日报' },

  // Report preview
  'rp.title': { en: 'Telegram Report Preview', zh: 'Telegram 报告预览' },
  'rp.desc': {
    en: 'Exact report bodies generated from live records — identical to what Telegram sends.',
    zh: '依据实时数据生成的报告内容，与 Telegram 发送内容完全一致。',
  },
  'rp.morning': { en: 'Morning report', zh: '上午报告' },
  'rp.afternoon': { en: 'Afternoon report', zh: '下午报告' },
  'rp.inventory': { en: 'Inventory report', zh: '库存报告' },
  'rp.sendNote': {
    en: "Send dispatches today's report to the configured Telegram chat.",
    zh: '“发送”会将今日报告发送至已配置的 Telegram 会话。',
  },

  // Auth
  'auth.signIn': { en: 'Sign in', zh: '登录' },
  'auth.email': { en: 'Email', zh: '邮箱' },
  'auth.password': { en: 'Password', zh: '密码' },
  'auth.name': { en: 'Name', zh: '姓名' },
  'auth.firstTime': { en: 'First time here?', zh: '第一次使用？' },
  'auth.setupOwner': { en: 'Set up the Owner account', zh: '创建管理员账户' },
  'auth.ownerSetup': { en: 'Owner setup', zh: '创建管理员' },
  'auth.ownerSetupDesc': {
    en: 'The first account created becomes the Owner with full access. Create it once, then invite staff from Settings → Users.',
    zh: '首个创建的账户将成为拥有全部权限的老板。创建一次后，可在 设置 → 用户 邀请员工。',
  },
  'auth.createOwner': { en: 'Create Owner account', zh: '创建管理员账户' },
  'auth.haveAccount': { en: 'Already have an account?', zh: '已有账户？' },
  'auth.notConfigured': {
    en: 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and _ANON_KEY in .env.local.',
    zh: 'Supabase 未配置。请在 .env.local 中设置 NEXT_PUBLIC_SUPABASE_URL 与 _ANON_KEY。',
  },
  'auth.alreadyConfigured': { en: 'Setup complete', zh: '已完成初始化' },
  'auth.alreadyConfiguredDesc': {
    en: 'An Owner account already exists. Ask an Owner to add your account from Settings → Users, then sign in.',
    zh: 'Owner 账户已存在。请让 Owner 在 设置 → 用户 中为你添加账户，然后登录。',
  },
  // Purchasing (Second pass)
  'pur.dashboard': { en: 'Dashboard', zh: '仪表盘' },
  'pur.suppliers': { en: 'Suppliers', zh: '供应商' },
  'pur.orders': { en: 'Purchase Orders', zh: '采购订单' },
  'pur.dashDesc': {
    en: 'Open orders, expected arrivals, overdue, and projected stock.',
    zh: '未结订单、预计到货、逾期订单与预计库存。',
  },
  'pur.openOrders': { en: 'Open purchase orders', zh: '未结采购订单' },
  'pur.dueThisWeek': { en: 'Expected arrivals this week', zh: '本周预计到货' },
  'pur.overdue': { en: 'Overdue purchase orders', zh: '逾期采购订单' },
  'pur.overdueBadge': { en: 'Overdue', zh: '已逾期' },
  'pur.dueThisWeekBadge': { en: 'Due this week', zh: '本周到货' },
  'pur.partiallyReceived': { en: 'Partially received', zh: '部分收货' },
  'pur.orderedVsReceived': { en: 'Ordered vs. received', zh: '订购与已收对比' },
  'pur.projectedStock': { en: 'Projected Stock', zh: '预计库存' },
  'pur.projectedNote': {
    en: 'Projected stock = physical stock + outstanding ordered quantity. Always shown separately from physical stock.',
    zh: '预计库存 = 实际库存 + 未到货订购数量。始终与实际库存分开显示。',
  },
  'pur.physicalStock': { en: 'Physical stock', zh: '实际库存' },
  'pur.outstandingOrdered': { en: 'Outstanding ordered', zh: '未到货订购量' },
  'pur.noOpenOrders': { en: 'No open purchase orders.', zh: '暂无未结采购订单。' },
  'pur.noProjected': {
    en: 'Nothing outstanding — projected stock equals physical stock.',
    zh: '无未到货订单 — 预计库存等于实际库存。',
  },

  'pur.suppliersDesc': { en: 'Editable supplier list.', zh: '可编辑的供应商列表。' },
  'pur.addSupplier': { en: 'Add supplier', zh: '新增供应商' },
  'pur.editSupplier': { en: 'Edit supplier', zh: '编辑供应商' },
  'pur.supplierName': { en: 'Supplier name', zh: '供应商名称' },
  'pur.nameChinese': { en: 'Chinese name', zh: '中文名称' },
  'pur.nameEnglish': { en: 'English name', zh: '英文名称' },
  'pur.contactPerson': { en: 'Contact person', zh: '联系人' },
  'pur.phone': { en: 'Phone', zh: '电话' },
  'pur.address': { en: 'Address', zh: '地址' },
  'pur.taxId': { en: 'Tax ID', zh: '税号' },
  'pur.paymentTerms': { en: 'Payment terms', zh: '付款条款' },
  'pur.defaultCurrency': { en: 'Default currency', zh: '默认货币' },
  'pur.noSuppliers': { en: 'No suppliers yet.', zh: '暂无供应商。' },
  'pur.deleteSupplier': { en: 'Delete', zh: '删除' },

  'pur.newPo': { en: 'New purchase order', zh: '新建采购订单' },
  'pur.newPoDesc': {
    en: 'Create a draft with supplier, dates, currency, and line items — nothing is ordered until you issue it.',
    zh: '创建包含供应商、日期、货币与明细项的草稿 — 下单确认前不会生效。',
  },
  'pur.poNumber': { en: 'PO number', zh: '采购订单号' },
  'pur.supplier': { en: 'Supplier', zh: '供应商' },
  'pur.orderDate': { en: 'Order date', zh: '下单日期' },
  'pur.expectedArrival': { en: 'Expected arrival date', zh: '预计到货日期' },
  'pur.currency': { en: 'Currency', zh: '货币' },
  'pur.attachment': { en: 'Attachment', zh: '附件' },
  'pur.lineItems': { en: 'Line items', zh: '明细项' },
  'pur.addItem': { en: 'Add line', zh: '新增一行' },
  'pur.removeItem': { en: 'Remove', zh: '移除' },
  'pur.orderedQty': { en: 'Ordered qty', zh: '订购数量' },
  'pur.unitCost': { en: 'Unit cost', zh: '单价' },
  'pur.lineTotal': { en: 'Line total', zh: '小计' },
  'pur.outstandingQty': { en: 'Outstanding', zh: '未到货' },
  'pur.createDraft': { en: 'Create draft', zh: '创建草稿' },
  'pur.noItems': { en: 'Add at least one line item.', zh: '请至少添加一行明细。' },
  'pur.costsHidden': { en: 'Costs hidden for your role', zh: '你的角色不可见成本' },

  'pur.noOrders': { en: 'No purchase orders yet.', zh: '暂无采购订单。' },
  'pur.backToOrders': { en: '← Back to purchase orders', zh: '← 返回采购订单' },
  'pur.issue': { en: 'Issue', zh: '下单确认' },
  'pur.cancel': { en: 'Cancel PO', zh: '取消订单' },
  'pur.print': { en: 'Print', zh: '打印' },
  'pur.confirmIssue': {
    en: 'Issue this purchase order? Supplier, currency, and line items cannot be changed afterward.',
    zh: '确认下单？下单后供应商、货币与明细项将无法更改。',
  },
  'pur.confirmCancel': { en: 'Cancel this purchase order?', zh: '确认取消此采购订单？' },
  'pur.receiveGoods': { en: 'Receive goods', zh: '收货' },
  'pur.receivedDate': { en: 'Received date', zh: '收货日期' },
  'pur.batchReference': { en: 'Batch / reference number', zh: '批次 / 单据号' },
  'pur.deliveryPhoto': { en: 'Delivery note / invoice photo', zh: '送货单 / 发票照片' },
  'pur.overrideLabel': {
    en: 'Owner override reason (only if over-receiving)',
    zh: '老板超收原因（仅当超额收货时）',
  },
  'pur.overridePlaceholder': {
    en: 'Reason for receiving above the ordered quantity',
    zh: '超过订购数量收货的原因',
  },
  'pur.receiptHistory': { en: 'Receipt history', zh: '收货记录' },
  'pur.noReceipts': { en: 'No receipts recorded yet.', zh: '暂无收货记录。' },
  'pur.receivedBy': { en: 'Received by', zh: '收货人' },

  // --- Sales (Third pass) ------------------------------------------------------
  'sal.dashboard': { en: 'Dashboard', zh: '仪表盘' },
  'sal.customers': { en: 'Customers', zh: '客户' },
  'sal.orders': { en: 'Sales Orders', zh: '销售订单' },
  'sal.dashDesc': {
    en: 'Open orders, expected deliveries, overdue, and committed stock.',
    zh: '未结订单、预计发货、逾期订单与已承诺库存。',
  },
  'sal.openOrders': { en: 'Open sales orders', zh: '未结销售订单' },
  'sal.dueThisWeek': { en: 'Expected deliveries this week', zh: '本周预计发货' },
  'sal.overdue': { en: 'Overdue sales orders', zh: '逾期销售订单' },
  'sal.overdueBadge': { en: 'Overdue', zh: '已逾期' },
  'sal.dueThisWeekBadge': { en: 'Due this week', zh: '本周发货' },
  'sal.partiallyDelivered': { en: 'Partially delivered', zh: '部分发货' },
  'sal.orderedVsDelivered': { en: 'Ordered vs. delivered', zh: '订购与已发对比' },
  'sal.committedStock': { en: 'Committed Stock', zh: '已承诺库存' },
  'sal.committedNote': {
    en: 'Committed stock = physical stock − outstanding ordered quantity not yet delivered. Always shown separately from physical stock. A negative value means more has been sold than is physically on hand.',
    zh: '已承诺库存 = 实际库存 − 未发货订购数量。始终与实际库存分开显示。负值表示已售出的数量超过实际库存。',
  },
  'sal.physicalStock': { en: 'Physical stock', zh: '实际库存' },
  'sal.outstandingOrdered': { en: 'Outstanding ordered', zh: '未发货订购量' },
  'sal.noOpenOrders': { en: 'No open sales orders.', zh: '暂无未结销售订单。' },
  'sal.noCommitted': {
    en: 'Nothing outstanding — committed stock equals physical stock.',
    zh: '无未发货订单 — 已承诺库存等于实际库存。',
  },

  'sal.customersDesc': { en: 'Editable customer list.', zh: '可编辑的客户列表。' },
  'sal.addCustomer': { en: 'Add customer', zh: '新增客户' },
  'sal.editCustomer': { en: 'Edit customer', zh: '编辑客户' },
  'sal.customerName': { en: 'Customer name', zh: '客户名称' },
  'sal.nameChinese': { en: 'Chinese name', zh: '中文名称' },
  'sal.nameEnglish': { en: 'English name', zh: '英文名称' },
  'sal.contactPerson': { en: 'Contact person', zh: '联系人' },
  'sal.phone': { en: 'Phone', zh: '电话' },
  'sal.address': { en: 'Address', zh: '地址' },
  'sal.taxId': { en: 'Tax ID', zh: '税号' },
  'sal.paymentTerms': { en: 'Payment terms', zh: '付款条款' },
  'sal.defaultCurrency': { en: 'Default currency', zh: '默认货币' },
  'sal.noCustomers': { en: 'No customers yet.', zh: '暂无客户。' },
  'sal.deleteCustomer': { en: 'Delete', zh: '删除' },

  'sal.newSo': { en: 'New sales order', zh: '新建销售订单' },
  'sal.newSoDesc': {
    en: 'Create a draft with customer, dates, currency, and line items — nothing is confirmed until you confirm it.',
    zh: '创建包含客户、日期、货币与明细项的草稿 — 确认前不会生效。',
  },
  'sal.soNumber': { en: 'SO number', zh: '销售订单号' },
  'sal.customer': { en: 'Customer', zh: '客户' },
  'sal.orderDate': { en: 'Order date', zh: '下单日期' },
  'sal.expectedDelivery': { en: 'Expected delivery date', zh: '预计发货日期' },
  'sal.currency': { en: 'Currency', zh: '货币' },
  'sal.attachment': { en: 'Attachment', zh: '附件' },
  'sal.lineItems': { en: 'Line items', zh: '明细项' },
  'sal.addItem': { en: 'Add line', zh: '新增一行' },
  'sal.removeItem': { en: 'Remove', zh: '移除' },
  'sal.orderedQty': { en: 'Ordered qty', zh: '订购数量' },
  'sal.unitPrice': { en: 'Unit price', zh: '单价' },
  'sal.lineTotal': { en: 'Line total', zh: '小计' },
  'sal.outstandingQty': { en: 'Outstanding', zh: '未发货' },
  'sal.createDraft': { en: 'Create draft', zh: '创建草稿' },
  'sal.noItems': { en: 'Add at least one line item.', zh: '请至少添加一行明细。' },
  'sal.pricesHidden': { en: 'Prices hidden for your role', zh: '你的角色不可见价格' },

  'sal.noOrders': { en: 'No sales orders yet.', zh: '暂无销售订单。' },
  'sal.backToOrders': { en: '← Back to sales orders', zh: '← 返回销售订单' },
  'sal.confirm': { en: 'Confirm', zh: '确认订单' },
  'sal.cancel': { en: 'Cancel SO', zh: '取消订单' },
  'sal.print': { en: 'Print', zh: '打印' },
  'sal.confirmConfirm': {
    en: 'Confirm this sales order? Customer, currency, and line items cannot be changed afterward.',
    zh: '确认此销售订单？确认后客户、货币与明细项将无法更改。',
  },
  'sal.confirmCancel': { en: 'Cancel this sales order?', zh: '确认取消此销售订单？' },
  'sal.deliverGoods': { en: 'Deliver goods', zh: '发货' },
  'sal.deliveredDate': { en: 'Delivered date', zh: '发货日期' },
  'sal.batchReference': { en: 'Batch / reference number', zh: '批次 / 单据号' },
  'sal.deliveryPhoto': { en: 'Delivery note / invoice photo', zh: '送货单 / 发票照片' },
  'sal.overrideLabel': {
    en: 'Owner override reason (only if over-delivering)',
    zh: '老板超发原因（仅当超额发货时）',
  },
  'sal.overridePlaceholder': {
    en: 'Reason for delivering above the ordered quantity',
    zh: '超过订购数量发货的原因',
  },
  'sal.deliveryHistory': { en: 'Delivery history', zh: '发货记录' },
  'sal.noDeliveries': { en: 'No deliveries recorded yet.', zh: '暂无发货记录。' },
  'sal.deliveredBy': { en: 'Delivered by', zh: '发货人' },

  // --- Payroll (Fourth pass) ----------------------------------------------------
  'pay.title': { en: 'Payroll', zh: '工资' },
  'pay.desc': {
    en: 'Payroll runs, generated from attendance and pay rates.',
    zh: '工资单，根据考勤与工资率生成。',
  },
  'pay.newRun': { en: 'New payroll run', zh: '新建工资单' },
  'pay.newRunDesc': {
    en: 'Pick a period and pay date — a draft is generated for every active employee from their pay rate and attendance.',
    zh: '选择周期与发放日期 — 系统会根据每位在职员工的工资率与考勤自动生成草稿。',
  },
  'pay.newRunHint': {
    en: 'Amounts are calculated automatically from attendance and pay rates — they cannot be typed in directly.',
    zh: '金额根据考勤与工资率自动计算 — 不可手动输入。',
  },
  'pay.generateDraft': { en: 'Generate draft', zh: '生成草稿' },
  'pay.period': { en: 'Period', zh: '周期' },
  'pay.periodStart': { en: 'Period start', zh: '周期开始' },
  'pay.periodEnd': { en: 'Period end', zh: '周期结束' },
  'pay.payDate': { en: 'Pay date', zh: '发放日期' },
  'pay.employeeCount': { en: 'Employees', zh: '员工数' },
  'pay.grossTotal': { en: 'Gross total', zh: '应发合计' },
  'pay.netTotal': { en: 'Net total', zh: '实发合计' },
  'pay.noRuns': { en: 'No payroll runs yet.', zh: '暂无工资单。' },
  'pay.payslips': { en: 'Payslips', zh: '工资明细' },
  'pay.employee': { en: 'Employee', zh: '员工' },
  'pay.payType': { en: 'Pay type', zh: '计薪方式' },
  'pay.monthly': { en: 'Monthly', zh: '月薪' },
  'pay.daily': { en: 'Daily', zh: '日薪' },
  'pay.daysWorked': { en: 'Days worked', zh: '出勤天数' },
  'pay.baseAmount': { en: 'Base amount', zh: '基本金额' },
  'pay.deductions': { en: 'Deductions', zh: '扣除' },
  'pay.netAmount': { en: 'Net amount', zh: '实发金额' },
  'pay.noItems': { en: 'No payslips on this run.', zh: '该工资单暂无明细。' },
  'pay.manageLines': { en: 'Deductions / advances', zh: '扣除 / 预支' },
  'pay.deduction': { en: 'Deduction', zh: '扣除' },
  'pay.advance': { en: 'Advance', zh: '预支' },
  'pay.lineKind': { en: 'Type', zh: '类型' },
  'pay.lineLabel': { en: 'Label', zh: '说明' },
  'pay.lineLabelPlaceholder': { en: 'e.g. Uniform deduction', zh: '例如：工服扣款' },
  'pay.lineAmount': { en: 'Amount', zh: '金额' },
  'pay.addLine': { en: 'Add', zh: '添加' },
  'pay.approve': { en: 'Approve', zh: '批准' },
  'pay.confirmApprove': {
    en: 'Approve this payroll run? Once approved it becomes permanently locked — nothing about it can be changed. Only an Owner can approve.',
    zh: '批准此工资单？批准后将永久锁定，无法再更改。仅老板可以批准。',
  },
  'pay.markPaid': { en: 'Mark Paid', zh: '标记已发放' },
  'pay.confirmMarkPaid': { en: 'Mark this payroll run as Paid?', zh: '将此工资单标记为已发放？' },
  'pay.cancel': { en: 'Cancel run', zh: '取消工资单' },
  'pay.confirmCancel': { en: 'Cancel this payroll run?', zh: '确认取消此工资单？' },
} satisfies Record<string, Entry>;

export type MessageKey = keyof typeof dictionary;

/** Translate a key for a locale. Falls back to the key itself if missing. */
export function t(locale: Locale, key: MessageKey): string {
  const entry = dictionary[key];
  return entry ? entry[locale] : key;
}

/** Curried translator bound to a locale. */
export function translator(locale: Locale) {
  return (key: MessageKey) => t(locale, key);
}

/** Interpolate `{name}` placeholders. */
export function tf(locale: Locale, key: MessageKey, vars: Record<string, string | number>): string {
  return t(locale, key).replace(/\{(\w+)\}/g, (_m, name) => String(vars[name] ?? `{${name}}`));
}

/**
 * Display-time localisation for the plain-English messages returned by server
 * actions and Zod. English is a pass-through; Chinese uses the phrase map, and
 * unknown/interpolated phrases fall back to the original text.
 */
const PHRASES: Record<string, string> = {
  // Generic
  'Validation failed': '数据校验失败',
  Saved: '已保存',
  Required: '必填',
  'Must be greater than zero': '必须大于零',
  'Expected YYYY-MM-DD': '格式应为 YYYY-MM-DD',
  'Quantity cannot be zero': '数量不能为零',
  'At least 8 characters': '至少 8 个字符',
  'Source and destination must differ': '来源与目标必须不同',
  'At least one name (Khmer / English / Chinese) is required':
    '至少需要一个姓名（高棉文/英文/中文）',
  // Locations
  'Location added': '已新增地点',
  'Location updated': '已更新地点',
  'Location archived': '已归档地点',
  'Location activated': '已启用地点',
  'Name is required': '名称为必填',
  // Products
  'Product family added': '已新增产品系列',
  'Product family updated': '已更新产品系列',
  'Product family archived': '已归档产品系列',
  'Product family reactivated': '已重新启用产品系列',
  'Product family deleted': '已删除产品系列',
  'Cannot delete: this product family has records. Archive it instead.':
    '无法删除：该产品系列存在记录，请改为归档。',
  'Could not create product family': '无法创建产品系列',
  'Missing family': '缺少系列',
  'Family not found': '未找到系列',
  'Chinese name is required': '中文名称为必填',
  'Specification added': '已新增规格',
  'A SKU with these exact attributes already exists.': '已存在完全相同属性的规格。',
  'Specification updated': '已更新规格',
  'Specification archived': '已归档规格',
  'Specification activated': '已启用规格',
  'Specification deleted': '已删除规格',
  'Cannot delete: this specification has records. Archive it instead.':
    '无法删除：该规格存在记录，请改为归档。',
  'Specification not found': '未找到规格',
  'Missing specification': '缺少规格',
  // Users
  'Role updated': '已更新角色',
  'An Owner cannot demote their own account.': '老板不能降低自己账户的权限。',
  'User and role are required': '用户与角色为必填',
  // Attendance groups
  'Group added': '已新增分组',
  'Group renamed': '已重命名分组',
  'Group archived': '已归档分组',
  'Group reactivated': '已重新启用分组',
  'A group with this name already exists.': '已存在同名分组。',
  'Order updated': '已更新顺序',
  'Already at the edge': '已在边缘',
  'Invalid reorder request': '无效的排序请求',
  'Group not found': '未找到分组',
  'Missing group': '缺少分组',
  // Employees
  'Employee added': '已新增员工',
  'Please check the highlighted fields': '请检查标红的字段',
  'English name is required': '英文姓名为必填',
  'Attendance group is required': '考勤分组为必填',
  'Job title is required': '职位为必填',
  'Employee code already exists.': '工号已存在。',
  'Employee updated': '已更新员工',
  'Payroll details saved': '已保存工资信息',
  'Photo updated': '已更新照片',
  'Missing photo path': '缺少照片路径',
  'Profile updated': '已更新档案',
  'Missing employee': '缺少员工',
  // Attendance
  Saved2: '已保存',
  // Inventory
  'Movement recorded': '已记录出入库',
  'Transfer recorded (company total unchanged)': '已记录调拨（公司合计不变）',
  'Quantity updated': '已更新数量',
  'No change': '数量未变化',
  'Unknown movement type': '未知的出入库类型',
  'Movement would drive stock negative. An Owner override with a recorded reason is required.':
    '此操作会导致库存为负，需老板附原因超额批准。',
  'Blocked: movement would drive stock negative (Owner override required).':
    '已拦截：此操作会导致库存为负（需老板超额批准）。',
  // Telegram
  'Telegram settings saved': '已保存 Telegram 设置',
  'No Telegram chat id configured. Set one in Settings → Telegram.':
    '未配置 Telegram 会话 ID，请在 设置 → Telegram 中设置。',
  'Language updated': '已更新语言',
  // Purchasing
  'Supplier added': '已新增供应商',
  'Supplier updated': '已更新供应商',
  'Supplier archived': '已归档供应商',
  'Supplier reactivated': '已重新启用供应商',
  'Supplier deleted': '已删除供应商',
  'Supplier not found': '未找到供应商',
  'Missing supplier': '缺少供应商',
  'Cannot delete: this supplier has purchase order history. Archive it instead.':
    '无法删除：该供应商已有采购订单记录，请改为归档。',
  'Purchase order created as Draft': '已创建采购订单草稿',
  'Purchase order issued': '已确认下单',
  'Purchase order cancelled': '已取消采购订单',
  'Purchase order not found': '未找到采购订单',
  'Missing purchase order': '缺少采购订单',
  'Only a Draft purchase order can be issued.': '仅草稿状态的采购订单可以下单确认。',
  'Goods received': '已完成收货',
  'Invalid line items': '明细项无效',
  'One of the selected specifications was not found.': '未找到所选的其中一个规格。',
  'This purchase order cannot receive stock in its current status.':
    '该采购订单在当前状态下无法收货。',
  'Blocked: receiving this quantity would exceed the ordered amount.':
    '已拦截：此数量将超过订购数量。',
  'Blocked: this purchase order is cancelled.': '已拦截：该采购订单已取消。',
  'Blocked: this purchase order has not been issued yet.': '已拦截：该采购订单尚未下单确认。',
  'Receiving this quantity would exceed the ordered amount (Owner override required).':
    '此数量将超过订购数量（需老板超收批准）。',
  'Purchase order item not found': '未找到采购订单明细项',
  // Sales
  'Customer added': '已新增客户',
  'Customer updated': '已更新客户',
  'Customer archived': '已归档客户',
  'Customer reactivated': '已重新启用客户',
  'Customer deleted': '已删除客户',
  'Customer not found': '未找到客户',
  'Missing customer': '缺少客户',
  'Cannot delete: this customer has sales order history. Archive it instead.':
    '无法删除：该客户已有销售订单记录，请改为归档。',
  'Sales order created as Draft': '已创建销售订单草稿',
  'Sales order confirmed': '已确认销售订单',
  'Sales order cancelled': '已取消销售订单',
  'Sales order not found': '未找到销售订单',
  'Missing sales order': '缺少销售订单',
  'Only a Draft sales order can be confirmed.': '仅草稿状态的销售订单可以确认。',
  'Goods delivered': '已完成发货',
  'This sales order cannot be delivered against in its current status.':
    '该销售订单在当前状态下无法发货。',
  'Blocked: delivering this quantity would exceed the ordered amount.':
    '已拦截：此数量将超过订购数量。',
  'Blocked: this sales order is cancelled.': '已拦截：该销售订单已取消。',
  'Blocked: this sales order has not been confirmed yet.': '已拦截：该销售订单尚未确认。',
  'Delivering this quantity would exceed the ordered amount (Owner override required).':
    '此数量将超过订购数量（需老板超发批准）。',
  'Delivering this quantity would exceed the ordered amount. Requires an Owner override with a recorded reason.':
    '此操作会超过订购数量，需老板附原因超额批准。',
  'Sales order item not found': '未找到销售订单明细项',
  // Payroll
  'Payroll run generated as Draft': '已生成工资单草稿',
  'Missing payroll run': '缺少工资单',
  'Payroll run not found': '未找到工资单',
  'Only an Owner may approve a payroll run.': '仅老板可以批准工资单。',
  'Payroll item not found': '未找到工资明细',
  'This payroll run is no longer a Draft — lines can no longer be changed.':
    '该工资单已不是草稿状态 — 无法再更改明细项。',
  'Line added': '已添加明细',
  'Missing line': '缺少明细',
  'Line removed': '已移除明细',
  'Only a Draft payroll run can be approved.': '仅草稿状态的工资单可以批准。',
  'Payroll run approved': '已批准工资单',
  'Only an Approved payroll run can be marked Paid.': '仅已批准的工资单可以标记为已发放。',
  'Payroll run marked Paid': '已将工资单标记为已发放',
  'This payroll run cannot be cancelled in its current status.': '该工资单在当前状态下无法取消。',
  'Payroll run cancelled': '已取消工资单',
};

/** Localise an action/validation message for display. */
export function localizeMessage(locale: Locale, text: string): string {
  if (locale === 'en') return text;
  return PHRASES[text] ?? text;
}
