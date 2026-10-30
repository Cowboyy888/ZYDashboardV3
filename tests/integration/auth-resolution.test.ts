import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { getCurrentUser, requireUser } from '@/lib/auth';

vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: vi.fn() }));
vi.mock('@/lib/env', () => ({ isSupabaseConfigured: () => true }));
vi.mock('next/navigation', () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

const getUser = vi.fn();
const single = vi.fn();
const profile = {
  id: 'user',
  email: 'user@example.invalid',
  full_name: 'User',
  role: 'viewer',
  is_active: true,
  locale: 'zh',
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  const query = { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single };
  vi.mocked(createSupabaseServerClient).mockResolvedValue({
    auth: { getUser },
    from: () => query,
  } as unknown as Awaited<ReturnType<typeof createSupabaseServerClient>>);
  getUser.mockResolvedValue({ data: { user: { id: 'user' } }, error: null });
  single.mockResolvedValue({ data: profile, error: null });
});

afterEach(async () => {
  await vi.runAllTimersAsync();
  vi.useRealTimers();
});

describe('authentication retry latency and access guards', () => {
  it('retries a transient auth 401 once and returns the verified profile', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { status: 401 } });
    const result = getCurrentUser();
    await vi.advanceTimersByTimeAsync(400);
    expect(await result).toMatchObject({ id: 'user', role: 'viewer', locale: 'zh' });
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(single).toHaveBeenCalledTimes(1);
  });

  it('does not wait another 400ms after the final failed auth attempt', async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { status: 401 } });
    const result = getCurrentUser();
    await vi.advanceTimersByTimeAsync(400);
    expect(getUser).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(await result).toBeNull();
    expect(single).not.toHaveBeenCalled();
  });

  it('does not wait again after the final failed profile lookup', async () => {
    single.mockResolvedValue({ data: null, error: { code: 'PGRST301' } });
    const result = getCurrentUser();
    await vi.advanceTimersByTimeAsync(400);
    expect(single).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
    expect(await result).toBeNull();
  });

  it('does not retry ordinary signed-out sessions or accept unknown roles', async () => {
    getUser.mockResolvedValueOnce({ data: { user: null }, error: null });
    expect(await getCurrentUser()).toBeNull();
    expect(getUser).toHaveBeenCalledTimes(1);
    expect(single).not.toHaveBeenCalled();
    single.mockResolvedValue({ data: { ...profile, role: 'unknown' }, error: null });
    expect(await getCurrentUser()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('continues to reject inactive users', async () => {
    single.mockResolvedValue({ data: { ...profile, is_active: false }, error: null });
    await expect(requireUser()).rejects.toThrow('redirect:/login');
  });
});
