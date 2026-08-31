'use client';
import { useActionState, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Download,
  FileText,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  Trash2,
  Wallet,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { FormError } from '@/components/forms/form-error';
import { useT } from '@/components/i18n-provider';
import {
  createQuotation,
  updateQuotation,
  updateQuotationDepositPct,
  deleteQuotation,
  issueDocument,
  markPaid,
} from '@/lib/actions/quotations';
import { quotationTotals, lineAmount, validUntil, type DocumentKind } from '@/lib/domain/quotation';
import { formatDDMMYYYY, businessDate } from '@/lib/domain/datetime';
import type { ActionState } from '@/lib/actions/types';
import type { QuotationRow, QuotationItemRow } from '@/lib/db/types';
import type { MessageKey } from '@/lib/i18n';

type Opt = { id: string; name: string };

const usd = (n: number) => `$${n.toFixed(2)}`;

interface DraftLine {
  description: string;
  wireDia: string;
  steelGrade: string;
  unit: string;
  unitPrice: string;
  quantity: string;
  /** Reference only — not part of the amount calculation. */
  totalSheets: string;
}
const BLANK_LINE: DraftLine = {
  description: '',
  wireDia: '',
  steelGrade: '',
  unit: 'm²',
  unitPrice: '',
  quantity: '',
  totalSheets: '',
};

export function QuotationsClient({
  quotations,
  items,
  customers,
  vatRegistered,
  canManage,
  linkedOrders,
  isSearching = false,
}: {
  quotations: QuotationRow[];
  items: QuotationItemRow[];
  customers: Opt[];
  /** Company's CURRENT VAT status (invoice_settings) — informational only on
   * this form; a new quotation snapshots this at creation, see
   * actions/quotations.ts createQuotation. */
  vatRegistered: boolean;
  canManage: boolean;
  linkedOrders: { quotationId: string; soId: string; soNumber: string | null }[];
  isSearching?: boolean;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState<QuotationRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [deleting, setDeleting] = useState<QuotationRow | null>(null);
  const [editingDepositPct, setEditingDepositPct] = useState<QuotationRow | null>(null);

  const itemsByQuotation = useMemo(() => {
    const map = new Map<string, QuotationItemRow[]>();
    for (const it of items) {
      if (!map.has(it.quotation_id)) map.set(it.quotation_id, []);
      map.get(it.quotation_id)!.push(it);
    }
    return map;
  }, [items]);

  const orderByQuotation = useMemo(
    () => new Map(linkedOrders.map((o) => [o.quotationId, o])),
    [linkedOrders],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <Button asChild variant="outline">
          <a href="/api/export/quotations">
            <Download className="h-4 w-4" /> {t('quo.downloadBalancePaid')}
          </a>
        </Button>
        {canManage && (
          <Button
            variant={showCreate ? 'secondary' : 'default'}
            onClick={() => setShowCreate((s) => !s)}
          >
            {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showCreate ? t('common.close') : t('quo.new')}
          </Button>
        )}
      </div>

      {canManage && showCreate && (
        <QuotationForm
          action={createQuotation}
          customers={customers}
          vatRegistered={vatRegistered}
          onDone={() => setShowCreate(false)}
        />
      )}

      {canManage && editing && (
        <QuotationForm
          action={updateQuotation}
          customers={customers}
          quotation={editing}
          lines={itemsByQuotation.get(editing.id) ?? []}
          onDone={() => setEditing(null)}
        />
      )}

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('quo.customer')}</TableHead>
                <TableHead>{t('quo.date')}</TableHead>
                <TableHead className="text-right">{t('quo.subtotal')}</TableHead>
                <TableHead className="text-right">{t('quo.deposit')}</TableHead>
                <TableHead className="text-right">{t('quo.balance')}</TableHead>
                <TableHead>{t('quo.documents')}</TableHead>
                <TableHead className="text-right">{t('quo.generatePdf')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {quotations.map((q) => {
                const lines = itemsByQuotation.get(q.id) ?? [];
                const totals = quotationTotals(
                  lines.map((l) => ({
                    unitPrice: Number(l.unit_price),
                    quantity: Number(l.quantity),
                  })),
                  Number(q.deposit_pct),
                );
                return (
                  <TableRow key={q.id}>
                    <TableCell>
                      <div className="font-medium">{q.customer_name}</div>
                      {q.project_site && (
                        <div className="text-xs text-muted-foreground">{q.project_site}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {lines.length} {t('quo.lines')}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">
                      {formatDDMMYYYY(q.quotation_date)}
                      <div className="text-xs text-muted-foreground">
                        {t('quo.validUntil')}{' '}
                        {formatDDMMYYYY(validUntil(q.quotation_date, q.valid_days))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {usd(totals.subtotal)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(totals.depositDue)}
                      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground">
                        {totals.depositPercent}%{q.deposit_paid_on ? ` · ${t('quo.paid')}` : ''}
                        {canManage && (
                          <button
                            type="button"
                            className="text-muted-foreground hover:text-foreground"
                            title={t('quo.editDepositPct')}
                            onClick={() => setEditingDepositPct(q)}
                          >
                            <Pencil className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {usd(totals.balanceDue)}
                      <div className="text-xs text-muted-foreground">
                        {totals.balancePercent}%{q.balance_paid_on ? ` · ${t('quo.paid')}` : ''}
                      </div>
                    </TableCell>
                    <TableCell className="space-y-0.5 text-xs">
                      <DocBadge no={q.quotation_no} label="Q" />
                      <DocBadge no={q.deposit_no} label="DP" />
                      <DocBadge no={q.balance_no} label="BL" />
                      {orderByQuotation.has(q.id) && (
                        <div>
                          <Link
                            href={`/sales/orders/${orderByQuotation.get(q.id)!.soId}`}
                            className="inline-flex items-center gap-0.5 text-primary underline underline-offset-2"
                          >
                            {t('quo.linkedSalesOrder')}{' '}
                            {orderByQuotation.get(q.id)!.soNumber ?? '—'}
                          </Link>
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <DocButton
                          icon={<FileText className="h-4 w-4" />}
                          label={t('quo.docQuotation')}
                          quotationId={q.id}
                          kind="quotation"
                          canManage={canManage}
                        />
                        <DocButton
                          icon={<Receipt className="h-4 w-4" />}
                          label={t('quo.docDeposit')}
                          quotationId={q.id}
                          kind="deposit"
                          canManage={canManage}
                        />
                        <DocButton
                          icon={<Wallet className="h-4 w-4" />}
                          label={t('quo.docBalance')}
                          quotationId={q.id}
                          kind="balance"
                          canManage={canManage}
                        />
                        {canManage && (
                          <>
                            <Button variant="ghost" size="sm" onClick={() => setEditing(q)}>
                              {t('common.edit')}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive"
                              onClick={() => setDeleting(q)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                      {canManage && (
                        <div className="mt-1 flex justify-end gap-1">
                          {!q.deposit_paid_on && (
                            <ActionForm action={markPaid} className="space-y-0">
                              <input type="hidden" name="id" value={q.id} />
                              <input type="hidden" name="which" value="deposit" />
                              <SubmitButton variant="ghost" size="sm">
                                {t('quo.markDepositPaid')}
                              </SubmitButton>
                            </ActionForm>
                          )}
                          {!q.balance_paid_on && (
                            <ActionForm action={markPaid} className="space-y-0">
                              <input type="hidden" name="id" value={q.id} />
                              <input type="hidden" name="which" value="balance" />
                              <SubmitButton variant="ghost" size="sm">
                                {t('quo.markBalancePaid')}
                              </SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {quotations.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground">
                    {isSearching ? t('quo.noneMatch') : t('quo.none')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <DeleteDialog row={deleting} onDone={() => setDeleting(null)} t={t} />
      <EditDepositPctDialog
        row={editingDepositPct}
        open={!!editingDepositPct}
        onOpenChange={(o) => !o && setEditingDepositPct(null)}
      />
    </div>
  );
}

function DocBadge({ no, label }: { no: string | null; label: string }) {
  if (!no) return null;
  return (
    <div>
      <Badge variant="outline" className="font-mono text-[10px]">
        {label} · {no}
      </Badge>
    </div>
  );
}

/** Quick inline edit for just the deposit % — opened from the list row's pencil icon. */
function EditDepositPctDialog({
  row,
  open,
  onOpenChange,
}: {
  row: QuotationRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useT();
  const [value, setValue] = useState('30');
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (row) {
      setValue(String(Math.round(Number(row.deposit_pct) * 10000) / 100));
      setError(null);
    }
  }, [row]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!row) return;
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set('id', row.id);
      fd.set('depositPct', value);
      const res = await updateQuotationDepositPct(null, fd);
      if (!res?.ok) {
        setError(res?.error ?? 'Failed');
        return;
      }
      onOpenChange(false);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm text-left">
        <DialogHeader>
          <DialogTitle>{t('quo.editDepositPct')}</DialogTitle>
          <DialogDescription>{t('quo.editDepositPctHint')}</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="edp-pct">{t('quo.depositPct')}</Label>
            <Input
              id="edp-pct"
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              autoFocus
            />
          </div>
          <FormError error={error} />
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                {t('common.cancel')}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Opens the real PDF from /api/sales/quotations/[id]/pdf in a new tab, where
 * the browser's own native PDF viewer supplies Print and Save controls —
 * reliable on iPhone and PC alike (the PDF is served `inline`, not
 * `attachment`; see src/lib/reports/pdf.ts). Viewers who cannot manage sales
 * just get a plain link — no number to assign.
 *
 * Managers issue the document number (once) first, via a server action — the
 * PDF only shows the number once it's assigned. Since that step is async,
 * the tab is opened SYNCHRONOUSLY inside the click handler (before the
 * await) and redirected once the number is ready: mobile browsers (iOS
 * Safari especially) only allow `window.open` when it traces directly back
 * to a user gesture; opening it afterward in a `.then`/effect gets silently
 * blocked with no error.
 */
function DocButton({
  icon,
  label,
  quotationId,
  kind,
  canManage,
}: {
  icon: React.ReactNode;
  label: string;
  quotationId: string;
  kind: DocumentKind;
  canManage: boolean;
}) {
  const { t, m } = useT();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const pdfUrl = `/api/sales/quotations/${quotationId}/pdf?kind=${kind}`;

  if (!canManage) {
    return (
      <Button asChild variant="outline" size="sm">
        <a href={pdfUrl} target="_blank" rel="noopener noreferrer">
          {icon}
          {label}
        </a>
      </Button>
    );
  }

  function onClick() {
    const w = window.open('', '_blank', 'width=900,height=1000');
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set('quotationId', quotationId);
      fd.set('kind', kind);
      const res = await issueDocument(null, fd);
      if (!res?.ok) {
        w?.close();
        setError(res?.error ?? 'Failed to issue document');
        return;
      }
      if (!w) {
        setError(t('common.popupBlocked'));
        return;
      }
      // Refresh so the list's document badge picks up the newly-issued number.
      router.refresh();
      w.location.href = pdfUrl;
    });
  }

  return (
    <div className="inline-flex flex-col items-start gap-1">
      <Button type="button" variant="outline" size="sm" onClick={onClick} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {label}
      </Button>
      {error && <span className="text-xs text-destructive">{m(error)}</span>}
    </div>
  );
}

function DeleteDialog({
  row,
  onDone,
  t,
}: {
  row: QuotationRow | null;
  onDone: () => void;
  t: (k: MessageKey) => string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteQuotation, null);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={!!row} onOpenChange={(o) => !o && onDone()}>
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle>{t('quo.deleteTitle')}</DialogTitle>
          <DialogDescription>
            {t('quo.deleteBody')} {row?.customer_name}
          </DialogDescription>
        </DialogHeader>
        <FormError error={state?.error} />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onDone}>
            {t('common.cancel')}
          </Button>
          <form action={formAction}>
            <input type="hidden" name="id" value={row?.id ?? ''} />
            <Button type="submit" variant="destructive" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.delete')}
            </Button>
          </form>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Create / edit form with live subtotal, deposit and balance. */
function QuotationForm({
  action,
  customers,
  quotation,
  lines: existing,
  vatRegistered,
  onDone,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  customers: Opt[];
  quotation?: QuotationRow;
  lines?: QuotationItemRow[];
  /** Shown only on the create form — an edit never changes a quotation's own VAT snapshot. */
  vatRegistered?: boolean;
  onDone: () => void;
}) {
  const { t, m } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);

  const [depositPct, setDepositPct] = useState(
    String(Math.round(Number(quotation?.deposit_pct ?? 0.3) * 10000) / 100),
  );
  const [lines, setLines] = useState<DraftLine[]>(
    existing && existing.length > 0
      ? existing.map((l) => ({
          description: l.description,
          wireDia: l.wire_dia ?? '',
          steelGrade: l.steel_grade ?? '',
          unit: l.unit,
          unitPrice: String(l.unit_price),
          quantity: String(l.quantity),
          totalSheets: l.total_sheets == null ? '' : String(l.total_sheets),
        }))
      : [{ ...BLANK_LINE }],
  );

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const totals = quotationTotals(
    lines.map((l) => ({ unitPrice: parseFloat(l.unitPrice), quantity: parseFloat(l.quantity) })),
    parseFloat(depositPct) || 0,
  );

  const setLine = (i: number, patch: Partial<DraftLine>) =>
    setLines((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch } : l)));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{quotation ? t('quo.edit') : t('quo.new')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="space-y-4">
          {quotation && <input type="hidden" name="id" value={quotation.id} />}

          {!quotation && (
            <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>
                {t('quo.invoiceType')}:{' '}
                <strong>{vatRegistered ? t('quo.taxInvoice') : t('quo.commercialInvoice')}</strong>
              </span>
              <span>·</span>
              <span>
                {t('quo.vatStatus')}:{' '}
                <strong>{vatRegistered ? t('quo.vatOn') : t('quo.vatOff')}</strong>
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="q-customer">
                {t('quo.customer')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="q-customer"
                name="customerName"
                defaultValue={quotation?.customer_name ?? ''}
                className={state?.fieldErrors?.customerName ? 'border-destructive' : ''}
              />
              {state?.fieldErrors?.customerName && (
                <p className="text-xs text-destructive">{m(state.fieldErrors.customerName)}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-customer-id">{t('quo.linkCustomer')}</Label>
              <NativeSelect
                id="q-customer-id"
                name="customerId"
                defaultValue={quotation?.customer_id ?? ''}
              >
                <option value="">{t('common.select')}</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-contact">{t('quo.contact')}</Label>
              <Input id="q-contact" name="contact" defaultValue={quotation?.contact ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-site">{t('quo.projectSite')}</Label>
              <Input id="q-site" name="projectSite" defaultValue={quotation?.project_site ?? ''} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-date">{t('quo.date')}</Label>
              <Input
                id="q-date"
                name="quotationDate"
                type="date"
                defaultValue={quotation?.quotation_date ?? businessDate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-valid">{t('quo.validDays')}</Label>
              <Input
                id="q-valid"
                name="validDays"
                type="number"
                min="0"
                defaultValue={quotation?.valid_days ?? 15}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-deposit">{t('quo.depositPct')}</Label>
              <Input
                id="q-deposit"
                name="depositPct"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={depositPct}
                onChange={(e) => setDepositPct(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="q-basis">{t('quo.pricingBasis')}</Label>
              <Input
                id="q-basis"
                name="pricingBasis"
                placeholder="Rate (USD per m²)"
                defaultValue={quotation?.pricing_basis ?? ''}
              />
            </div>
          </div>

          {/* Line items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>{t('quo.lineItems')}</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setLines((ls) => [...ls, { ...BLANK_LINE }])}
              >
                <Plus className="h-4 w-4" /> {t('quo.addLine')}
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid gap-2 rounded-md border p-2 sm:grid-cols-8">
                  <Input
                    name="itemDescription"
                    value={l.description}
                    onChange={(e) => setLine(i, { description: e.target.value })}
                    placeholder={t('quo.description')}
                    className="sm:col-span-2"
                  />
                  <Input
                    name="itemWireDia"
                    value={l.wireDia}
                    onChange={(e) => setLine(i, { wireDia: e.target.value })}
                    placeholder={t('quo.wireDia')}
                  />
                  <Input
                    name="itemSteelGrade"
                    value={l.steelGrade}
                    onChange={(e) => setLine(i, { steelGrade: e.target.value })}
                    placeholder={t('quo.steelGrade')}
                  />
                  <Input
                    name="itemUnit"
                    value={l.unit}
                    onChange={(e) => setLine(i, { unit: e.target.value })}
                    placeholder={t('common.unit')}
                  />
                  <Input
                    name="itemUnitPrice"
                    type="number"
                    step="0.0001"
                    min="0"
                    value={l.unitPrice}
                    onChange={(e) => setLine(i, { unitPrice: e.target.value })}
                    placeholder={t('quo.unitPrice')}
                  />
                  <Input
                    name="itemTotalSheets"
                    type="number"
                    step="0.001"
                    min="0"
                    value={l.totalSheets}
                    onChange={(e) => setLine(i, { totalSheets: e.target.value })}
                    placeholder={t('quo.totalSheets')}
                  />
                  <div className="flex gap-1">
                    <Input
                      name="itemQuantity"
                      type="number"
                      step="0.001"
                      min="0"
                      value={l.quantity}
                      onChange={(e) => setLine(i, { quantity: e.target.value })}
                      placeholder={t('quo.quantity')}
                    />
                    {lines.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={t('common.removeLine')}
                        onClick={() => setLines((ls) => ls.filter((_, n) => n !== i))}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  <div className="text-right text-sm tabular-nums text-muted-foreground sm:col-span-8">
                    {t('quo.amount')}:{' '}
                    <strong>
                      {usd(
                        lineAmount({
                          unitPrice: parseFloat(l.unitPrice),
                          quantity: parseFloat(l.quantity),
                        }),
                      )}
                    </strong>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Live totals — the workbook's formulas */}
          <div className="flex flex-wrap gap-x-6 gap-y-1 rounded-md bg-muted px-3 py-2 text-sm">
            <span>
              {t('quo.subtotal')}: <strong className="tabular-nums">{usd(totals.subtotal)}</strong>
            </span>
            <span className="text-primary">
              {t('quo.deposit')} ({totals.depositPercent}%):{' '}
              <strong className="tabular-nums">{usd(totals.depositDue)}</strong>
            </span>
            <span>
              {t('quo.balance')} ({totals.balancePercent}%):{' '}
              <strong className="tabular-nums">{usd(totals.balanceDue)}</strong>
            </span>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="q-notes">{t('common.notes')}</Label>
            <Textarea id="q-notes" name="notes" rows={2} defaultValue={quotation?.notes ?? ''} />
          </div>

          <FormError error={state?.error} />

          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('common.save')}
            </Button>
            <Button type="button" variant="ghost" onClick={onDone}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
