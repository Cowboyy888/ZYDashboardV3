'use client';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { updateUserRole, createUserByAdmin } from '@/lib/actions/settings';
import { ROLES, ROLE_LABELS } from '@/lib/domain/rbac';
import type { ProfileRow } from '@/lib/db/types';

const selectCls =
  'h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const selectClsTall =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function UsersManager({ profiles }: { profiles: ProfileRow[] }) {
  const { t, locale } = useT();
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('set.addUser')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createUserByAdmin}>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="nu-name">{t('auth.name')}</Label>
                <Input id="nu-name" name="fullName" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-email">{t('auth.email')}</Label>
                <Input id="nu-email" name="email" type="email" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-pass">{t('auth.password')}</Label>
                <Input id="nu-pass" name="password" type="password" minLength={8} required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="nu-role">{t('set.role')}</Label>
                <select id="nu-role" name="role" className={selectClsTall} defaultValue="viewer">
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r][locale]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">{t('set.addUserNote')}</p>
            <SubmitButton>{t('set.addUser')}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('set.user')}</TableHead>
                <TableHead>{t('set.currentRole')}</TableHead>
                <TableHead>{t('set.changeRole')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {profiles.map((p) => (
                <TableRow key={p.id}>
                  <TableCell>
                    <div className="font-medium">{p.full_name || p.email}</div>
                    <div className="text-xs text-muted-foreground">{p.email}</div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={p.role === 'owner' ? 'default' : 'secondary'}>
                      {ROLE_LABELS[p.role][locale]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <ActionForm
                      action={updateUserRole}
                      className="flex items-center gap-2 space-y-0"
                    >
                      <input type="hidden" name="userId" value={p.id} />
                      <select name="role" defaultValue={p.role} className={selectCls}>
                        {ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r][locale]}
                          </option>
                        ))}
                      </select>
                      <SubmitButton variant="outline" size="sm">
                        {t('common.save')}
                      </SubmitButton>
                    </ActionForm>
                  </TableCell>
                </TableRow>
              ))}
              {profiles.length === 0 && (
                <TableRow>
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    {t('set.noUsers')}
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
