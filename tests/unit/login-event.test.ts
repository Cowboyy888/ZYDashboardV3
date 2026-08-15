import { describe, it, expect } from 'vitest';
import { parseClientIp } from '@/lib/domain/login-event';

describe('parseClientIp', () => {
  it('prefers x-vercel-forwarded-for', () => {
    const h = new Headers({
      'x-vercel-forwarded-for': '1.1.1.1',
      'x-forwarded-for': '2.2.2.2',
      'x-real-ip': '3.3.3.3',
    });
    expect(parseClientIp(h)).toBe('1.1.1.1');
  });

  it('takes the first IP from a comma-separated chain', () => {
    const h = new Headers({ 'x-forwarded-for': '4.4.4.4, 5.5.5.5, 6.6.6.6' });
    expect(parseClientIp(h)).toBe('4.4.4.4');
  });

  it('falls back to x-real-ip', () => {
    const h = new Headers({ 'x-real-ip': '7.7.7.7' });
    expect(parseClientIp(h)).toBe('7.7.7.7');
  });

  it('returns null with no headers (local dev)', () => {
    expect(parseClientIp(new Headers())).toBeNull();
  });
});
