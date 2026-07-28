import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CredentialForm } from '@/components/auth/credential-form';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  const t = translator(await getLocale());
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('auth.signIn')}</CardTitle>
        <CardDescription>{t('app.name')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <CredentialForm mode="signin" />
        <p className="text-center text-sm text-muted-foreground">
          {t('auth.firstTime')}{' '}
          <Link href="/setup" className="font-medium text-primary hover:underline">
            {t('auth.setupOwner')}
          </Link>
        </p>
      </CardContent>
    </Card>
  );
}
