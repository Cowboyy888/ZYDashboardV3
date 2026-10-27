'use client';
import { useActionState, useEffect, useMemo, useState } from 'react';
import { FileText, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useT } from '@/components/i18n-provider';
import { saveWireMeshDrawing } from '@/lib/actions/wire-mesh-drawings';
import { calculateWireMesh, type WireMeshInput } from '@/lib/domain/wire-mesh';
import { formatDDMMYYYY } from '@/lib/domain/datetime';
import { WireMeshPreview } from '@/components/wire-mesh-preview';
import type { WireMeshDrawingRow } from '@/lib/db/types';
import type { ActionState } from '@/lib/actions/types';

export type DrawingReference = {
  key: string;
  kind: 'quotation' | 'order';
  id: string;
  label: string;
  customerName: string;
};

function inputFor(row?: WireMeshDrawingRow): WireMeshInput {
  return {
    sheetLengthMm: row?.sheet_length_mm ?? 3000,
    sheetWidthMm: row?.sheet_width_mm ?? 1500,
    lengthSpacingMm: row?.length_spacing_mm ?? 200,
    widthSpacingMm: row?.width_spacing_mm ?? 200,
    overhangLeftMm: row?.overhang_left_mm ?? 0,
    overhangRightMm: row?.overhang_right_mm ?? 0,
    overhangTopMm: row?.overhang_top_mm ?? 0,
    overhangBottomMm: row?.overhang_bottom_mm ?? 0,
    quantity: row?.quantity ?? 1,
  };
}

export function WireMeshDrawingsClient({
  drawings,
  references,
  canManage,
}: {
  drawings: WireMeshDrawingRow[];
  references: DrawingReference[];
  canManage: boolean;
}) {
  const { t } = useT();
  const [editing, setEditing] = useState<WireMeshDrawingRow | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <div className="space-y-4">
      {canManage && (
        <div className="flex justify-end">
          <Button onClick={() => setCreating(true)}>{t('mesh.newDrawing')}</Button>
        </div>
      )}
      <Card>
        <CardContent className="overflow-x-auto p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('mesh.reference')}</TableHead>
                <TableHead>{t('sal.customer')}</TableHead>
                <TableHead>{t('mesh.specification')}</TableHead>
                <TableHead>{t('common.date')}</TableHead>
                <TableHead>{t('mesh.totalArea')}</TableHead>
                {canManage && <TableHead className="text-right">{t('common.actions')}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {drawings.map((drawing) => {
                const calculation = calculateWireMesh(inputFor(drawing));
                const reference = drawing.quotation_id
                  ? references.find(
                      (item) => item.kind === 'quotation' && item.id === drawing.quotation_id,
                    )
                  : references.find(
                      (item) => item.kind === 'order' && item.id === drawing.sales_order_id,
                    );
                return (
                  <TableRow key={drawing.id}>
                    <TableCell>{reference?.label ?? '—'}</TableCell>
                    <TableCell>{drawing.customer_name}</TableCell>
                    <TableCell>{drawing.mesh_specification}</TableCell>
                    <TableCell>{formatDDMMYYYY(drawing.updated_at)}</TableCell>
                    <TableCell>{calculation.totalAreaM2.toFixed(3)} m²</TableCell>
                    {canManage && (
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => setEditing(drawing)}>
                            {t('common.edit')}
                          </Button>
                          <Button asChild variant="ghost" size="sm">
                            <a
                              href={`/api/export/wire-mesh-drawings/${drawing.id}/pdf`}
                              target="_blank"
                              rel="noopener noreferrer"
                            >
                              <FileText className="h-4 w-4" />
                              <span className="sr-only">PDF</span>
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              window.open(
                                `/sales/wire-mesh-drawings/${drawing.id}/print`,
                                '_blank',
                                'noopener,noreferrer',
                              )
                            }
                          >
                            <Printer className="h-4 w-4" />
                            <span className="sr-only">{t('mesh.print')}</span>
                          </Button>
                        </div>
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
              {drawings.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={canManage ? 6 : 5}
                    className="py-8 text-center text-muted-foreground"
                  >
                    {t('mesh.noDrawings')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {canManage && (
        <Dialog
          open={creating || !!editing}
          onOpenChange={(open) => {
            if (!open) {
              setCreating(false);
              setEditing(null);
            }
          }}
        >
          <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editing ? t('mesh.editDrawing') : t('mesh.newDrawing')}</DialogTitle>
            </DialogHeader>
            <DrawingForm
              key={editing?.id ?? 'new'}
              row={editing ?? undefined}
              references={references}
              onDone={() => {
                setCreating(false);
                setEditing(null);
              }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

function DrawingForm({
  row,
  references,
  onDone,
}: {
  row?: WireMeshDrawingRow;
  references: DrawingReference[];
  onDone: () => void;
}) {
  const { t, m } = useT();
  const initialReference = row?.quotation_id
    ? `quotation:${row.quotation_id}`
    : row?.sales_order_id
      ? `order:${row.sales_order_id}`
      : '';
  const [referenceKey, setReferenceKey] = useState(initialReference);
  const [values, setValues] = useState(inputFor(row));
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    saveWireMeshDrawing,
    null,
  );
  const reference = references.find((item) => item.key === referenceKey);
  const calculation = useMemo(() => calculateWireMesh(values), [values]);
  useEffect(() => {
    if (state?.ok) onDone();
  }, [state, onDone]);
  const update = (key: keyof WireMeshInput, value: string) =>
    setValues((current) => ({ ...current, [key]: Number(value) }));
  const field = (id: string, key: keyof WireMeshInput, label: string, min = 0) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        name={key}
        type="number"
        min={min}
        step="0.001"
        value={values[key]}
        onChange={(event) => update(key, event.target.value)}
        required
      />
    </div>
  );
  return (
    <form action={formAction} className="space-y-4">
      {row && <input type="hidden" name="id" value={row.id} />}
      <input
        type="hidden"
        name="quotationId"
        value={reference?.kind === 'quotation' ? reference.id : ''}
      />
      <input
        type="hidden"
        name="salesOrderId"
        value={reference?.kind === 'order' ? reference.id : ''}
      />
      <div className="grid gap-3 md:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="wm-reference">{t('mesh.reference')}</Label>
          <NativeSelect
            id="wm-reference"
            value={referenceKey}
            onChange={(event) => setReferenceKey(event.target.value)}
            required
          >
            <option value="">{t('common.select')}</option>
            {references.map((item) => (
              <option key={item.key} value={item.key}>
                {item.kind === 'quotation' ? t('sal.quotations') : t('sal.orders')} · {item.label} ·{' '}
                {item.customerName}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label>{t('sal.customer')}</Label>
          <div className="flex h-10 items-center rounded-md border bg-muted px-3 text-sm">
            {reference?.customerName ?? '—'}
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="wm-spec">{t('mesh.specification')}</Label>
          <Input
            id="wm-spec"
            name="meshSpecification"
            defaultValue={row?.mesh_specification}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="wm-dia">{t('mesh.wireDiameter')}</Label>
          <Input
            id="wm-dia"
            name="wireDiameterMm"
            type="number"
            min="0.001"
            step="0.001"
            defaultValue={row?.wire_diameter_mm}
            required
          />
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">{t('mesh.sheetDimensions')}</legend>
          {field('wm-length', 'sheetLengthMm', t('mesh.length'), 0.001)}
          {field('wm-width', 'sheetWidthMm', t('mesh.width'), 0.001)}
        </fieldset>
        <fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-medium">{t('mesh.spacing')}</legend>
          {field('wm-length-spacing', 'lengthSpacingMm', t('mesh.lengthSpacing'), 0.001)}
          {field('wm-width-spacing', 'widthSpacingMm', t('mesh.widthSpacing'), 0.001)}
        </fieldset>
      </div>
      <fieldset className="grid gap-3 rounded-md border p-3 sm:grid-cols-4">
        <legend className="px-1 text-sm font-medium">{t('mesh.edgeOverhangs')}</legend>
        {field('wm-left', 'overhangLeftMm', t('mesh.left'))}
        {field('wm-right', 'overhangRightMm', t('mesh.right'))}
        {field('wm-top', 'overhangTopMm', t('mesh.top'))}
        {field('wm-bottom', 'overhangBottomMm', t('mesh.bottom'))}
      </fieldset>
      <div className="max-w-xs">{field('wm-quantity', 'quantity', t('quo.quantity'), 1)}</div>
      <WireMeshPreview input={values} />
      <div className="grid gap-2 rounded-md bg-muted p-3 text-sm sm:grid-cols-2 lg:grid-cols-5">
        <div>
          {t('mesh.lengthWires')}: <b>{calculation.lengthWireCount ?? '—'}</b>
        </div>
        <div>
          {t('mesh.widthWires')}: <b>{calculation.widthWireCount ?? '—'}</b>
        </div>
        <div>
          {t('mesh.areaPerSheet')}: <b>{calculation.areaPerSheetM2.toFixed(3)} m²</b>
        </div>
        <div>
          {t('mesh.totalArea')}: <b>{calculation.totalAreaM2.toFixed(3)} m²</b>
        </div>
        <div>
          {t('quo.quantity')}: <b>{values.quantity}</b>
        </div>
      </div>
      {state?.error && <p className="text-sm text-destructive">{m(state.error)}</p>}
      <Button type="submit" disabled={pending || calculation.errors.length > 0}>
        {t('common.save')}
      </Button>
    </form>
  );
}
