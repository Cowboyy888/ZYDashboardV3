'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import { updateEmployeeDetails } from '@/lib/actions/employees';
import type { EmployeeRow } from '@/lib/db/types';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function EmployeeDetailsForm({ employee }: { employee: EmployeeRow }) {
  const { t } = useT();
  return (
    <ActionForm action={updateEmployeeDetails}>
      <input type="hidden" name="employeeId" value={employee.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="df-khmer">{t('emp.khmer')}</Label>
          <Input id="df-khmer" name="nameKhmer" defaultValue={employee.name_khmer ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-zh">{t('emp.chinese')}</Label>
          <Input id="df-zh" name="nameChinese" defaultValue={employee.name_chinese ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-phone">{t('emp.phone')}</Label>
          <Input id="df-phone" name="phone" defaultValue={employee.phone ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-dept">{t('emp.department')}</Label>
          <Input id="df-dept" name="department" defaultValue={employee.department ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-start">{t('emp.startDate')}</Label>
          <Input
            id="df-start"
            name="startDate"
            type="date"
            defaultValue={employee.start_date ?? ''}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-pay">{t('emp.payType')}</Label>
          <select id="df-pay" name="payType" className={selectCls} defaultValue={employee.pay_type}>
            <option value="monthly">{t('emp.monthly')}</option>
            <option value="daily">{t('emp.daily')}</option>
          </select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="df-notes">{t('common.notes')}</Label>
          <Input id="df-notes" name="notes" defaultValue={employee.notes ?? ''} />
        </div>
      </div>
      <SubmitButton>{t('emp.saveDetails')}</SubmitButton>
    </ActionForm>
  );
}
