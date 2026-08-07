'use client';
import { useState, useTransition } from 'react';
import { Loader2, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useT } from '@/components/i18n-provider';
import { createSku } from '@/lib/actions/settings';
import { CONDITIONS, CONDITION_LABELS, buildSkuLabel } from '@/lib/domain/products';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface FamilyOpt {
  id: string;
  name: string;
  nameEnglish: string | null;
}

/**
 * Create a new SKU (product specification) inline, without leaving the
 * current page — for when a Purchase Order line needs a spec that isn't in
 * the catalog yet. Only rendered where the caller already has
 * `products:manage` (checked by the parent, not here — this component is
 * just a client wrapper over the same `createSku` action Settings →
 * Products uses, so server-side RBAC is the real gate either way).
 *
 * Deliberately NOT a `<form action={...}>` — this dialog is always opened
 * from inside another page-level form (the new-PO item rows, or
 * AddPoItemDialog's own form), and React's form-action interception gets
 * confused by a nested `<form>` even though Radix portals the dialog's DOM
 * node out to `document.body` (the nesting is still real in the React fiber
 * tree). Same fix as photo-upload.tsx: `useTransition` + calling the server
 * action directly with a manually-built FormData.
 */
export function NewSpecDialog({
  families,
  onCreated,
}: {
  families: FamilyOpt[];
  onCreated: (sku: { id: string; unit: string; label: string }) => void;
}) {
  const { t, m, locale } = useT();
  const [open, setOpen] = useState(false);
  const [familyId, setFamilyId] = useState('');
  const [condition, setCondition] = useState<(typeof CONDITIONS)[number]>('normal');
  const [diameter, setDiameter] = useState('');
  const [size, setSize] = useState('');
  const [hole, setHole] = useState('');
  const [rodCount, setRodCount] = useState('');
  const [extra, setExtra] = useState('');
  const [unit, setUnit] = useState('张');
  const [minimumLevel, setMinimumLevel] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function reset() {
    setFamilyId('');
    setCondition('normal');
    setDiameter('');
    setSize('');
    setHole('');
    setRodCount('');
    setExtra('');
    setUnit('张');
    setMinimumLevel('0');
    setError(null);
  }

  function onSubmit() {
    if (!familyId || !unit.trim()) {
      setError('Please check the highlighted fields');
      return;
    }
    setError(null);
    start(async () => {
      const fd = new FormData();
      fd.set('familyId', familyId);
      fd.set('condition', condition);
      fd.set('diameter', diameter);
      fd.set('size', size);
      fd.set('hole', hole);
      fd.set('rodCount', rodCount);
      fd.set('extra', extra);
      fd.set('unit', unit);
      fd.set('minimumLevel', minimumLevel);
      const res = await createSku(null, fd);
      if (!res?.ok || !res.data?.id) {
        setError(res?.error ?? 'Failed');
        return;
      }
      const family = families.find((f) => f.id === familyId);
      const label = buildSkuLabel(
        {
          familyName: family?.name ?? '—',
          diameter: diameter || null,
          size: size || null,
          hole: hole || null,
          rodCount: rodCount || null,
          extra: extra || null,
          condition,
          unit,
        },
        locale,
      );
      onCreated({ id: String(res.data.id), unit, label });
      setOpen(false);
      reset();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="h-auto px-2 py-1 text-xs">
          <Plus className="h-3 w-3" /> {t('pur.addNewSpec')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('set.addSpec')}</DialogTitle>
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
                onChange={(e) => setFamilyId(e.target.value)}
              >
                <option value="" disabled>
                  {t('common.select')}
                </option>
                {families.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                    {f.nameEnglish ? ` · ${f.nameEnglish}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-condition">{t('common.condition')}</Label>
              <select
                id="ns-condition"
                className={selectCls}
                value={condition}
                onChange={(e) => setCondition(e.target.value as (typeof CONDITIONS)[number])}
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
                placeholder="9厘"
                value={diameter}
                onChange={(e) => setDiameter(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-size">{t('set.size')}</Label>
              <Input
                id="ns-size"
                placeholder="3×6"
                value={size}
                onChange={(e) => setSize(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-hole">{t('set.hole')}</Label>
              <Input
                id="ns-hole"
                placeholder="20孔"
                value={hole}
                onChange={(e) => setHole(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-rod">{t('set.rod')}</Label>
              <Input
                id="ns-rod"
                placeholder="15根"
                value={rodCount}
                onChange={(e) => setRodCount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-unit">{t('common.unit')}</Label>
              <Input
                id="ns-unit"
                placeholder="张 / 捆"
                required
                value={unit}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ns-min">{t('set.minStock')}</Label>
              <Input
                id="ns-min"
                type="number"
                step="0.001"
                min="0"
                value={minimumLevel}
                onChange={(e) => setMinimumLevel(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ns-extra">{t('set.extra')}</Label>
            <Input
              id="ns-extra"
              placeholder="free-form"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </div>
          {error && <p className="text-sm text-destructive">{m(error)}</p>}
          <Button type="button" disabled={pending} onClick={onSubmit}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t('set.addSpecBtn')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
