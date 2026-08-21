'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import { updateEmployeeProfile } from '@/lib/actions/employees';
import type { AttendanceGroupRow, EmployeeRow } from '@/lib/db/types';

export function EmployeeProfileForm({
  employee,
  groups,
}: {
  employee: EmployeeRow;
  groups: AttendanceGroupRow[];
}) {
  const { t } = useT();
  return (
    <ActionForm action={updateEmployeeProfile}>
      <input type="hidden" name="employeeId" value={employee.id} />
      <div className="space-y-1.5">
        <Label htmlFor="pf-code">{t('emp.employeeId')}</Label>
        <Input
          id="pf-code"
          value={employee.employee_code}
          readOnly
          disabled
          className="max-w-[200px] font-mono"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pf-group">{t('emp.group')}</Label>
          <NativeSelect
            id="pf-group"
            name="attendanceGroupId"
            defaultValue={employee.attendance_group_id ?? ''}
          >
            <option value="">—</option>
            {groups.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-display">{t('emp.english')}</Label>
          <Input id="pf-display" name="displayName" defaultValue={employee.display_name ?? ''} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pf-title">{t('emp.jobTitle')}</Label>
          <Input id="pf-title" name="jobTitle" defaultValue={employee.job_title ?? ''} />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="pf-label">{t('emp.labelHint')}</Label>
          <Input id="pf-label" name="label" defaultValue={employee.label ?? ''} />
        </div>
      </div>
      <SubmitButton>{t('emp.saveProfile')}</SubmitButton>
    </ActionForm>
  );
}
