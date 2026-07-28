# Telegram Runbook

Zysteel sends automated reports to **two independent Telegram groups**, using
**one bot**:

- **Attendance Group** — morning attendance (default **08:00**) and afternoon
  attendance (default **13:00**), plus manual resends of either.
- **Inventory Group** — daily inventory (default **18:00**), manual resends,
  and low-stock alerts (part of the daily report). The message is a
  plain-language stock list grouped by product family (网片 / 盘圆 / 拔丝料,
  each sorted by diameter descending), matching how the factory floor writes
  up daily stock — see `renderInventoryReport` in `src/lib/domain/reports.ts`.
  It does not include supplier or purchase-order information; that lives on
  the Purchasing dashboard instead.

An attendance report can never reach the Inventory Group's chat, and an
inventory report can never reach the Attendance Group's chat — each report
type is routed to exactly one destination in code (`reportGroup()` /
`destinationChatId()` in `src/lib/domain/report-schedule.ts`), proven by
`tests/unit/telegram-destinations.test.ts` and
`tests/integration/telegram-group-routing.test.ts`. If one group has no chat
ID configured (or is switched off), only that group's reports are skipped —
the other group keeps sending normally.

All three send times are **editable in Settings → Telegram** (Owner / System
Admin only) and stored on `telegram_settings` as `morning_time`,
`afternoon_time`, and `inventory_time` (`HH:mm`). All times are
**Asia/Phnom_Penh (Cambodia)**. The scheduler reads these saved times
dynamically — no time is hard-coded in code. The bot token is a **server-only
secret** and is never exposed to the browser; neither is either group's full
chat ID — Settings → Telegram only ever shows a masked value
(`••••1234`) computed server-side.

## Adapters

The app talks to Telegram through a `TelegramClient` interface:

- **mock** (default when `TELEGRAM_BOT_TOKEN` is empty): records messages, makes
  no network calls. Used in dev and tests.
- **http**: the real Bot API, used when a token is present (`TELEGRAM_ADAPTER=http`).

## One-time setup

1. In Telegram, message **@BotFather** → `/newbot` → get the **bot token**.
   One bot is used for both groups.
2. Create (or choose) **two separate Telegram groups** — one for attendance,
   one for inventory — and add the same bot to both. For each group, find its
   **chat id** (e.g. add @RawDataBot to the group temporarily and read the id
   it reports, or call the bot's `getUpdates` endpoint after posting a message
   in the group). Group chat ids look like `-100xxxxxxxxxxx`.
3. Set the bot token in env (server only — never commit real values):

   ```bash
   TELEGRAM_BOT_TOKEN=123456:ABC...       # from BotFather
   TELEGRAM_ADAPTER=http
   ```
4. In the app: **Settings → Telegram** — there are two cards, **Attendance
   Telegram Group** and **Inventory Telegram Group**. For each:
   - Paste the group's chat id into **New chat ID** and save (the field
     always starts blank — leaving it blank keeps whatever is already
     configured; check **Remove this chat ID** to clear it instead).
   - Use **Test connection** to send a small confirmation message and confirm
     the id is correct — the card's **Last sent** / **Last error** reflects
     the result.
   - Use the **Enabled** switch to pause that destination entirely without
     losing its saved chat id.

   Each card's chat id is always shown **masked** (e.g. `••••7890`) — the full
   value never reaches the browser. Also set which reports are enabled and
   each report's send time (`HH:mm`, Asia/Phnom_Penh) — these live inside
   their group's card (morning/afternoon under Attendance, the daily report
   under Inventory). Setting a time earlier than the normal manual-entry time
   (morning **07:30**, afternoon **12:30**) warns and asks for confirmation but
   does not block. Use **Send now** to send each report immediately (admin only).

## Scheduling the reports

### Recommended: one dynamic tick (`/api/cron/dispatch`)

Point a scheduler at **`/api/cron/dispatch`** on a short, fixed interval (e.g.
every 5 minutes). Each tick reads the **saved** report times, works out which
reports are due at the current Asia/Phnom_Penh time and not yet sent today, and
sends them. Because the app owns the times, **you never edit cron when an admin
changes a time**.

```cron
*/5 * * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ops.zysteel.example/api/cron/dispatch
```

Each report still fires **at most once per Cambodia business date**, even if a
time is edited later that same day (guaranteed by `sent_reports`, keyed
`"<type>:<business_date>"`).

### Alternative: one endpoint per report at fixed OS times

If you prefer OS-level scheduling, the per-report endpoints still work (they do
not encode any time themselves):

| Report | Endpoint |
| --- | --- |
| morning attendance | `/api/cron/attendance-morning` |
| afternoon attendance | `/api/cron/attendance-afternoon` |
| daily inventory | `/api/cron/inventory` |

Example (crontab on a box in UTC — 08:00 ICT = 01:00 UTC):

```cron
0 1 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ops.zysteel.example/api/cron/attendance-morning
0 6 * * *  curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ops.zysteel.example/api/cron/attendance-afternoon
0 11 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" https://ops.zysteel.example/api/cron/inventory
```

Every request must send the shared secret:

```
Authorization: Bearer $CRON_SECRET
```

Optional query params: `?date=YYYY-MM-DD` (defaults to today's business date),
`?secret=...` for schedulers that cannot set headers.

## Idempotency, retries & logging

- Each scheduled send is keyed `"<type>:<business_date>"` and recorded in
  `sent_reports`, including which destination (`destination_group`:
  `attendance` or `inventory`) it was routed to. A second run for the same key
  returns **skipped** — **no duplicate is sent**. Safe to retry.
- A **failed** send is *not* recorded as sent, so a later retry can succeed.
- If a group's chat id is not configured (or its switch is off), that group's
  reports return `no_chat` and send nothing — **the other group is
  unaffected**, since each report type resolves only its own group's chat id.
- **Send now** (Settings → Telegram, or the attendance/inventory pages) bypasses
  the idempotency guard so an admin can resend a corrected report; it is still
  logged to `sent_reports` with its destination group.
- **Test connection** (Settings → Telegram) sends a one-off ping to a single
  destination and updates that destination's last status/error; it does not
  affect report idempotency.
- Every run returns JSON (`{ ok, status, … }`) and logs failures server-side.

## Safety

- The bot token and both groups' full chat ids never reach the client bundle.
  Settings → Telegram only ever renders a masked chat id computed server-side;
  the audit log records that settings changed but masks both chat ids too.
- With no token set, the mock adapter guarantees **no real messages** are sent —
  ideal for staging and tests.
