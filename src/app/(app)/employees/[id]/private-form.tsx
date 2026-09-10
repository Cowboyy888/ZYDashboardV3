'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import { saveEmployeePrivate } from '@/lib/actions/employees';
import type { EmployeePrivateRow } from '@/lib/db/types';

export function PrivateForm({
  employeeId,
  data,
}: {
  employeeId: string;
  data: EmployeePrivateRow | null;
}) {
  const { t } = useT();
  return (
    <ActionForm action={saveEmployeePrivate}>
      <input type="hidden" name="employeeId" value={employeeId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="baseSalary">{t('emp.baseSalary')}</Label>
          <Input
            id="baseSalary"
            name="baseSalary"
            type="number"
            step="0.01"
            defaultValue={data?.base_salary ?? ''}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dailyRate">{t('emp.dailyRate')}</Label>
          <Input
            id="dailyRate"
            name="dailyRate"
            type="number"
            step="0.01"
            defaultValue={data?.daily_rate ?? ''}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="emergencyContact">{t('emp.emergency')}</Label>
          <Input
            id="emergencyContact"
            name="emergencyContact"
            defaultValue={data?.emergency_contact ?? ''}
          />
        </div>
      </div>
      <SubmitButton>{t('emp.savePayroll')}</SubmitButton>
    </ActionForm>
  );
}
