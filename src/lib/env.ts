/**
 * Centralised, lazily-read environment access.
 *
 * Nothing here throws at import time so that `next build` (which imports these
 * modules) never fails just because a value is unset. Runtime code calls the
 * accessors and gets a clear error only when a genuinely-required secret is
 * missing at the moment it is used.
 */

export function optionalEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.length > 0 ? v : undefined;
}

export function requireEnv(name: string): string {
  const v = optionalEnv(name);
  if (!v) {
    throw new Error(
      `Missing required environment variable "${name}". Copy .env.example to .env.local and fill it in.`,
    );
  }
  return v;
}

/**
 * True when the public Supabase config is present (used to gate UI + middleware).
 *
 * Reads `NEXT_PUBLIC_*` vars as static literal `process.env.X` member
 * expressions (not through `optionalEnv`'s dynamic `process.env[name]`)
 * because Next.js only inlines `NEXT_PUBLIC_*` values into client bundles
 * when it can statically find that exact literal access at build time.
 */
export function isSupabaseConfigured(): boolean {
  return !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

export const env = {
  appTimezone: () => optionalEnv('APP_TIMEZONE') ?? 'Asia/Bangkok',
  appUrl: () => optionalEnv('NEXT_PUBLIC_APP_URL') ?? 'http://localhost:3000',
  // Static literal access required for client-bundle inlining — see
  // isSupabaseConfigured above.
  supabaseUrl: () => process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: () => process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  supabaseServiceRoleKey: () => requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  telegramBotToken: () => optionalEnv('TELEGRAM_BOT_TOKEN'),
  telegramAdapter: () =>
    optionalEnv('TELEGRAM_ADAPTER') ?? (optionalEnv('TELEGRAM_BOT_TOKEN') ? 'http' : 'mock'),
  cronSecret: () => optionalEnv('CRON_SECRET'),
  inventoryReportTime: () => optionalEnv('INVENTORY_REPORT_TIME') ?? '18:00',
};
