import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BootstrapForm } from '@/components/auth/bootstrap-form';
import { getOwnerExists } from '@/lib/db/queries';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function SetupPage() {
  const t = translator(await getLocale());
  const ownerExists = await getOwnerExists();

  if (ownerExists) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('auth.alreadyConfigured')}</CardTitle>
          <CardDescription>{t('auth.alreadyConfiguredDesc')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t('auth.signIn')}
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.ownerSetup')}</CardTitle>
        <CardDescription>{t('auth.ownerSetupDesc')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <BootstrapForm />
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.haveAccount')}{' '}
          <Link href="/login" className="font-medium text-primary hover:underline">
            {t('auth.signIn')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
