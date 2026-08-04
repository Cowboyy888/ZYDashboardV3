import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { env } from '@/lib/env';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  dispatchScheduledReports,
  runScheduledReport,
  type ReportType,
} from '@/lib/reports/service';
import { businessDate } from '@/lib/domain/datetime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JOB_MAP: Record<string, { type: ReportType; flag: string }> = {
  'attendance-morning': { type: 'attendance_morning', flag: 'morning_enabled' },
  'attendance-afternoon': { type: 'attendance_afternoon', flag: 'afternoon_enabled' },
  inventory: { type: 'inventory', flag: 'inventory_enabled' },
};

/** Constant-time string compare — a plain `===` here leaks timing info an attacker could use to guess the secret byte-by-byte. */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB);
}

function authorized(request: NextRequest): boolean {
  const secret = env.cronSecret();
  if (!secret) return false;
  const header = request.headers.get('authorization');
  if (header && safeEqual(header, `Bearer ${secret}`)) return true;
  // Allow ?secret= for providers that cannot set headers.
  const queryValue = request.nextUrl.searchParams.get('secret');
  return queryValue !== null && safeEqual(queryValue, secret);
}

async function handle(request: NextRequest, job: string) {
  if (!authorized(request)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }

  // Preferred scheduler: a single frequent tick that reads the SAVED times and
  // sends whatever is due now (idempotent, once per Cambodia business date).
  if (job === 'dispatch') {
    try {
      const now = new Date();
      const date = request.nextUrl.searchParams.get('date') || businessDate(now);
      const result = await dispatchScheduledReports(now, date);
      return NextResponse.json({ ok: true, job, ...result });
    } catch (err) {
      console.error('[cron] dispatch failed', err);
      return NextResponse.json(
        { ok: false, job, error: err instanceof Error ? err.message : 'error' },
        { status: 500 },
      );
    }
  }

  const mapping = JOB_MAP[job];
  if (!mapping) {
    return NextResponse.json({ ok: false, error: `Unknown job: ${job}` }, { status: 404 });
  }

  // Respect the enabled flag from settings.
  const admin = createSupabaseAdminClient();
  const { data: settings } = await admin
    .from('telegram_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (settings && settings[mapping.flag] === false) {
    return NextResponse.json({ ok: true, status: 'disabled', job });
  }

  const date = request.nextUrl.searchParams.get('date') || businessDate();
  try {
    const outcome = await runScheduledReport(mapping.type, date);
    return NextResponse.json({ ok: true, job, date, ...outcome });
  } catch (err) {
    console.error('[cron] job failed', job, err);
    return NextResponse.json(
      { ok: false, job, error: err instanceof Error ? err.message : 'error' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  const { job } = await ctx.params;
  return handle(request, job);
}

export async function POST(request: NextRequest, ctx: { params: Promise<{ job: string }> }) {
  const { job } = await ctx.params;
  return handle(request, job);
}
