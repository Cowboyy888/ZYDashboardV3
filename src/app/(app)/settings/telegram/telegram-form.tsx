'use client';
import { useActionState, useEffect, useRef, useState } from 'react';
import { AlertTriangle, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { SubmitButton } from '@/components/forms/submit-button';
import { SendNowButton } from '@/components/telegram/send-now-button';
import { useT } from '@/components/i18n-provider';
import {
  saveTelegramSettings,
  sendMorningNow,
  sendAfternoonNow,
  sendInventoryNow,
  testAttendanceConnection,
  testInventoryConnection,
} from '@/lib/actions/telegram';
import { formatDateTime } from '@/lib/domain/datetime';
import { isBeforeManualEntry } from '@/lib/domain/report-schedule';
import type { ActionState } from '@/lib/actions/types';

const selectCls =
  'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

/** Browser-safe view of one destination — the real chat id never reaches here. */
export interface TelegramDestinationView {
  configured: boolean;
  masked: string | null;
  groupEnabled: boolean;
  lastStatus: 'sent' | 'failed' | null;
  lastError: string | null;
  lastSentAt: string | null;
}

/** Browser-safe view of the whole settings row (see page.tsx for how it's built). */
export interface TelegramSettingsView {
  morningEnabled: boolean;
  afternoonEnabled: boolean;
  inventoryEnabled: boolean;
  morningTime: string;
  afternoonTime: string;
  inventoryTime: string;
  reportLanguage: 'en' | 'zh';
  attendance: TelegramDestinationView;
  inventory: TelegramDestinationView;
}

function LastSendStatus({ dest }: { dest: TelegramDestinationView }) {
  const { t } = useT();
  if (!dest.lastStatus) {
    return <p className="text-xs text-muted-foreground">{t('tg.neverSent')}</p>;
  }
  return (
    <div className="space-y-1 text-xs">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {t('tg.lastSent')}:
        <Badge variant={dest.lastStatus === 'sent' ? 'success' : 'destructive'}>
          {dest.lastStatus === 'sent' ? t('tg.statusSent') : t('tg.statusFailed')}
        </Badge>
        {dest.lastSentAt && <span>{formatDateTime(dest.lastSentAt)}</span>}
      </div>
      {dest.lastStatus === 'failed' && dest.lastError && (
        <p className="text-destructive">
          {t('tg.lastError')}: {dest.lastError}
        </p>
      )}
    </div>
  );
}

function DestinationCard({
  title,
  dest,
  chatIdFieldName,
  chatIdClearFieldName,
  groupEnabledFieldName,
  placeholder,
  testAction,
  children,
}: {
  title: string;
  dest: TelegramDestinationView;
  chatIdFieldName: string;
  chatIdClearFieldName: string;
  groupEnabledFieldName: string;
  placeholder: string;
  testAction: () => Promise<ActionState>;
  children: React.ReactNode;
}) {
  const { t } = useT();
  const [clear, setClear] = useState(false);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-base">
          {title}
          <label className="flex items-center gap-2 text-xs font-normal text-muted-foreground">
            <input
              type="checkbox"
              name={groupEnabledFieldName}
              defaultChecked={dest.groupEnabled}
            />
            {t('tg.groupEnabled')}
          </label>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-1.5">
          <Label>{t('tg.chatIdCurrent')}</Label>
          <p className="rounded-md border border-input bg-muted px-3 py-2 font-mono text-sm">
            {dest.masked ?? t('tg.chatIdNone')}
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor={chatIdFieldName}>{t('tg.chatIdNew')}</Label>
          <Input
            id={chatIdFieldName}
            name={chatIdFieldName}
            placeholder={placeholder}
            disabled={clear}
          />
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              name={chatIdClearFieldName}
              checked={clear}
              onChange={(e) => setClear(e.target.checked)}
            />
            {t('tg.chatIdClear')}
          </label>
        </div>

        <SendNowButton action={testAction} label={t('tg.testConnection')} />
        <LastSendStatus dest={dest} />

        <div className="space-y-3 border-t pt-3">{children}</div>
      </CardContent>
    </Card>
  );
}

export function TelegramForm({
  settings,
  adapter,
}: {
  settings: TelegramSettingsView;
  adapter: string;
}) {
  const { t, m } = useT();
  const [state, formAction] = useActionState<ActionState, FormData>(saveTelegramSettings, null);

  const [morningTime, setMorningTime] = useState(settings.morningTime);
  const [afternoonTime, setAfternoonTime] = useState(settings.afternoonTime);
  const [inventoryTime, setInventoryTime] = useState(settings.inventoryTime);

  const earlyMorning = isBeforeManualEntry('attendance_morning', morningTime);
  const earlyAfternoon = isBeforeManualEntry('attendance_afternoon', afternoonTime);
  const needsConfirm = earlyMorning || earlyAfternoon;

  const formRef = useRef<HTMLFormElement>(null);
  const confirmedRef = useRef(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  // After a successful save, require confirmation again for the next early edit.
  useEffect(() => {
    if (state?.ok) confirmedRef.current = false;
  }, [state]);

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    // Warn (not block) when a report is scheduled before its manual-entry time.
    if (needsConfirm && !confirmedRef.current) {
      e.preventDefault();
      setConfirmOpen(true);
    }
  }

  function saveAnyway() {
    confirmedRef.current = true;
    setConfirmOpen(false);
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} onSubmit={onSubmit} className="space-y-4">
      <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
        {t('tg.adapter')}: <strong>{adapter}</strong>. {t('tg.adapterNote')}
      </p>
      <p className="flex items-center gap-2 rounded-md border border-input px-3 py-2 text-xs">
        <Clock className="h-4 w-4 text-muted-foreground" />
        <span className="text-muted-foreground">{t('tg.timezoneLabel')}:</span>
        <strong>{t('tg.timezone')}</strong>
      </p>

      <div className="grid gap-4 lg:grid-cols-2">
        <DestinationCard
          title={t('tg.attendanceGroup')}
          dest={settings.attendance}
          chatIdFieldName="attendanceChatId"
          chatIdClearFieldName="attendanceChatIdClear"
          groupEnabledFieldName="attendanceGroupEnabled"
          placeholder="-1001234567890"
          testAction={testAttendanceConnection}
        >
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="morningEnabled"
                defaultChecked={settings.morningEnabled}
              />
              {t('tg.morning')}
            </label>
            <Label htmlFor="morningTime" className="text-xs text-muted-foreground">
              {t('tg.reportTime')}
            </Label>
            <Input
              id="morningTime"
              name="morningTime"
              type="time"
              value={morningTime}
              onChange={(e) => setMorningTime(e.target.value)}
              className={earlyMorning ? 'border-warning' : ''}
            />
            {earlyMorning && (
              <p className="flex items-start gap-1 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('tg.earlyWarnMorning')}
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="afternoonEnabled"
                defaultChecked={settings.afternoonEnabled}
              />
              {t('tg.afternoon')}
            </label>
            <Label htmlFor="afternoonTime" className="text-xs text-muted-foreground">
              {t('tg.reportTime')}
            </Label>
            <Input
              id="afternoonTime"
              name="afternoonTime"
              type="time"
              value={afternoonTime}
              onChange={(e) => setAfternoonTime(e.target.value)}
              className={earlyAfternoon ? 'border-warning' : ''}
            />
            {earlyAfternoon && (
              <p className="flex items-start gap-1 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {t('tg.earlyWarnAfternoon')}
              </p>
            )}
          </div>
        </DestinationCard>

        <DestinationCard
          title={t('tg.inventoryGroup')}
          dest={settings.inventory}
          chatIdFieldName="inventoryChatId"
          chatIdClearFieldName="inventoryChatIdClear"
          groupEnabledFieldName="inventoryGroupEnabled"
          placeholder="-1009876543210"
          testAction={testInventoryConnection}
        >
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                name="inventoryEnabled"
                defaultChecked={settings.inventoryEnabled}
              />
              {t('tg.inventory')}
            </label>
            <Label htmlFor="inventoryTime" className="text-xs text-muted-foreground">
              {t('tg.reportTime')}
            </Label>
            <Input
              id="inventoryTime"
              name="inventoryTime"
              type="time"
              value={inventoryTime}
              onChange={(e) => setInventoryTime(e.target.value)}
            />
          </div>
        </DestinationCard>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tg.config')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="reportLanguage">{t('tg.reportLang')}</Label>
            <select
              id="reportLanguage"
              name="reportLanguage"
              className={selectCls}
              defaultValue={settings.reportLanguage}
            >
              <option value="zh">中文 (Chinese)</option>
              <option value="en">English</option>
            </select>
            <p className="text-xs text-muted-foreground">{t('tg.reportLangNote')}</p>
          </div>

          <p className="text-xs text-muted-foreground">{t('tg.scheduleNote')}</p>

          {state?.error && (
            <p className="rounded-md bg-destructive/10 px-3 py-1.5 text-sm text-destructive">
              {m(state.error)}
            </p>
          )}
          {state?.ok && state.message && (
            <p className="rounded-md bg-success/10 px-3 py-1.5 text-sm text-success">
              {m(state.message)}
            </p>
          )}

          <SubmitButton>{t('tg.save')}</SubmitButton>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('tg.sendNow')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t('tg.sendNowDesc')}</p>
          <SendNowButton action={sendMorningNow} label={t('tg.morningAtt')} />
          <SendNowButton action={sendAfternoonNow} label={t('tg.afternoonAtt')} />
          <SendNowButton action={sendInventoryNow} label={t('tg.inventoryReport')} />
        </CardContent>
      </Card>

      {/* Confirmation before saving an unusually-early schedule. */}
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="text-left">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" />
              {t('tg.confirmEarlyTitle')}
            </DialogTitle>
            <DialogDescription>{t('tg.confirmEarlyBody')}</DialogDescription>
          </DialogHeader>
          <ul className="space-y-1 text-sm">
            {earlyMorning && (
              <li>
                • {t('tg.morning')}: <strong>{morningTime}</strong> ({t('tg.beforeEntry')} 07:30)
              </li>
            )}
            {earlyAfternoon && (
              <li>
                • {t('tg.afternoon')}: <strong>{afternoonTime}</strong> ({t('tg.beforeEntry')}{' '}
                12:30)
              </li>
            )}
          </ul>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="button" onClick={saveAnyway}>
              {t('tg.saveAnyway')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
