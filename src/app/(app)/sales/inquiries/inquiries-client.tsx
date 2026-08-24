'use client';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { Download, FileText, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
  createInquiry,
  updateInquiry,
  deleteInquiry,
  addFollowup,
  createInquiryCustomerType,
  toggleInquiryCustomerType,
  createInquiryStatus,
  toggleInquiryStatus,
} from '@/lib/actions/sales-inquiries';
import {
  priceDifference,
  estimatedProfit,
  summarizeInquiries,
  type StatusCategory,
} from '@/lib/domain/sales-inquiry';
import type { ActionState } from '@/lib/actions/types';
import type {
  SalesInquiryRow,
  InquiryFollowupRow,
  InquiryCustomerTypeRow,
  InquiryStatusRow,
} from '@/lib/db/types';

type Opt = { id: string; name: string };

const num = (s: string): number | null => {
  const v = parseFloat(s);
  return Number.isFinite(v) ? v : null;
};
const fmt = (v: number | null | undefined, d = 2): string =>
  v == null || !Number.isFinite(Number(v))
    ? '—'
    : Number(v).toLocaleString(undefined, { maximumFractionDigits: d });

export function InquiriesClient({
  inquiries,
  followups,
  customerTypes,
  statuses,
  employees,
  families,
  canManage,
}: {
  inquiries: SalesInquiryRow[];
  followups: InquiryFollowupRow[];
  customerTypes: InquiryCustomerTypeRow[];
  statuses: InquiryStatusRow[];
  employees: Opt[];
  families: Opt[];
  canManage: boolean;
}) {
  const { t } = useT();

  const empName = useMemo(() => new Map(employees.map((e) => [e.id, e.name])), [employees]);
  const familyName = useMemo(() => new Map(families.map((f) => [f.id, f.name])), [families]);
  const statusById = useMemo(() => new Map(statuses.map((s) => [s.id, s])), [statuses]);
  const inquiryById = useMemo(() => new Map(inquiries.map((i) => [i.id, i])), [inquiries]);
  const activeTypes = customerTypes.filter((c) => c.is_active);
  const activeStatuses = statuses.filter((s) => s.is_active);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [customerTypeFilter, setCustomerTypeFilter] = useState('');
  const [salespersonFilter, setSalespersonFilter] = useState('');
  const [productFilter, setProductFilter] = useState('');

  const filteredInquiries = useMemo(() => {
    const q = search.trim().toLowerCase();
    return inquiries.filter((i) => {
      if (statusFilter && i.status_id !== statusFilter) return false;
      if (customerTypeFilter && i.customer_type_id !== customerTypeFilter) return false;
      if (salespersonFilter && i.salesperson_id !== salespersonFilter) return false;
      if (productFilter && i.family_id !== productFilter) return false;
      if (
        q &&
        !`${i.customer_name} ${i.company_name ?? ''} ${i.inquiry_no ?? ''}`
          .toLowerCase()
          .includes(q)
      )
        return false;
      return true;
    });
  }, [inquiries, search, statusFilter, customerTypeFilter, salespersonFilter, productFilter]);

  const summary = useMemo(
    () =>
      summarizeInquiries(
        filteredInquiries.map((i) => ({
          factoryCost: i.factory_cost,
          quotedPrice: i.quoted_price,
          targetPrice: i.target_price,
          finalPrice: i.final_price,
          areaPerSheet: i.area_per_sheet,
          quantity: i.quantity,
          statusCategory: (statusById.get(i.status_id ?? '')?.category ??
            null) as StatusCategory | null,
          familyId: i.family_id,
          salespersonId: i.salesperson_id,
        })),
      ),
    [filteredInquiries, statusById],
  );

  // Filter option sets — only statuses/types/salespeople/products actually
  // used by an inquiry, not the full master list, so the dropdowns stay
  // relevant instead of listing options with nothing behind them.
  const statusOptions = useMemo(
    () => statuses.filter((s) => inquiries.some((i) => i.status_id === s.id)),
    [statuses, inquiries],
  );
  const customerTypeOptions = useMemo(
    () => customerTypes.filter((c) => inquiries.some((i) => i.customer_type_id === c.id)),
    [customerTypes, inquiries],
  );
  const salespersonOptions = useMemo(
    () => employees.filter((e) => inquiries.some((i) => i.salesperson_id === e.id)),
    [employees, inquiries],
  );
  const productOptions = useMemo(
    () => families.filter((f) => inquiries.some((i) => i.family_id === f.id)),
    [families, inquiries],
  );

  const [showCreate, setShowCreate] = useState(false);
  const [editing, setEditing] = useState<SalesInquiryRow | null>(null);
  const [deleting, setDeleting] = useState<SalesInquiryRow | null>(null);

  const statusBadge = (id: string | null) => {
    const s = id ? statusById.get(id) : undefined;
    if (!s) return <span className="text-muted-foreground">—</span>;
    const variant =
      s.category === 'won' ? 'success' : s.category === 'lost' ? 'destructive' : 'secondary';
    return <Badge variant={variant}>{s.name}</Badge>;
  };

  const kpis: Array<{ label: string; value: string }> = [
    { label: t('inq.kpiTotal'), value: String(summary.totalInquiries) },
    { label: t('inq.kpiValue'), value: `$${fmt(summary.totalQuotationValue)}` },
    { label: t('inq.kpiWon'), value: String(summary.wonOrders) },
    { label: t('inq.kpiLost'), value: String(summary.lostOrders) },
    { label: t('inq.kpiConversion'), value: `${(summary.conversionRate * 100).toFixed(0)}%` },
    { label: t('inq.kpiProfit'), value: `$${fmt(summary.wonProfit)}` },
    { label: t('inq.kpiPending'), value: String(summary.pendingFollowups) },
  ];

  return (
    <Tabs defaultValue="inquiries" className="space-y-4">
      <TabsList>
        <TabsTrigger value="inquiries">{t('inq.tabInquiries')}</TabsTrigger>
        <TabsTrigger value="followups">{t('inq.tabFollowups')}</TabsTrigger>
        {canManage && <TabsTrigger value="lists">{t('inq.tabLists')}</TabsTrigger>}
      </TabsList>

      {/* --- Inquiries -------------------------------------------------------- */}
      <TabsContent value="inquiries" className="space-y-4">
        <Card>
          <CardContent className="flex flex-wrap items-end gap-3 pt-6">
            <div className="min-w-[220px] flex-1 space-y-1.5">
              <Label htmlFor="inq-search">{t('common.search')}</Label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="inq-search"
                  placeholder={t('inq.searchPlaceholder')}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-8"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-filter-status">{t('common.status')}</Label>
              <NativeSelect
                id="inq-filter-status"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="w-40"
              >
                <option value="">{t('common.all')}</option>
                {statusOptions.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-filter-type">{t('inq.customerType')}</Label>
              <NativeSelect
                id="inq-filter-type"
                value={customerTypeFilter}
                onChange={(e) => setCustomerTypeFilter(e.target.value)}
                className="w-40"
              >
                <option value="">{t('common.all')}</option>
                {customerTypeOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-filter-sales">{t('inq.salesperson')}</Label>
              <NativeSelect
                id="inq-filter-sales"
                value={salespersonFilter}
                onChange={(e) => setSalespersonFilter(e.target.value)}
                className="w-40"
              >
                <option value="">{t('common.all')}</option>
                {salespersonOptions.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inq-filter-product">{t('inq.product')}</Label>
              <NativeSelect
                id="inq-filter-product"
                value={productFilter}
                onChange={(e) => setProductFilter(e.target.value)}
                className="w-40"
              >
                <option value="">{t('common.all')}</option>
                {productOptions.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {kpis.map((k) => (
            <Card key={k.label}>
              <CardContent className="p-3">
                <div className="text-xs text-muted-foreground">{k.label}</div>
                <div className="text-lg font-semibold tabular-nums">{k.value}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="flex flex-wrap justify-end gap-2">
          <Button asChild variant="outline">
            <a href="/api/export/inquiries">
              <Download className="h-4 w-4" /> {t('inq.downloadExcel')}
            </a>
          </Button>
          <Button asChild variant="outline">
            <a href="/api/export/inquiries/pdf" target="_blank" rel="noopener noreferrer">
              <FileText className="h-4 w-4" /> {t('inq.downloadPdf')}
            </a>
          </Button>
          {canManage && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> {t('inq.new')}
            </Button>
          )}
        </div>

        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inq.no')}</TableHead>
                  <TableHead>{t('inq.date')}</TableHead>
                  <TableHead>{t('inq.customer')}</TableHead>
                  <TableHead>{t('inq.product')}</TableHead>
                  <TableHead className="text-right">{t('inq.qty')}</TableHead>
                  <TableHead className="text-right">{t('inq.quoted')}</TableHead>
                  <TableHead className="text-right">{t('inq.target')}</TableHead>
                  <TableHead className="text-right">{t('inq.diff')}</TableHead>
                  <TableHead className="text-right">{t('inq.profit')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                  {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredInquiries.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {i.inquiry_no ?? '—'}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm">{i.inquiry_date}</TableCell>
                    <TableCell>
                      <div className="font-medium">{i.customer_name}</div>
                      {i.company_name && (
                        <div className="text-xs text-muted-foreground">{i.company_name}</div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm">
                      {(i.family_id && familyName.get(i.family_id)) || '—'}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(i.quantity, 0)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(i.quoted_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">{fmt(i.target_price)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {fmt(i.price_difference)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {i.estimated_profit == null ? '—' : `$${fmt(i.estimated_profit)}`}
                    </TableCell>
                    <TableCell>{statusBadge(i.status_id)}</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(i)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleting(i)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
                {filteredInquiries.length === 0 && (
                  <TableRow>
                    <TableCell
                      colSpan={canManage ? 11 : 10}
                      className="text-center text-muted-foreground"
                    >
                      {inquiries.length === 0 ? t('inq.none') : t('inq.noMatches')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* --- Follow-ups ------------------------------------------------------- */}
      <TabsContent value="followups" className="space-y-4">
        {canManage && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('inq.addFollowup')}</CardTitle>
            </CardHeader>
            <CardContent>
              <ActionForm action={addFollowup}>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-inquiry">{t('inq.no')}</Label>
                    <NativeSelect id="fu-inquiry" name="inquiryId" required defaultValue="">
                      <option value="" disabled>
                        {t('common.select')}
                      </option>
                      {inquiries.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.inquiry_no} · {i.customer_name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-date">{t('inq.date')}</Label>
                    <Input id="fu-date" name="followUpDate" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-next">{t('inq.nextFollowup')}</Label>
                    <Input id="fu-next" name="nextFollowUpDate" type="date" />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-resp">{t('inq.responsible')}</Label>
                    <NativeSelect id="fu-resp" name="responsibleId" defaultValue="">
                      <option value="">{t('common.select')}</option>
                      {employees.map((e) => (
                        <option key={e.id} value={e.id}>
                          {e.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-status">{t('common.status')}</Label>
                    <NativeSelect id="fu-status" name="statusId" defaultValue="">
                      <option value="">{t('common.select')}</option>
                      {activeStatuses.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </NativeSelect>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-prev">{t('inq.previousAction')}</Label>
                    <Textarea id="fu-prev" name="previousAction" rows={2} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="fu-resp2">{t('inq.customerResponse')}</Label>
                    <Textarea id="fu-resp2" name="customerResponse" rows={2} />
                  </div>
                </div>
                <SubmitButton>{t('inq.recordFollowup')}</SubmitButton>
              </ActionForm>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="overflow-x-auto p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('inq.date')}</TableHead>
                  <TableHead>{t('inq.customer')}</TableHead>
                  <TableHead>{t('inq.no')}</TableHead>
                  <TableHead>{t('inq.previousAction')}</TableHead>
                  <TableHead>{t('inq.customerResponse')}</TableHead>
                  <TableHead>{t('inq.nextFollowup')}</TableHead>
                  <TableHead>{t('inq.responsible')}</TableHead>
                  <TableHead>{t('common.status')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {followups.map((f) => {
                  const inq = inquiryById.get(f.inquiry_id);
                  return (
                    <TableRow key={f.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {f.follow_up_date}
                      </TableCell>
                      <TableCell className="text-sm">{inq?.customer_name ?? '—'}</TableCell>
                      <TableCell className="whitespace-nowrap font-mono text-xs">
                        {inq?.inquiry_no ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-sm">
                        {f.previous_action ?? '—'}
                      </TableCell>
                      <TableCell className="max-w-[220px] text-sm">
                        {f.customer_response ?? '—'}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm">
                        {f.next_follow_up_date ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {(f.responsible_id && empName.get(f.responsible_id)) || '—'}
                      </TableCell>
                      <TableCell>{statusBadge(f.status_id)}</TableCell>
                    </TableRow>
                  );
                })}
                {followups.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground">
                      {t('inq.noFollowups')}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </TabsContent>

      {/* --- Lists ------------------------------------------------------------ */}
      {canManage && (
        <TabsContent value="lists" className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <ListManager
              title={t('inq.customerTypes')}
              rows={customerTypes}
              addAction={createInquiryCustomerType}
              toggleAction={toggleInquiryCustomerType}
            />
            <StatusManager statuses={statuses} />
          </div>
        </TabsContent>
      )}

      {/* Dialogs */}
      {canManage && (
        <>
          <Dialog open={showCreate} onOpenChange={setShowCreate}>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto text-left">
              <DialogHeader>
                <DialogTitle>{t('inq.new')}</DialogTitle>
                <DialogDescription>{t('inq.formHint')}</DialogDescription>
              </DialogHeader>
              <InquiryForm
                action={createInquiry}
                employees={employees}
                families={families}
                customerTypes={activeTypes}
                statuses={activeStatuses}
                onDone={() => setShowCreate(false)}
              />
            </DialogContent>
          </Dialog>

          <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
            <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto text-left">
              <DialogHeader>
                <DialogTitle>
                  {t('inq.edit')} {editing?.inquiry_no ?? ''}
                </DialogTitle>
              </DialogHeader>
              {editing && (
                <InquiryForm
                  action={updateInquiry}
                  row={editing}
                  employees={employees}
                  families={families}
                  customerTypes={activeTypes}
                  statuses={activeStatuses}
                  onDone={() => setEditing(null)}
                />
              )}
            </DialogContent>
          </Dialog>

          <DeleteInquiryDialog row={deleting} onDone={() => setDeleting(null)} />
        </>
      )}
    </Tabs>
  );

  function ListManager({
    title,
    rows,
    addAction,
    toggleAction,
  }: {
    title: string;
    rows: InquiryCustomerTypeRow[];
    addAction: (s: ActionState, f: FormData) => Promise<ActionState>;
    toggleAction: (s: ActionState, f: FormData) => Promise<ActionState>;
  }) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ActionForm action={addAction} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor={`add-${title}`}>{t('common.name')}</Label>
              <Input id={`add-${title}`} name="name" required />
            </div>
            <SubmitButton>{t('common.add')}</SubmitButton>
          </ActionForm>
          <div className="divide-y rounded-md border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className={r.is_active ? '' : 'text-muted-foreground line-through'}>
                  {r.name}
                </span>
                <ActionForm action={toggleAction} className="space-y-0">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="isActive" value={String(r.is_active)} />
                  <SubmitButton variant="ghost" size="sm">
                    {r.is_active ? t('common.archive') : t('common.reactivate')}
                  </SubmitButton>
                </ActionForm>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  function StatusManager({ statuses: rows }: { statuses: InquiryStatusRow[] }) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('inq.statuses')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <ActionForm action={createInquiryStatus} className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label htmlFor="add-status">{t('common.name')}</Label>
              <Input id="add-status" name="name" required />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="add-status-cat">{t('inq.category')}</Label>
              <NativeSelect id="add-status-cat" name="category" defaultValue="open">
                <option value="open">{t('inq.catOpen')}</option>
                <option value="won">{t('inq.catWon')}</option>
                <option value="lost">{t('inq.catLost')}</option>
              </NativeSelect>
            </div>
            <SubmitButton>{t('common.add')}</SubmitButton>
          </ActionForm>
          <div className="divide-y rounded-md border">
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  <span className={r.is_active ? '' : 'text-muted-foreground line-through'}>
                    {r.name}
                  </span>
                  <Badge
                    variant={
                      r.category === 'won'
                        ? 'success'
                        : r.category === 'lost'
                          ? 'destructive'
                          : 'secondary'
                    }
                  >
                    {t(
                      `inq.cat${r.category === 'won' ? 'Won' : r.category === 'lost' ? 'Lost' : 'Open'}`,
                    )}
                  </Badge>
                </span>
                <ActionForm action={toggleInquiryStatus} className="space-y-0">
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="isActive" value={String(r.is_active)} />
                  <SubmitButton variant="ghost" size="sm">
                    {r.is_active ? t('common.archive') : t('common.reactivate')}
                  </SubmitButton>
                </ActionForm>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  function DeleteInquiryDialog({
    row,
    onDone,
  }: {
    row: SalesInquiryRow | null;
    onDone: () => void;
  }) {
    const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteInquiry, null);
    useEffect(() => {
      if (state?.ok) onDone();
    }, [state]); // eslint-disable-line react-hooks/exhaustive-deps
    return (
      <Dialog open={!!row} onOpenChange={(o) => !o && onDone()}>
        <DialogContent className="text-left">
          <DialogHeader>
            <DialogTitle>{t('inq.deleteTitle')}</DialogTitle>
            <DialogDescription>
              {t('inq.deleteBody')} {row?.inquiry_no ?? ''}
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
}

// --- Inquiry create/edit form -------------------------------------------------

function InquiryForm({
  action,
  row,
  employees,
  families,
  customerTypes,
  statuses,
  onDone,
}: {
  action: (s: ActionState, f: FormData) => Promise<ActionState>;
  row?: SalesInquiryRow;
  employees: Opt[];
  families: Opt[];
  customerTypes: InquiryCustomerTypeRow[];
  statuses: InquiryStatusRow[];
  onDone: () => void;
}) {
  const { t, m } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, null);
  const formRef = useRef<HTMLFormElement>(null);

  // Live-computed grey columns.
  const [quoted, setQuoted] = useState(row?.quoted_price?.toString() ?? '');
  const [target, setTarget] = useState(row?.target_price?.toString() ?? '');
  const [finalP, setFinalP] = useState(row?.final_price?.toString() ?? '');
  const [cost, setCost] = useState(row?.factory_cost?.toString() ?? '');
  const [area, setArea] = useState(row?.area_per_sheet?.toString() ?? '');
  const [qty, setQty] = useState(row?.quantity?.toString() ?? '');

  const pd = priceDifference(num(quoted), num(target));
  const ep = estimatedProfit({
    factoryCost: num(cost),
    quotedPrice: num(quoted),
    targetPrice: num(target),
    finalPrice: num(finalP),
    areaPerSheet: num(area),
    quantity: num(qty),
  });

  useEffect(() => {
    if (state?.ok) onDone();
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const err = (k: string) =>
    state?.fieldErrors?.[k] ? (
      <p className="text-xs text-destructive">{m(state.fieldErrors[k])}</p>
    ) : null;

  const field = (label: string, name: string, defaultValue?: string | null, type = 'text') => (
    <div className="space-y-1.5">
      <Label htmlFor={`if-${name}`}>{label}</Label>
      <Input id={`if-${name}`} name={name} type={type} defaultValue={defaultValue ?? ''} />
    </div>
  );

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      {row && <input type="hidden" name="id" value={row.id} />}

      {/* Customer + meta */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="if-customerName">
            {t('inq.customer')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="if-customerName"
            name="customerName"
            defaultValue={row?.customer_name ?? ''}
            className={state?.fieldErrors?.customerName ? 'border-destructive' : ''}
          />
          {err('customerName')}
        </div>
        {field(t('inq.company'), 'companyName', row?.company_name)}
        {field(t('inq.contact'), 'contact', row?.contact)}
        {field(t('inq.date'), 'inquiryDate', row?.inquiry_date ?? '', 'date')}
        <div className="space-y-1.5">
          <Label htmlFor="if-salesperson">{t('inq.salesperson')}</Label>
          <NativeSelect
            id="if-salesperson"
            name="salespersonId"
            defaultValue={row?.salesperson_id ?? ''}
          >
            <option value="">{t('common.select')}</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="if-type">{t('inq.customerType')}</Label>
          <NativeSelect
            id="if-type"
            name="customerTypeId"
            defaultValue={row?.customer_type_id ?? ''}
          >
            <option value="">{t('common.select')}</option>
            {customerTypes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>

      {/* Product spec */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="if-family">{t('inq.product')}</Label>
          <NativeSelect id="if-family" name="familyId" defaultValue={row?.family_id ?? ''}>
            <option value="">{t('common.select')}</option>
            {families.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {field(t('inq.specification'), 'specification', row?.specification)}
        {field(t('inq.diameter'), 'diameter', row?.diameter)}
        {field(t('inq.sheetSize'), 'sheetSize', row?.sheet_size)}
        {field(t('inq.meshOpening'), 'meshOpening', row?.mesh_opening)}
        <div className="space-y-1.5">
          <Label htmlFor="if-area">{t('inq.area')}</Label>
          <Input
            id="if-area"
            name="areaPerSheet"
            type="number"
            step="0.001"
            value={area}
            onChange={(e) => setArea(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="if-qty">{t('inq.qty')}</Label>
          <Input
            id="if-qty"
            name="quantity"
            type="number"
            step="0.01"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
          />
        </div>
        {field(t('inq.delivery'), 'deliveryLocation', row?.delivery_location)}
      </div>

      {/* Pricing ($/m²) */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5">
          <Label htmlFor="if-cost">{t('inq.cost')}</Label>
          <Input
            id="if-cost"
            name="factoryCost"
            type="number"
            step="0.0001"
            value={cost}
            onChange={(e) => setCost(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="if-quoted">{t('inq.quoted')}</Label>
          <Input
            id="if-quoted"
            name="quotedPrice"
            type="number"
            step="0.0001"
            value={quoted}
            onChange={(e) => setQuoted(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="if-target">{t('inq.target')}</Label>
          <Input
            id="if-target"
            name="targetPrice"
            type="number"
            step="0.0001"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="if-final">{t('inq.final')}</Label>
          <Input
            id="if-final"
            name="finalPrice"
            type="number"
            step="0.0001"
            value={finalP}
            onChange={(e) => setFinalP(e.target.value)}
          />
        </div>
      </div>

      {/* Derived preview */}
      <div className="flex flex-wrap gap-4 rounded-md bg-muted px-3 py-2 text-sm">
        <span>
          {t('inq.diff')}: <strong className="tabular-nums">{fmt(pd)}</strong>
        </span>
        <span>
          {t('inq.profit')}:{' '}
          <strong className="tabular-nums">{ep == null ? '—' : `$${fmt(ep)}`}</strong>
        </span>
      </div>

      {/* Status + follow-up */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="if-status">{t('common.status')}</Label>
          <NativeSelect id="if-status" name="statusId" defaultValue={row?.status_id ?? ''}>
            <option value="">{t('common.select')}</option>
            {statuses.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </NativeSelect>
        </div>
        {field(t('inq.followupDate'), 'followUpDate', row?.follow_up_date ?? '', 'date')}
        {field(t('inq.nextAction'), 'nextAction', row?.next_action)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="if-fnotes">{t('inq.followupNotes')}</Label>
          <Textarea
            id="if-fnotes"
            name="followUpNotes"
            rows={2}
            defaultValue={row?.follow_up_notes ?? ''}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="if-remarks">{t('inq.remarks')}</Label>
          <Textarea id="if-remarks" name="remarks" rows={2} defaultValue={row?.remarks ?? ''} />
        </div>
      </div>

      <FormError error={state?.error} />

      <div className="flex justify-end gap-2">
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            <X className="h-4 w-4" /> {t('common.cancel')}
          </Button>
        </DialogClose>
        <Button type="submit" disabled={pending}>
          {pending && <Loader2 className="h-4 w-4 animate-spin" />}
          {t('common.save')}
        </Button>
      </div>
    </form>
  );
}
