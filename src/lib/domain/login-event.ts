/**
 * Client IP resolution for login_events. `x-vercel-forwarded-for` is Vercel's
 * authoritative header (unlike `x-forwarded-for`, which a proxy in front of
 * Vercel could overwrite); `x-real-ip` is the last fallback. All three are
 * absent outside Vercel (e.g. local dev), which is expected.
 */
export function parseClientIp(headers: { get(name: string): string | null }): string | null {
  const raw =
    headers.get('x-vercel-forwarded-for') ??
    headers.get('x-forwarded-for') ??
    headers.get('x-real-ip');
  if (!raw) return null;
  const first = raw.split(',')[0]?.trim();
  return first ? first : null;
}
