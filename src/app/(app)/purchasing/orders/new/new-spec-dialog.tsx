'use client';
import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useT } from '@/components/i18n-provider';
import { createSkuForPurchaseOrder } from '@/lib/actions/purchasing';
import {
  CONDITIONS,
  CONDITION_LABELS,
  buildSkuLabel,
  type ConditionCode,
} from '@/lib/domain/products';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface FamilyOpt {
  id: string;
  name: string;
  defaultUnit: string;
}

export interface NewSkuOption {
  id: string;
  unit: string;
  label: string;
}

/** "+ New specification" — quick-adds a SKU not yet in the catalog, inline from a PO line. */
export function NewSpecDialog({
  families,
  onCreated,
}: {
  families: FamilyOpt[];
  onCreated: (sku: NewSkuOption) => void;
}) {
  const { t, locale } = useT();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [familyId, setFamilyId] = useState('');
  const [unit, setUnit] = useState('');
  const [fields, setFields] = useState({
    diameter: '',
    size: '',
    hole: '',
    rodCount: '',
    extra: '',
    condition: 'normal' as ConditionCode,
  });

  // A <form> here would submit fine in isolation, but this dialog always
  // renders inside the "New purchase order" page's own outer <form> — React
  // bubbles synthetic events through the COMPONENT tree, not the DOM tree, so
  // even though Radix portals this dialog's markup out to document.body, its
  // submit event still bubbles into the outer form's onSubmit and gets
  // preventDefault()'d before this one's action ever fires. Calling the
  // server action directly from a plain button, like PhotoUpload does,
  // sidesteps the whole issue.
  function onSubmit() {
    if (!familyId || !unit.trim()) {
      setError('Please check the highlighted fields');
      return;
    }
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set('familyId', familyId);
      fd.set('condition', fields.condition);
      fd.set('diameter', fields.diameter);
      fd.set('size', fields.size);
      fd.set('hole', fields.hole);
      fd.set('rodCount', fields.rodCount);
      fd.set('extra', fields.extra);
      fd.set('unit', unit);
      const res = await createSkuForPurchaseOrder(null, fd);
      if (!res?.ok) {
        setError(res?.error ?? 'Failed to add specification');
        return;
      }
      const family = families.find((f) => f.id === familyId);
      const savedUnit = String(res.data?.unit ?? unit);
      onCreated({
        id: String(res.data?.id),
        unit: savedUnit,
        label: buildSkuLabel(
          {
            familyName: family?.name ?? '—',
            diameter: fields.diameter,
            size: fields.size,
            hole: fields.hole,
            rodCount: fields.rodCount,
            extra: fields.extra,
            condition: fields.condition,
            unit: savedUnit,
          },
          locale,
        ),
      });
      setOpen(false);
      setFamilyId('');
      setUnit('');
      setFields({ diameter: '', size: '', hole: '', rodCount: '', extra: '', condition: 'normal' });
    });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm">
          <Plus className="h-4 w-4" /> {t('pur.newSpec')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('pur.newSpec')}</DialogTitle>
          <DialogDescription>{t('pur.newSpecHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ns-family">{t('set.family')}</Label>
              <select
                id="ns-family"
                className={selectCls}
                required
                value={familyId}
                onChange={(e) => {
                  setFamilyId(e.target.value);
                  const f = families.find((x) => x.id === e.target.value);
                  if (f) setUnit(f.defaultUnit);
                }}
              >
                <option value="" disabled>
                  {t('common.select')}
                </option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-condition">{t('common.condition')}</Label>
              <select
                id="ns-condition"
                className={selectCls}
                value={fields.condition}
                onChange={(e) =>
                  setFields((p) => ({ ...p, condition: e.target.value as ConditionCode }))
                }
              >
                {CONDITIONS.map((c) => (
                  <option key={c} value={c}>
                    {CONDITION_LABELS[c][locale]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-dia">{t('set.diameter')}</Label>
              <Input
                id="ns-dia"
                name="diameter"
                placeholder="9厘"
                value={fields.diameter}
                onChange={(e) => setFields((p) => ({ ...p, diameter: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-size">{t('set.size')}</Label>
              <Input
                id="ns-size"
                name="size"
                placeholder="3×6"
                value={fields.size}
                onChange={(e) => setFields((p) => ({ ...p, size: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-hole">{t('set.hole')}</Label>
              <Input
                id="ns-hole"
                name="hole"
                placeholder="20孔"
                value={fields.hole}
                onChange={(e) => setFields((p) => ({ ...p, hole: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-rod">{t('set.rod')}</Label>
              <Input
                id="ns-rod"
                name="rodCount"
                placeholder="15根"
                value={fields.rodCount}
                onChange={(e) => setFields((p) => ({ ...p, rodCount: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-unit">{t('common.unit')}</Label>
              <Input
                id="ns-unit"
                name="unit"
                placeholder="张 / 捆"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ns-extra">{t('set.extra')}</Label>
            <Input
              id="ns-extra"
              name="extra"
              placeholder="free-form"
              value={fields.extra}
              onChange={(e) => setFields((p) => ({ ...p, extra: e.target.value }))}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="button" onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('set.addSpecBtn')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
