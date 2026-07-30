import { requirePermission } from '@/lib/auth';
import {
  getInquiries,
  getInquiryFollowups,
  getInquiryCustomerTypes,
  getInquiryStatuses,
  getEmployees,
  getFamilies,
} from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { hasPermission } from '@/lib/domain/rbac';
import { PageHeader } from '@/components/page-header';
import { SalesNav } from '../sales-nav';
import { InquiriesClient } from './inquiries-client';

export const dynamic = 'force-dynamic';

export default async function InquiriesPage() {
  const user = await requirePermission('inquiries:view');
  const locale = await getLocale();
  const t = translator(locale);
  const canManage = hasPermission(user.role, 'inquiries:manage');

  const [inquiries, followups, customerTypes, statuses, employees, families] = await Promise.all([
    getInquiries(),
    getInquiryFollowups(),
    getInquiryCustomerTypes(true),
    getInquiryStatuses(true),
    getEmployees(),
    getFamilies(true),
  ]);

  return (
    <div>
      <PageHeader title={t('sal.inquiries')} description={t('inq.desc')} />
      <SalesNav active="inquiries" />
      <InquiriesClient
        inquiries={inquiries}
        followups={followups}
        customerTypes={customerTypes}
        statuses={statuses}
        employees={employees.map((e) => ({
          id: e.id,
          name: e.display_name || e.name_english || e.name_chinese || e.employee_code,
        }))}
        families={families.map((f) => ({ id: f.id, name: f.name }))}
        canManage={canManage}
      />
    </div>
  );
}
