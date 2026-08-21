'use client';
import { useActionState, useEffect, useMemo, useRef, useState } from 'react';
import { Archive, ArchiveRestore, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react';
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
import { useT } from '@/components/i18n-provider';
import {
  createFamily,
  createSku,
  deleteFamily,
  toggleFamily,
  toggleSku,
  updateFamily,
} from '@/lib/actions/settings';
import {
  CONDITIONS,
  CONDITION_LABELS,
  buildSkuLabel,
  selectableFamilies,
} from '@/lib/domain/products';
import type { ActionState } from '@/lib/actions/types';
import type { ProductFamilyRow, SkuRow } from '@/lib/db/types';

type FamilyFilter = 'active' | 'archived' | 'all';

export function ProductsManager({
  families,
  skus,
}: {
  families: ProductFamilyRow[];
  skus: SkuRow[];
}) {
  const { t, locale } = useT();
  const familyName = new Map(families.map((f) => [f.id, f.name]));

  // Spec count per family (from all SKUs, active or archived).
  const specCount = useMemo(() => {
    const map = new Map<string, number>();
    for (const s of skus) map.set(s.family_id, (map.get(s.family_id) ?? 0) + 1);
    return map;
  }, [skus]);

  const [showCreate, setShowCreate] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FamilyFilter>('active');

  // Archived families disappear from NEW spec/inventory/purchase/etc. forms.
  const activeFamilies = useMemo(() => selectableFamilies(families), [families]);

  const visibleFamilies = useMemo(() => {
    const q = query.trim().toLowerCase();
    return families.filter((f) => {
      if (filter === 'active' && !f.is_active) return false;
      if (filter === 'archived' && f.is_active) return false;
      if (!q) return true;
      return [f.name, f.name_english, f.code, f.description]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [families, filter, query]);

  const filterBtn = (value: FamilyFilter, label: string) => (
    <Button
      type="button"
      size="sm"
      variant={filter === value ? 'default' : 'outline'}
      onClick={() => setFilter(value)}
    >
      {label}
    </Button>
  );

  return (
    <div className="space-y-4">
      {/* --- Product families --------------------------------------------- */}
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">
              {t('set.families')} ({families.length})
            </CardTitle>
            {/* Primary action — always visible at the top, never in a menu. */}
            <Button
              variant={showCreate ? 'secondary' : 'default'}
              onClick={() => setShowCreate((s) => !s)}
            >
              {showCreate ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showCreate ? t('common.close') : t('set.addFamily')}
            </Button>
          </div>
          {/* Search + Active / Archived / All filters. */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t('set.searchFamilies')}
                className="h-9 w-56 pl-8"
              />
            </div>
            <div className="flex gap-1">
              {filterBtn('active', t('common.active'))}
              {filterBtn('archived', t('common.archived'))}
              {filterBtn('all', t('common.all'))}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {showCreate && <CreateFamilyForm onDone={() => setShowCreate(false)} />}

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('common.name')}</TableHead>
                <TableHead>{t('set.defaultUnit')}</TableHead>
                <TableHead className="text-right">{t('set.specCount')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleFamilies.map((family) => (
                <FamilyRow
                  key={family.id}
                  family={family}
                  specCount={specCount.get(family.id) ?? 0}
                />
              ))}
              {visibleFamilies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {families.length === 0 ? t('set.noFamilies') : t('set.noFamiliesMatch')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* --- Specifications (SKUs) — new specs only for ACTIVE families ---- */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('set.addSpec')}</CardTitle>
        </CardHeader>
        <CardContent>
          <ActionForm action={createSku}>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="sku-family">{t('set.family')}</Label>
                <NativeSelect id="sku-family" name="familyId" required defaultValue="">
                  <option value="" disabled>
                    {t('common.select')}
                  </option>
                  {activeFamilies.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                      {f.name_english ? ` · ${f.name_english}` : ''}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-condition">{t('common.condition')}</Label>
                <NativeSelect id="sku-condition" name="condition" defaultValue="normal">
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {CONDITION_LABELS[c][locale]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-dia">{t('set.diameter')}</Label>
                <Input id="sku-dia" name="diameter" placeholder="9厘" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-size">{t('set.size')}</Label>
                <Input id="sku-size" name="size" placeholder="3×6" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-hole">{t('set.hole')}</Label>
                <Input id="sku-hole" name="hole" placeholder="20孔" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-rod">{t('set.rod')}</Label>
                <Input id="sku-rod" name="rodCount" placeholder="15根" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-unit">{t('common.unit')}</Label>
                <Input id="sku-unit" name="unit" placeholder="张 / 捆" defaultValue="张" required />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="sku-min">{t('set.minStock')}</Label>
                <Input
                  id="sku-min"
                  name="minimumLevel"
                  type="number"
                  step="0.001"
                  min="0"
                  defaultValue="0"
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sku-extra">{t('set.extra')}</Label>
              <Input id="sku-extra" name="extra" placeholder="free-form" />
            </div>
            <SubmitButton>{t('set.addSpecBtn')}</SubmitButton>
          </ActionForm>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t('set.specifications')} ({skus.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('inv.specification')}</TableHead>
                <TableHead>{t('common.unit')}</TableHead>
                <TableHead className="text-right">{t('common.min')}</TableHead>
                <TableHead>{t('common.status')}</TableHead>
                <TableHead className="text-right">{t('common.actions')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {skus.map((sku) => (
                <TableRow key={sku.id}>
                  <TableCell className="max-w-[420px] truncate">
                    {buildSkuLabel(
                      {
                        familyName: familyName.get(sku.family_id) ?? '—',
                        diameter: sku.diameter,
                        size: sku.size,
                        hole: sku.hole,
                        rodCount: sku.rod_count,
                        extra: sku.extra,
                        condition: sku.condition,
                        unit: sku.unit,
                      },
                      locale,
                    )}
                  </TableCell>
                  <TableCell>{sku.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">{sku.minimum_level}</TableCell>
                  <TableCell>
                    <Badge variant={sku.is_active ? 'success' : 'secondary'}>
                      {sku.is_active ? t('common.active') : t('common.archived')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <ActionForm action={toggleSku} className="space-y-0">
                      <input type="hidden" name="id" value={sku.id} />
                      <input type="hidden" name="isActive" value={String(sku.is_active)} />
                      <SubmitButton variant="ghost" size="sm">
                        {sku.is_active ? t('common.archive') : t('common.activate')}
                      </SubmitButton>
                    </ActionForm>
                  </TableCell>
                </TableRow>
              ))}
              {skus.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground">
                    {t('set.noSpecs')}
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

// --- Create form -------------------------------------------------------------

function CreateFamilyForm({ onDone }: { onDone: () => void }) {
  const { t, m } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(createFamily, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) {
      formRef.current?.reset();
      onDone();
    }
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  const nameErr = state?.fieldErrors?.name;

  return (
    <form ref={formRef} action={formAction} className="space-y-3 rounded-md border bg-muted/30 p-4">
      <div className="text-sm font-medium">{t('set.newFamily')}</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="fam-name">
            {t('set.familyNameZh')} <span className="text-destructive">*</span>
          </Label>
          <Input
            id="fam-name"
            name="name"
            placeholder={t('set.familyNameZhPlaceholder')}
            className={nameErr ? 'border-destructive' : ''}
          />
          {nameErr && <p className="text-xs text-destructive">{m(nameErr)}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fam-en">{t('set.familyNameEn')}</Label>
          <Input id="fam-en" name="nameEnglish" placeholder={t('set.familyNameEnPlaceholder')} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="fam-unit">{t('set.defaultUnit')}</Label>
          <Input id="fam-unit" name="defaultUnit" placeholder="张 / 捆" defaultValue="张" />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="fam-desc">{t('set.familyDesc')}</Label>
          <Textarea id="fam-desc" name="description" rows={2} />
        </div>
      </div>
      {state?.error && (
        <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
          {m(state.error)}
        </p>
      )}
      <p className="text-xs text-muted-foreground">{t('set.familyAfterCreateHint')}</p>
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
  );
}

// --- Family row + dialogs ----------------------------------------------------

function FamilyRow({ family, specCount }: { family: ProductFamilyRow; specCount: number }) {
  const { t } = useT();
  const [editOpen, setEditOpen] = useState(false);
  const [toggleOpen, setToggleOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <TableRow>
      <TableCell>
        <div className="font-medium">{family.name}</div>
        {family.name_english && (
          <div className="text-xs text-muted-foreground">{family.name_english}</div>
        )}
        {family.description && (
          <div className="text-xs text-muted-foreground">{family.description}</div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline">{family.default_unit}</Badge>
      </TableCell>
      <TableCell className="text-right tabular-nums">{specCount}</TableCell>
      <TableCell>
        <Badge variant={family.is_active ? 'success' : 'secondary'}>
          {family.is_active ? t('common.active') : t('common.archived')}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1">
          <Button variant="ghost" size="sm" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4" /> {t('common.edit')}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setToggleOpen(true)}>
            {family.is_active ? (
              <>
                <Archive className="h-4 w-4" /> {t('common.archive')}
              </>
            ) : (
              <>
                <ArchiveRestore className="h-4 w-4" /> {t('common.reactivate')}
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-destructive hover:text-destructive"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-4 w-4" /> {t('common.delete')}
          </Button>
        </div>

        <EditFamilyDialog family={family} open={editOpen} onOpenChange={setEditOpen} />
        <ToggleFamilyDialog family={family} open={toggleOpen} onOpenChange={setToggleOpen} />
        <DeleteFamilyDialog family={family} open={deleteOpen} onOpenChange={setDeleteOpen} />
      </TableCell>
    </TableRow>
  );
}

function EditFamilyDialog({
  family,
  open,
  onOpenChange,
}: {
  family: ProductFamilyRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, m } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(updateFamily, null);
  const nameErr = state?.fieldErrors?.name;

  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle>{t('set.editFamily')}</DialogTitle>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="id" value={family.id} />
          <div className="space-y-1.5">
            <Label htmlFor={`ef-name-${family.id}`}>
              {t('set.familyNameZh')} <span className="text-destructive">*</span>
            </Label>
            <Input
              id={`ef-name-${family.id}`}
              name="name"
              defaultValue={family.name}
              className={nameErr ? 'border-destructive' : ''}
            />
            {nameErr && <p className="text-xs text-destructive">{m(nameErr)}</p>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor={`ef-en-${family.id}`}>{t('set.familyNameEn')}</Label>
              <Input
                id={`ef-en-${family.id}`}
                name="nameEnglish"
                defaultValue={family.name_english ?? ''}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`ef-unit-${family.id}`}>{t('set.defaultUnit')}</Label>
              <Input
                id={`ef-unit-${family.id}`}
                name="defaultUnit"
                defaultValue={family.default_unit}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`ef-desc-${family.id}`}>{t('set.familyDesc')}</Label>
            <Textarea
              id={`ef-desc-${family.id}`}
              name="description"
              rows={2}
              defaultValue={family.description ?? ''}
            />
          </div>
          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              {m(state.error)}
            </p>
          )}
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

function ToggleFamilyDialog({
  family,
  open,
  onOpenChange,
}: {
  family: ProductFamilyRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(toggleFamily, null);
  const archiving = family.is_active;

  useEffect(() => {
    if (state?.ok) onOpenChange(false);
  }, [state]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle>
            {archiving ? t('set.confirmArchiveFamilyTitle') : t('set.confirmReactivateFamilyTitle')}
          </DialogTitle>
          <DialogDescription>
            {archiving ? t('set.confirmArchiveFamilyBody') : t('set.confirmReactivateFamilyBody')}
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="flex justify-end gap-2">
          <input type="hidden" name="id" value={family.id} />
          <input type="hidden" name="isActive" value={String(family.is_active)} />
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t('common.cancel')}
            </Button>
          </DialogClose>
          <Button type="submit" disabled={pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {archiving ? t('set.archiveFamily') : t('set.reactivateFamily')}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function DeleteFamilyDialog({
  family,
  open,
  onOpenChange,
}: {
  family: ProductFamilyRow;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { t, m } = useT();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(deleteFamily, null);
  const [toggleState, toggleActionFn, togglePending] = useActionState<ActionState, FormData>(
    toggleFamily,
    null,
  );

  useEffect(() => {
    if (state?.ok || toggleState?.ok) onOpenChange(false);
  }, [state, toggleState]); // eslint-disable-line react-hooks/exhaustive-deps

  // Delete was blocked because the family has history — offer Archive instead.
  const blocked = Boolean(state && !state.ok && state.error);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="text-left">
        <DialogHeader>
          <DialogTitle>{t('set.confirmDeleteFamilyTitle')}</DialogTitle>
          <DialogDescription>{t('set.confirmDeleteFamilyBody')}</DialogDescription>
        </DialogHeader>

        {blocked && (
          <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {m(state!.error)}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {t('common.cancel')}
            </Button>
          </DialogClose>

          {blocked && family.is_active ? (
            <form action={toggleActionFn}>
              <input type="hidden" name="id" value={family.id} />
              <input type="hidden" name="isActive" value={String(family.is_active)} />
              <Button type="submit" disabled={togglePending}>
                {togglePending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Archive className="h-4 w-4" /> {t('set.archiveFamily')}
              </Button>
            </form>
          ) : (
            <form action={formAction}>
              <input type="hidden" name="id" value={family.id} />
              <Button type="submit" variant="destructive" disabled={pending}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Trash2 className="h-4 w-4" /> {t('common.delete')}
              </Button>
            </form>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
