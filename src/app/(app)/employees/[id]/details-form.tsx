'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import { updateEmployeeDetails } from '@/lib/actions/employees';
import type { EmployeeRow, TaskDepartmentRow } from '@/lib/db/types';

export function EmployeeDetailsForm({
  employee,
  departments,
}: {
  employee: EmployeeRow;
  departments: TaskDepartmentRow[];
}) {
  const { t } = useT();
  // Department used to be free text — an existing value that predates the
  // department list (or was typed differently) must still show up as an
  // option, not get silently dropped the next time this form is saved.
  const currentDept = employee.department?.trim() ?? '';
  const knownNames = new Set(departments.map((d) => d.name));
  const deptOptions =
    currentDept && !knownNames.has(currentDept)
      ? [...departments, { id: 'current', name: currentDept } as TaskDepartmentRow]
      : departments;
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
          <NativeSelect id="df-dept" name="department" defaultValue={currentDept}>
            <option value="">{t('common.select')}</option>
            {deptOptions.map((d) => (
              <option key={d.id} value={d.name}>
                {d.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="df-location">{t('emp.workLocation')}</Label>
          <NativeSelect
            id="df-location"
            name="workLocation"
            defaultValue={employee.work_location ?? ''}
          >
            <option value="">{t('common.select')}</option>
            <option value="office">{t('emp.office')}</option>
            <option value="factory">{t('emp.factory')}</option>
          </NativeSelect>
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
          <NativeSelect id="df-pay" name="payType" defaultValue={employee.pay_type}>
            <option value="daily">{t('emp.daily')}</option>
            <option value="monthly">{t('emp.monthly')}</option>
          </NativeSelect>
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
