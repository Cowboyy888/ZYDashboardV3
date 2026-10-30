import { notFound } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import { requirePermission } from '@/lib/auth';
import { hasPermission } from '@/lib/domain/rbac';
import { getProductionOrder } from '@/lib/db/queries';
import { productionCalculation, productionTransitions } from '@/lib/domain/production-orders';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { getLocale } from '@/lib/i18n/locale';
import { translator } from '@/lib/i18n';
import { transitionProductionOrder } from '@/lib/actions/production-orders';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { PageHeader } from '@/components/page-header';
import { ActionForm } from '@/components/forms/action-form';
import { SubmitButton } from '@/components/forms/submit-button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';
export default async function ProductionDetail({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('production:view');
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) notFound();
  const row = await getProductionOrder(id);
  if (!row) notFound();
  const t = translator(await getLocale());
  const calculation = productionCalculation(row.geometry, row.planned_quantity);
  const canManage = hasPermission(user.role, 'production:manage');
  let attachmentUrl: string | undefined;
  if (row.attachment_path) {
    const db = await createSupabaseServerClient();
    const { data } = await db.storage.from('attachments').createSignedUrl(row.attachment_path, 60);
    attachmentUrl = data?.signedUrl;
  }
  const details: [string, string | number | null][] = [
    [t('production.source'), row.sales_order_number ?? t('production.internal')],
    [t('production.customer'), row.customer_reference],
    [t('production.sku'), row.sku_label],
    [t('production.drawing'), row.geometry.meshSpecification],
    [t('production.diameter'), `${row.geometry.wireDiameterMm} mm`],
    [t('production.dimensions'), `${row.geometry.sheetLengthMm} × ${row.geometry.sheetWidthMm} mm`],
    [
      t('production.spacing'),
      `${row.geometry.lengthSpacingMm} × ${row.geometry.widthSpacingMm} mm`,
    ],
    [
      t('production.overhangs'),
      `${row.geometry.overhangLeftMm} / ${row.geometry.overhangRightMm} / ${row.geometry.overhangTopMm} / ${row.geometry.overhangBottomMm} mm`,
    ],
    [t('production.wires'), `${calculation.widthWireCount} / ${calculation.lengthWireCount}`],
    [t('production.quantity'), `${row.planned_quantity} 张`],
    [t('production.area'), `${calculation.totalAreaM2} m²`],
    [t('production.required'), formatDDMMYYYY(row.required_date)],
    [t('production.priority'), t(`production.priority.${row.priority}`)],
    [t('production.line'), row.planned_line],
    [t('production.supervisor'), row.supervisor_name],
    [t('production.internalReason'), row.internal_reason],
    [t('production.notes'), row.notes],
    [t('production.reason'), row.status_reason],
    [
      t('production.approvedAt'),
      row.approved_at
        ? new Intl.DateTimeFormat('en-GB', {
            timeZone: 'Asia/Bangkok',
            dateStyle: 'short',
            timeStyle: 'short',
          }).format(new Date(row.approved_at))
        : null,
    ],
  ];
  return (
    <div>
      <PageHeader
        title={row.order_number}
        description={`${t(`production.status.${row.status}`)} · ${t('production.scope')}`}
      />
      <dl className="mb-6 grid gap-3 rounded-md border p-4 sm:grid-cols-2">
        {details.map(([label, value]) => (
          <div key={label}>
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd
              className={`whitespace-pre-wrap break-words ${label === t('production.supervisor') ? 'font-khmer' : ''}`}
            >
              {value ?? '—'}
            </dd>
          </div>
        ))}
      </dl>
      {attachmentUrl && (
        <a
          className="mb-4 block text-primary underline"
          href={attachmentUrl}
          target="_blank"
          rel="noopener noreferrer"
        >
          {t('production.attachment')}
        </a>
      )}
      {canManage && row.status === 'draft' && (
        <Button asChild>
          <Link href={`/production/${row.id}/edit`}>{t('production.edit')}</Link>
        </Button>
      )}
      {canManage && (
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {productionTransitions(row.status, row.held_from_status)
            .filter((s) => s !== 'approved' || hasPermission(user.role, 'production:approve'))
            .map((status) => (
              <ActionForm
                key={`${row.version}-${status}`}
                action={transitionProductionOrder}
                className="rounded-md border p-4"
              >
                <input type="hidden" name="id" value={row.id} />
                <input type="hidden" name="version" value={row.version} />
                <input type="hidden" name="status" value={status} />
                {['on_hold', 'cancelled'].includes(status) && (
                  <>
                    <Label htmlFor={`reason-${status}`}>{t('production.reason')}</Label>
                    <Textarea id={`reason-${status}`} name="reason" required maxLength={1000} />
                  </>
                )}
                <SubmitButton>{t(`production.action.${status}`)}</SubmitButton>
              </ActionForm>
            ))}
        </div>
      )}
    </div>
  );
}
