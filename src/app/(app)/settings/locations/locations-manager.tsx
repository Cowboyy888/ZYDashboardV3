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
import { createLocation, updateLocation, toggleLocation } from '@/lib/actions/settings';
import type { LocationRow } from '@/lib/db/types';

export function LocationsManager({ locations }: { locations: LocationRow[] }) {
  const { t } = useT();
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-1">
        <CardHeader>
          <CardTitle className="text-base">{t('set.addLocation')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createLocation}>
            <div className="space-y-1.5">
              <Label htmlFor="loc-name">{t('common.name')}</Label>
              <Input id="loc-name" name="name" placeholder="Storage Room 仓房" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loc-code">{t('common.code')}</Label>
              <Input id="loc-code" name="code" placeholder="storage_room" required />
            </div>
            <SubmitButton>{t('common.add')}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle className="text-base">{t('set.locations')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('common.code')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {locations.map((loc) => (
                <TableRow key={loc.id}>
                  <TableCell>
                    <ActionForm
                      action={updateLocation}
                      className="flex items-center gap-2 space-y-0"
                    >
                      <input type="hidden" name="id" value={loc.id} />
                      <Input name="name" defaultValue={loc.name} className="h-8 w-44" />
                      <SubmitButton variant="outline" size="sm">
                        {t('common.save')}
                      </SubmitButton>
                    </ActionForm>
                  </TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {loc.code}
                  </TableCell>
                  <TableCell>
                    <Badge variant={loc.is_active ? 'success' : 'secondary'}>
                      {loc.is_active ? t('common.active') : t('common.archived')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionForm action={toggleLocation} className="space-y-0">
                      <input type="hidden" name="id" value={loc.id} />
                      <input type="hidden" name="isActive" value={String(loc.is_active)} />
                      <SubmitButton variant="ghost" size="sm">
                        {loc.is_active ? t('common.archive') : t('common.activate')}
                      </SubmitButton>
                    </ActionForm>
                  </TableCell>
                </TableRow>
              ))}
              {locations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    {t('set.noLocations')}
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
