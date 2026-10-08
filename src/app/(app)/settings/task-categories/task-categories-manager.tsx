'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import {
  createTaskDepartment,
  toggleTaskDepartment,
  createTaskCategory,
  toggleTaskCategory,
  createTaskMetricType,
  toggleTaskMetricType,
} from '@/lib/actions/tasks';
import type { TaskDepartmentRow, TaskCategoryRow, TaskMetricTypeRow } from '@/lib/db/types';
import type { ActionState } from '@/lib/actions/types';

function StatusBadge({ isActive }: { isActive: boolean }) {
  const { t } = useT();
  return (
    <Badge variant={isActive ? 'success' : 'secondary'}>
      {isActive ? t('common.active') : t('common.archived')}
    </Badge>
  );
}

function ArchiveButton({
  action,
  hiddenFields,
  isActive,
}: {
  action: (prev: ActionState, formData: FormData) => Promise<ActionState>;
  hiddenFields: Record<string, string>;
  isActive: boolean;
}) {
  const { t } = useT();
  return (
    <ActionForm action={action} className="space-y-0">
      {Object.entries(hiddenFields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="isActive" value={String(isActive)} />
      <SubmitButton variant="ghost" size="sm">
        {isActive ? t('common.archive') : t('common.reactivate')}
      </SubmitButton>
    </ActionForm>
  );
}

export function TaskCategoriesManager({
  departments,
  categories,
  metricTypes,
}: {
  departments: TaskDepartmentRow[];
  categories: TaskCategoryRow[];
  metricTypes: TaskMetricTypeRow[];
}) {
  const { t } = useT();
  const departmentName = (id: string | null) => departments.find((d) => d.id === id)?.name ?? '—';

  return (
    <Tabs defaultValue="departments">
      <TabsList>
        <TabsTrigger value="departments">{t('set.taskDepartments')}</TabsTrigger>
        <TabsTrigger value="categories">{t('set.taskCategoriesTab')}</TabsTrigger>
        <TabsTrigger value="metrics">{t('set.taskMetricTypes')}</TabsTrigger>
      </TabsList>

      <TabsContent value="departments" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">{t('set.addTaskDepartment')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={createTaskDepartment}>
                <div className="space-y-1.5">
                  <Label htmlFor="dept-name">{t('common.name')}</Label>
                  <Input id="dept-name" name="name" placeholder="Marketing" required />
                </div>
                <SubmitButton>{t('common.add')}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t('set.taskDepartments')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('common.name')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {departments.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell>{d.name}</TableCell>
                      <TableCell>
                        <StatusBadge isActive={d.is_active} />
                      </TableCell>
                      <TableCell className="text-right">
                        <ArchiveButton
                          action={toggleTaskDepartment}
                          hiddenFields={{ id: d.id }}
                          isActive={d.is_active}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="categories" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">{t('set.addTaskCategory')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={createTaskCategory}>
                <div className="space-y-1.5">
                  <Label htmlFor="cat-dept">{t('tasks.department')}</Label>
                  <NativeSelect id="cat-dept" name="departmentId" required>
                    <option value="">{t('common.select')}</option>
                    {departments
                      .filter((d) => d.is_active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cat-name">{t('common.name')}</Label>
                  <Input id="cat-name" name="name" placeholder="Visit construction site" required />
                </div>
                <SubmitButton>{t('common.add')}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t('set.taskCategoriesTab')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('tasks.department')}</TableHead>
                    <TableHead>{t('common.name')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-muted-foreground">
                        {departmentName(c.department_id)}
                      </TableCell>
                      <TableCell>{c.name}</TableCell>
                      <TableCell>
                        <StatusBadge isActive={c.is_active} />
                      </TableCell>
                      <TableCell className="text-right">
                        <ArchiveButton
                          action={toggleTaskCategory}
                          hiddenFields={{ id: c.id }}
                          isActive={c.is_active}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="metrics" className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card className="lg:col-span-1">
            <CardHeader>
              <CardTitle className="text-base">{t('set.addTaskMetricType')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={createTaskMetricType}>
                <div className="space-y-1.5">
                  <Label htmlFor="m-key">{t('tasks.metricKey')}</Label>
                  <Input id="m-key" name="key" placeholder="posts_published" required />
                  <p className="text-xs text-muted-foreground">{t('set.taskMetricKeyHint')}</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-dept">{t('tasks.department')}</Label>
                  <NativeSelect id="m-dept" name="departmentId">
                    <option value="">{t('set.taskMetricSharedAllDepts')}</option>
                    {departments
                      .filter((d) => d.is_active)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-en">{t('common.labelEn')}</Label>
                  <Input id="m-en" name="labelEn" placeholder="Posts published" required />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="m-zh">{t('common.labelZh')}</Label>
                  <Input id="m-zh" name="labelZh" placeholder="发布帖子" required />
                </div>
                <SubmitButton>{t('common.add')}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">{t('set.taskMetricTypes')}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('tasks.department')}</TableHead>
                    <TableHead>{t('common.labelEn')}</TableHead>
                    <TableHead>{t('common.labelZh')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {metricTypes.map((m) => (
                    <TableRow key={m.key}>
                      <TableCell className="text-muted-foreground">
                        {m.department_id
                          ? departmentName(m.department_id)
                          : t('set.taskMetricSharedAllDepts')}
                      </TableCell>
                      <TableCell>{m.label_en}</TableCell>
                      <TableCell>{m.label_zh}</TableCell>
                      <TableCell>
                        <StatusBadge isActive={m.is_active} />
                      </TableCell>
                      <TableCell className="text-right">
                        <ArchiveButton
                          action={toggleTaskMetricType}
                          hiddenFields={{ key: m.key }}
                          isActive={m.is_active}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </TabsContent>
    </Tabs>
  );
}
