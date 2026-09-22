'use client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { useT } from '@/components/i18n-provider';
import {
  createInquiryCustomerType,
  renameInquiryCustomerType,
  toggleInquiryCustomerType,
} from '@/lib/actions/sales-inquiries';
import type { InquiryCustomerTypeRow } from '@/lib/db/types';

export function CustomerTypesManager({
  customerTypes,
}: {
  customerTypes: InquiryCustomerTypeRow[];
}) {
  const { t } = useT();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">{t('set.addCustomerType')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createInquiryCustomerType}>
            <div className="space-y-1.5">
              <Label htmlFor="ct-name">{t('common.name')}</Label>
              <Input id="ct-name" name="name" placeholder="工地（Construction）" required />
            </div>
            <SubmitButton>{t('common.add')}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{t('set.customerTypesTable')}</CardTitle>
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
              {customerTypes.map((ct) => (
                <TableRow key={ct.id}>
                  <TableCell>
                    <ActionForm
                      action={renameInquiryCustomerType}
                      className="flex items-center gap-2 space-y-0"
                    >
                      <input type="hidden" name="id" value={ct.id} />
                      <Input name="name" defaultValue={ct.name} className="h-8 w-56" />
                      <SubmitButton variant="outline" size="sm">
                        {t('common.save')}
                      </SubmitButton>
                    </ActionForm>
                  </TableCell>
                  <TableCell>
                    <Badge variant={ct.is_active ? 'success' : 'secondary'}>
                      {ct.is_active ? t('common.active') : t('common.archived')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionForm action={toggleInquiryCustomerType} className="space-y-0">
                      <input type="hidden" name="id" value={ct.id} />
                      <input type="hidden" name="isActive" value={String(ct.is_active)} />
                      <SubmitButton variant="ghost" size="sm">
                        {ct.is_active ? t('common.archive') : t('common.reactivate')}
                      </SubmitButton>
                    </ActionForm>
                  </TableCell>
                </TableRow>
              ))}
              {customerTypes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t('set.noCustomerTypes')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
